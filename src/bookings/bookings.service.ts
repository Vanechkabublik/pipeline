import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { Box, BoxStatus } from '../boxes/box.entity';
import { User } from '../users/user.entity';
import { VenueMember } from '../venues/venue-member.entity';
import { Booking, BookingStatus } from './booking.entity';
import { CreateBookingDto } from './bookings.dto';
import { IdempotencyKey } from './idempotency-key.entity';

const { RESERVED, PAID, PICKED_UP, EXPIRED, CANCELLED } = BookingStatus;

// Куда можно перейти из каждого статуса. Все смены статуса — только через changeStatus()
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  RESERVED: [PAID, EXPIRED, CANCELLED],
  PAID: [PICKED_UP],
  PICKED_UP: [],
  EXPIRED: [],
  CANCELLED: [],
};

@Injectable()
export class BookingsService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Booking) private bookings: Repository<Booking>,
  ) {}

  create(userId: string, dto: CreateBookingDto, idempotencyKey: string) {
    const requestHash = createHash('sha256')
      .update(`${dto.boxId}:${dto.quantity}`)
      .digest('hex');

    return this.dataSource.transaction(async (m) => {
      // Блокируем строку пользователя (SELECT ... FOR UPDATE): брони одного человека идут по очереди.
      // Без этого два одновременных запроса обойдут лимит в 2 брони и проверку Idempotency-Key.
      await m.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      // Повтор запроса с тем же ключом — возвращаем сохранённый ответ, новую бронь не создаём
      const saved = await m.findOneBy(IdempotencyKey, { key: idempotencyKey });
      if (saved) {
        if (saved.userId !== userId || saved.requestHash !== requestHash) {
          throw new UnprocessableEntityException(
            'Этот Idempotency-Key уже использован для другого запроса',
          );
        }
        return saved.responseBody;
      }

      const box = await m.findOneBy(Box, { id: dto.boxId });
      if (!box) throw new NotFoundException('Бокс не найден');
      if (await m.existsBy(VenueMember, { userId, venueId: box.venueId })) {
        throw new ForbiddenException('Нельзя бронировать в своём заведении');
      }
      if (
        (await m.countBy(Booking, { userId, status: In([RESERVED, PAID]) })) >=
        2
      ) {
        throw new ConflictException('Не больше 2 активных броней');
      }

      // Списываем остаток ОДНИМ запросом — проверка и списание происходят атомарно.
      // Если 20 человек жмут одновременно, Postgres блокирует строку бокса: остальные ждут,
      // а после коммита первого заново проверяют WHERE и уже не находят остатка.
      const result = await m
        .createQueryBuilder()
        .update(Box)
        .set({ quantity: () => 'quantity - :q' })
        .where(
          `id = :id AND status = 'PUBLISHED' AND quantity >= :q AND "pickupEnd" > now()`,
          {
            id: box.id,
            q: dto.quantity,
          },
        )
        .returning(['quantity'])
        .execute();
      if (result.affected === 0) throw new ConflictException('Бокс закончился');
      if (result.raw[0].quantity === 0) {
        await m.update(Box, box.id, { status: BoxStatus.SOLD_OUT });
      }

      const holdSeconds = Number(process.env.BOOKING_HOLD_SECONDS ?? 600);
      const booking = await m.save(
        m.create(Booking, {
          userId,
          boxId: box.id,
          quantity: dto.quantity,
          amount: box.price * dto.quantity,
          expiresAt: new Date(Date.now() + holdSeconds * 1000),
        }),
      );

      // Запоминаем ответ под ключом — в той же транзакции, что и бронь
      await m.insert(IdempotencyKey, {
        key: idempotencyKey,
        userId,
        requestHash,
        responseStatus: 201,
        responseBody: booking,
      });
      return booking;
    });
  }

  findMy(userId: string) {
    return this.bookings.find({
      where: { userId },
      relations: { box: true },
      order: { createdAt: 'DESC' },
    });
  }

  cancel(userId: string, id: string) {
    return this.dataSource.transaction(async (m) => {
      const booking = await this.lock(m, id);
      if (!booking || booking.userId !== userId)
        throw new NotFoundException('Бронь не найдена');
      await this.changeStatus(m, booking, CANCELLED);
      await this.returnToBox(m, booking);
      return booking;
    });
  }

  async pickup(userId: string, venueId: string, code: string) {
    if (
      !(await this.dataSource.manager.existsBy(VenueMember, {
        userId,
        venueId,
      }))
    ) {
      throw new ForbiddenException(
        'Выдавать заказы могут только сотрудники заведения',
      );
    }

    return this.dataSource.transaction(async (m) => {
      // Ищем бронь с этим кодом только среди броней этого заведения
      const found = await m
        .createQueryBuilder(Booking, 'booking')
        .innerJoinAndSelect('booking.box', 'box')
        .where('booking.pickupCode = :code AND box.venueId = :venueId', {
          code,
          venueId,
        })
        .orderBy('booking.createdAt', 'DESC')
        .getOne();
      if (!found) throw new NotFoundException('Бронь с таким кодом не найдена');

      const now = Date.now();
      const grace = 15 * 60 * 1000; // ±15 минут к окну выдачи
      if (
        now < found.box.pickupStart.getTime() - grace ||
        now > found.box.pickupEnd.getTime() + grace
      ) {
        throw new ConflictException('Сейчас не время выдачи этого бокса');
      }

      const booking = (await this.lock(m, found.id))!;
      await this.changeStatus(m, booking, PICKED_UP);
      return booking;
    });
  }

  // Раз в минуту: просроченные неоплаченные брони → EXPIRED, товар возвращается в бокс
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdue() {
    const overdue = await this.bookings.findBy({
      status: RESERVED,
      expiresAt: LessThan(new Date()),
    });
    for (const { id } of overdue) {
      await this.dataSource.transaction(async (m) => {
        const booking = await this.lock(m, id);
        // Пока дошли до неё, бронь могли оплатить или отменить — проверяем ещё раз
        if (booking?.status === RESERVED) await this.expire(m, booking);
      });
    }
  }

  // --- Вспомогательные методы (используются и в PaymentsService) ---

  // SELECT ... FOR UPDATE: пока транзакция не закончится, другие не смогут менять эту бронь
  lock(m: EntityManager, id: string) {
    return m.findOne(Booking, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async changeStatus(m: EntityManager, booking: Booking, to: BookingStatus) {
    if (!TRANSITIONS[booking.status].includes(to)) {
      throw new ConflictException(
        `Нельзя перевести бронь из ${booking.status} в ${to}`,
      );
    }
    booking.status = to;
    await m.save(booking);
  }

  async markPaid(m: EntityManager, booking: Booking) {
    booking.pickupCode = randomInt(0, 1_000_000).toString().padStart(6, '0'); // 6 случайных цифр
    await this.changeStatus(m, booking, PAID);
  }

  async expire(m: EntityManager, booking: Booking) {
    await this.changeStatus(m, booking, EXPIRED);
    await this.returnToBox(m, booking);
  }

  private async returnToBox(m: EntityManager, booking: Booking) {
    // quantity = quantity + N — тоже атомарно, без «прочитать → записать»
    await m.increment(Box, { id: booking.boxId }, 'quantity', booking.quantity);
    await m.update(
      Box,
      { id: booking.boxId, status: BoxStatus.SOLD_OUT },
      { status: BoxStatus.PUBLISHED },
    );
  }
}
