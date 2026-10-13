import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'node:crypto';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { Box, BoxStatus } from '../boxes/box.entity';
import { isUniqueViolation } from '../common/db-errors';
import { ErrorCode } from '../common/error-codes';
import { User } from '../users/user.entity';
import { VenueStatus } from '../venues/venue.entity';
import { VenuesService } from '../venues/venues.service';
import { Booking, BookingStatus } from './booking.entity';
import { assertBookingTransition } from './booking-status';
import { CreateBookingDto } from './dto/create-booking.dto';
import { IdempotencyKey } from './idempotency-key.entity';

/** Сколько активных (RESERVED или PAID) броней может быть у одного пользователя */
export const MAX_ACTIVE_BOOKINGS = 2;

/** Выдача разрешена за 15 минут до начала окна и 15 минут после его конца */
export const PICKUP_GRACE_MINUTES = 15;

/** Ответ POST /bookings: статус и тело — их же сохраняем для Idempotency-Key */
export interface BookingResponse {
  status: number;
  body: object;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly venuesService: VenuesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Создание брони. Всё — в одной транзакции: если любой шаг упадёт,
   * откатятся и списание остатка, и сама бронь, и сохранённый ключ идемпотентности.
   */
  async create(
    userId: string,
    dto: CreateBookingDto,
    idempotencyKey: string,
  ): Promise<BookingResponse> {
    // Отпечаток тела запроса: тот же ключ + то же тело = повтор, другое тело = ошибка клиента
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ boxId: dto.boxId, quantity: dto.quantity }))
      .digest('hex');

    try {
      return await this.dataSource.transaction(async (manager) => {
        // 1. Блокируем строку пользователя (SELECT ... FOR UPDATE) до конца транзакции.
        //    Все брони одного пользователя теперь выполняются строго по очереди. Это нужно:
        //    - для лимита: иначе два параллельных запроса оба насчитают «1 активная бронь»
        //      и оба создадут новую — получится 3;
        //    - для идемпотентности: повтор с тем же ключом дождётся окончания первого
        //      запроса и увидит его сохранённый ответ, а не создаст вторую бронь.
        await manager.findOne(User, {
          where: { id: userId },
          lock: { mode: 'pessimistic_write' },
        });

        // 2. Idempotency-Key: этот запрос уже выполнялся?
        const saved = await manager.findOneBy(IdempotencyKey, {
          key: idempotencyKey,
        });
        if (saved) {
          if (saved.userId !== userId || saved.requestHash !== requestHash) {
            throw this.idempotencyKeyReused();
          }
          return { status: saved.responseStatus, body: saved.responseBody };
        }

        // 3. Предварительные проверки — ради понятных кодов ошибок.
        //    Настоящую гарантию остатка даёт атомарный UPDATE на шаге 4.
        const box = await manager.findOne(Box, {
          where: { id: dto.boxId },
          relations: { venue: true },
        });
        if (!box) {
          throw new NotFoundException({
            code: ErrorCode.BOX_NOT_FOUND,
            message: 'Бокс не найден',
          });
        }
        const memberRole = await this.venuesService.getMemberRole(
          userId,
          box.venueId,
          manager,
        );
        if (memberRole) {
          throw new ForbiddenException({
            code: ErrorCode.OWN_VENUE_BOOKING,
            message: 'Нельзя бронировать боксы своего заведения',
          });
        }
        if (
          box.status === BoxStatus.DRAFT ||
          box.status === BoxStatus.CLOSED ||
          box.venue.status !== VenueStatus.ACTIVE ||
          box.pickupEnd.getTime() <= Date.now()
        ) {
          throw new ConflictException({
            code: ErrorCode.BOX_NOT_AVAILABLE,
            message: 'Бокс недоступен для бронирования',
          });
        }
        const activeCount = await manager.count(Booking, {
          where: {
            userId,
            status: In([BookingStatus.RESERVED, BookingStatus.PAID]),
          },
        });
        if (activeCount >= MAX_ACTIVE_BOOKINGS) {
          throw new ConflictException({
            code: ErrorCode.RESERVATION_LIMIT,
            message: `Нельзя иметь больше ${MAX_ACTIVE_BOOKINGS} активных броней`,
          });
        }

        // 4. Списание остатка ОДНИМ атомарным запросом:
        //      UPDATE boxes SET quantity = quantity - :quantity
        //      WHERE id = :id AND status = 'PUBLISHED' AND quantity >= :quantity
        //      RETURNING quantity, price
        //    Проверка остатка и списание происходят внутри одного UPDATE, поэтому
        //    «прочитали 1 → оба списали → получили -1» невозможно. Postgres блокирует
        //    строку бокса: параллельный запрос ждёт, а после коммита первого заново
        //    проверяет WHERE уже на новых данных — и получает 0 затронутых строк.
        const result = await manager
          .createQueryBuilder()
          .update(Box)
          .set({ quantity: () => 'quantity - :quantity' })
          .where('id = :id', { id: box.id })
          .andWhere('status = :status', { status: BoxStatus.PUBLISHED })
          .andWhere('quantity >= :quantity', { quantity: dto.quantity })
          .returning(['quantity', 'price'])
          .execute();

        if (result.affected === 0) {
          throw new ConflictException({
            code: ErrorCode.BOX_SOLD_OUT,
            message: 'Бокс закончился',
          });
        }
        const updated = (
          result.raw as Array<{ quantity: number; price: number }>
        )[0];

        // Последний бокс забрали — снимаем с продажи (строка уже заблокирована нашим UPDATE)
        if (updated.quantity === 0) {
          await manager.update(
            Box,
            { id: box.id },
            { status: BoxStatus.SOLD_OUT },
          );
        }

        // 5. Сама бронь. Сумма фиксируется сейчас — по цене из того же UPDATE.
        const holdSeconds = this.config.getOrThrow<number>(
          'BOOKING_HOLD_SECONDS',
        );
        const booking = await manager.save(
          manager.create(Booking, {
            userId,
            boxId: box.id,
            quantity: dto.quantity,
            amount: updated.price * dto.quantity,
            status: BookingStatus.RESERVED,
            expiresAt: new Date(Date.now() + holdSeconds * 1000),
            pickupCode: null,
          }),
        );

        // 6. Запоминаем ответ под ключом идемпотентности — в той же транзакции,
        //    чтобы не было брони без ключа или ключа без брони.
        const response: BookingResponse = { status: 201, body: { ...booking } };
        await manager.insert(IdempotencyKey, {
          key: idempotencyKey,
          userId,
          requestHash,
          responseStatus: response.status,
          responseBody: response.body,
        });
        return response;
      });
    } catch (error) {
      // Редкий случай: один и тот же ключ одновременно прислали РАЗНЫЕ пользователи.
      // Блокировки у них разные, оба дошли до шага 6, и второй упёрся в PRIMARY KEY.
      if (isUniqueViolation(error)) {
        throw this.idempotencyKeyReused();
      }
      throw error;
    }
  }

  findMy(userId: string): Promise<Booking[]> {
    return this.bookingsRepository.find({
      where: { userId },
      relations: { box: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Клиент отменяет свою бронь: RESERVED → CANCELLED, остаток возвращается */
  cancel(userId: string, bookingId: string): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      const booking = await this.lockBooking(manager, bookingId);
      // Чужая бронь для клиента «не существует» — не раскрываем чужие id
      if (!booking || booking.userId !== userId) {
        throw this.bookingNotFound();
      }
      const cancelled = await this.changeStatus(
        manager,
        booking,
        BookingStatus.CANCELLED,
      );
      await this.releaseQuantity(manager, booking.boxId, booking.quantity);
      return cancelled;
    });
  }

  /**
   * Выдача заказа по коду: PAID → PICKED_UP.
   * Доступно только OWNER/STAFF заведения и только в окне выдачи ± 15 минут.
   */
  async pickup(
    userId: string,
    venueId: string,
    code: string,
  ): Promise<Booking> {
    await this.venuesService.assertMember(userId, venueId);

    return this.dataSource.transaction(async (manager) => {
      // Ищем бронь с этим кодом среди броней ЭТОГО заведения.
      // Код брони другого заведения сюда не попадёт → 404.
      const found = await manager
        .createQueryBuilder(Booking, 'booking')
        .innerJoin('booking.box', 'box')
        .where('booking.pickupCode = :code', { code })
        .andWhere('box.venueId = :venueId', { venueId })
        .orderBy('booking.createdAt', 'DESC')
        .getOne();
      if (!found) {
        throw this.bookingNotFound();
      }

      const booking = (await this.lockBooking(manager, found.id)) as Booking;
      const box = await manager.findOneByOrFail(Box, { id: booking.boxId });

      const graceMs = PICKUP_GRACE_MINUTES * 60_000;
      const now = Date.now();
      if (
        now < box.pickupStart.getTime() - graceMs ||
        now > box.pickupEnd.getTime() + graceMs
      ) {
        throw new ConflictException({
          code: ErrorCode.OUTSIDE_PICKUP_WINDOW,
          message: 'Сейчас не время выдачи этого бокса',
          details: { pickupStart: box.pickupStart, pickupEnd: box.pickupEnd },
        });
      }

      return this.changeStatus(manager, booking, BookingStatus.PICKED_UP);
    });
  }

  /**
   * Cron раз в минуту: просроченные RESERVED → EXPIRED, остаток возвращается в бокс.
   * Каждая бронь — в своей транзакции: смена статуса и возврат остатка
   * либо происходят вместе, либо не происходят вовсе.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdueBookings(): Promise<number> {
    // За один запуск — не больше 100 броней, остальные подберёт следующий запуск
    const overdue = await this.bookingsRepository.find({
      select: { id: true },
      where: {
        status: BookingStatus.RESERVED,
        expiresAt: LessThan(new Date()),
      },
      take: 100,
    });

    let expiredCount = 0;
    for (const { id } of overdue) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const booking = await this.lockBooking(manager, id);
          // Пока мы дошли до этой брони, её могли успеть оплатить или отменить —
          // после блокировки проверяем статус ещё раз
          if (
            booking?.status === BookingStatus.RESERVED &&
            booking.expiresAt.getTime() < Date.now()
          ) {
            await this.expireBooking(manager, booking);
            expiredCount++;
          }
        });
      } catch (error) {
        // Ошибка с одной бронью не должна останавливать обработку остальных
        this.logger.error(`Не удалось завершить бронь ${id}`, error);
      }
    }

    if (expiredCount > 0) {
      this.logger.log(`Истекло броней: ${expiredCount}`);
    }
    return expiredCount;
  }

  // ---------------------------------------------------------------------------
  // Методы ниже вызываются внутри чужих транзакций (в т. ч. из PaymentsService),
  // поэтому принимают EntityManager этой транзакции.
  // ---------------------------------------------------------------------------

  /**
   * Читает бронь с блокировкой строки (SELECT ... FOR UPDATE) до конца транзакции.
   * Параллельные операции с той же бронью (оплата, отмена, cron, выдача) ждут
   * и потом видят уже новый статус — одну бронь не изменят дважды.
   */
  lockBooking(manager: EntityManager, id: string): Promise<Booking | null> {
    return manager.findOne(Booking, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * ЕДИНСТВЕННОЕ место, где меняется статус брони.
   * Сначала проверяет переход по карте BOOKING_STATUS_TRANSITIONS
   * (недопустимый → 409 INVALID_STATUS_TRANSITION), потом сохраняет.
   * Бронь должна быть заблокирована через lockBooking() в этой же транзакции.
   */
  async changeStatus(
    manager: EntityManager,
    booking: Booking,
    to: BookingStatus,
    changes: Partial<Pick<Booking, 'pickupCode'>> = {},
  ): Promise<Booking> {
    assertBookingTransition(booking.status, to);
    await manager.update(
      Booking,
      { id: booking.id },
      { status: to, ...changes },
    );
    return Object.assign(booking, { status: to, ...changes });
  }

  /** RESERVED → EXPIRED и возврат остатка. Используют cron и обработка платежей */
  async expireBooking(
    manager: EntityManager,
    booking: Booking,
  ): Promise<Booking> {
    const expired = await this.changeStatus(
      manager,
      booking,
      BookingStatus.EXPIRED,
    );
    await this.releaseQuantity(manager, booking.boxId, booking.quantity);
    return expired;
  }

  /** RESERVED → PAID с новым кодом выдачи. Вызывается из обработки вебхука */
  async markPaid(manager: EntityManager, booking: Booking): Promise<Booking> {
    const box = await manager.findOneByOrFail(Box, { id: booking.boxId });
    const pickupCode = await this.generatePickupCode(manager, box.venueId);
    return this.changeStatus(manager, booking, BookingStatus.PAID, {
      pickupCode,
    });
  }

  /** Возвращает остаток в бокс; распроданный бокс снова появляется в продаже */
  private async releaseQuantity(
    manager: EntityManager,
    boxId: string,
    quantity: number,
  ): Promise<void> {
    // UPDATE boxes SET quantity = quantity + :quantity — атомарно, без «прочитать → записать»
    await manager.increment(Box, { id: boxId }, 'quantity', quantity);
    await manager.update(
      Box,
      { id: boxId, status: BoxStatus.SOLD_OUT },
      { status: BoxStatus.PUBLISHED },
    );
  }

  /**
   * Случайный 6-значный код. Он должен быть уникальным среди ОПЛАЧЕННЫХ броней
   * заведения — иначе на выдаче было бы непонятно, чей это заказ.
   * randomInt из node:crypto — криптостойкий, код нельзя угадать по предыдущим.
   */
  private async generatePickupCode(
    manager: EntityManager,
    venueId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const taken = await manager
        .createQueryBuilder(Booking, 'booking')
        .innerJoin('booking.box', 'box')
        .where('booking.pickupCode = :code', { code })
        .andWhere('booking.status = :status', { status: BookingStatus.PAID })
        .andWhere('box.venueId = :venueId', { venueId })
        .getExists();
      if (!taken) {
        return code;
      }
    }
    throw new Error('Не удалось подобрать свободный код выдачи');
  }

  private bookingNotFound() {
    return new NotFoundException({
      code: ErrorCode.BOOKING_NOT_FOUND,
      message: 'Бронь не найдена',
    });
  }

  private idempotencyKeyReused() {
    return new UnprocessableEntityException({
      code: ErrorCode.IDEMPOTENCY_KEY_REUSED,
      message: 'Этот Idempotency-Key уже использован для другого запроса',
    });
  }
}
