import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Booking, BookingStatus } from '../bookings/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { Payment, PaymentStatus } from './payment.entity';
import { WebhookDto } from './payments.dto';
import { WebhookEvent } from './webhook-event.entity';

@Injectable()
export class PaymentsService {
  constructor(
    private dataSource: DataSource,
    @InjectRepository(Payment) private payments: Repository<Payment>,
    private bookingsService: BookingsService,
  ) {}

  async create(userId: string, bookingId: string) {
    const booking = await this.dataSource.manager.findOneBy(Booking, {
      id: bookingId,
      userId,
    });
    if (!booking) throw new NotFoundException('Бронь не найдена');
    if (
      booking.status !== BookingStatus.RESERVED ||
      booking.expiresAt < new Date()
    ) {
      throw new ConflictException('Эту бронь уже нельзя оплатить');
    }
    const payment = await this.payments.save(
      this.payments.create({ bookingId, amount: booking.amount }),
    );
    return { paymentId: payment.id };
  }

  // Подпись вебхука = HMAC-SHA256 от сырого тела запроса с секретом WEBHOOK_SECRET
  sign(body: string | Buffer) {
    return createHmac('sha256', process.env.WEBHOOK_SECRET!)
      .update(body)
      .digest('hex');
  }

  handleWebhook(dto: WebhookDto) {
    return this.dataSource.transaction(async (m) => {
      // eventId — первичный ключ. Если такое событие уже было, вставка ничего не вставит
      // (ON CONFLICT DO NOTHING) — значит, это повтор, ничего не делаем.
      const inserted = await m
        .createQueryBuilder()
        .insert()
        .into(WebhookEvent)
        .values({ eventId: dto.eventId })
        .orIgnore()
        .returning(['eventId'])
        .execute();
      if (inserted.raw.length === 0) return { ok: true, duplicate: true };

      const payment = await m.findOne(Payment, {
        where: { id: dto.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) throw new NotFoundException('Платёж не найден');
      if (payment.status !== PaymentStatus.PENDING) return { ok: true };

      const booking = (await this.bookingsService.lock(m, payment.bookingId))!;

      if (dto.status === 'failed' || dto.amount !== booking.amount) {
        payment.status = PaymentStatus.FAILED;
      } else if (
        booking.status === BookingStatus.RESERVED &&
        booking.expiresAt > new Date()
      ) {
        await this.bookingsService.markPaid(m, booking);
        payment.status = PaymentStatus.SUCCEEDED;
      } else {
        // Деньги пришли, а бронь уже истекла: бронь не воскрешаем, деньги надо вернуть
        if (booking.status === BookingStatus.RESERVED)
          await this.bookingsService.expire(m, booking);
        payment.status = PaymentStatus.REFUND_REQUIRED;
      }
      await m.save(payment);
      return { ok: true };
    });
  }

  // Для разработки: сами собираем подписанный вебхук «оплачено» и отправляем его себе же
  async simulate(paymentId: string, baseUrl: string) {
    const payment = await this.payments.findOneBy({ id: paymentId });
    if (!payment) throw new NotFoundException('Платёж не найден');

    const body = JSON.stringify({
      eventId: randomUUID(),
      paymentId,
      status: 'succeeded',
      amount: payment.amount,
    });
    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': this.sign(body),
      },
      body,
    });
    return res.json();
  }
}
