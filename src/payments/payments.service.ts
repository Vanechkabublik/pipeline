import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { DataSource, Repository } from 'typeorm';
import { Booking, BookingStatus } from '../bookings/booking.entity';
import { assertBookingTransition } from '../bookings/booking-status';
import { BookingsService } from '../bookings/bookings.service';
import { ErrorCode } from '../common/error-codes';
import {
  CreatePaymentResponseDto,
  SimulateResponseDto,
  WebhookResponseDto,
} from './dto/payment-responses.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { Payment, PaymentStatus } from './payment.entity';
import { WebhookEvent } from './webhook-event.entity';
import { signPayload } from './webhook-signature';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    private readonly bookingsService: BookingsService,
    private readonly config: ConfigService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  /**
   * POST /bookings/:id/pay — создаём попытку оплаты (PENDING).
   * В реальной жизни здесь был бы запрос к провайдеру и ссылка на форму оплаты;
   * результат оплаты провайдер потом пришлёт вебхуком.
   */
  async createPayment(
    userId: string,
    bookingId: string,
  ): Promise<CreatePaymentResponseDto> {
    const booking = await this.dataSource.manager.findOneBy(Booking, {
      id: bookingId,
    });
    if (!booking || booking.userId !== userId) {
      throw new NotFoundException({
        code: ErrorCode.BOOKING_NOT_FOUND,
        message: 'Бронь не найдена',
      });
    }
    // Заранее проверяем по той же карте переходов, что бронь вообще может стать PAID
    assertBookingTransition(booking.status, BookingStatus.PAID);
    if (booking.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException({
        code: ErrorCode.BOOKING_EXPIRED,
        message: 'Время на оплату брони истекло',
      });
    }

    const payment = await this.paymentsRepository.save(
      this.paymentsRepository.create({
        bookingId: booking.id,
        amount: booking.amount,
        status: PaymentStatus.PENDING,
      }),
    );
    return { paymentId: payment.id };
  }

  /**
   * Обработка вебхука. Подпись уже проверил WebhookSignatureGuard.
   * Всё в одной транзакции: запись eventId, смена статусов платежа и брони
   * сохраняются вместе или не сохраняются вовсе.
   */
  processWebhook(event: PaymentWebhookDto): Promise<WebhookResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Идемпотентность. INSERT ... ON CONFLICT DO NOTHING RETURNING "eventId":
      //    если такой eventId уже есть (конфликт по PRIMARY KEY), строка не вставится
      //    и RETURNING вернёт пустой список → событие уже обработано, выходим.
      //    Два одновременных одинаковых события: второй INSERT дождётся коммита
      //    первого и тоже получит конфликт.
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(WebhookEvent)
        .values({ eventId: event.eventId })
        .orIgnore()
        .returning(['eventId'])
        .execute();
      if ((inserted.raw as unknown[]).length === 0) {
        return { received: true, duplicate: true };
      }

      // 2. Платёж — с блокировкой строки: разные события по одному платежу идут по очереди.
      //    Если платежа нет, исключение откатит транзакцию вместе с записью eventId,
      //    и повтор этого события провайдером обработается заново.
      const payment = await manager.findOne(Payment, {
        where: { id: event.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) {
        throw new NotFoundException({
          code: ErrorCode.PAYMENT_NOT_FOUND,
          message: 'Платёж не найден',
        });
      }
      // Платёж уже в конечном статусе (пришло другое событие по нему) — ничего не меняем
      if (payment.status !== PaymentStatus.PENDING) {
        return { received: true, duplicate: false };
      }

      const booking = await this.bookingsService.lockBooking(
        manager,
        payment.bookingId,
      );
      if (!booking) {
        throw new Error(`Бронь ${payment.bookingId} платежа не найдена`);
      }

      if (event.status === 'failed') {
        // Оплата не прошла. Бронь остаётся RESERVED — клиент может попробовать ещё раз
        payment.status = PaymentStatus.FAILED;
      } else if (event.amount !== booking.amount) {
        // Списали не ту сумму, что зафиксирована в брони, — оплату не засчитываем
        payment.status = PaymentStatus.FAILED;
      } else if (
        booking.status === BookingStatus.RESERVED &&
        booking.expiresAt.getTime() > Date.now()
      ) {
        await this.bookingsService.markPaid(manager, booking);
        payment.status = PaymentStatus.SUCCEEDED;
      } else {
        // Деньги пришли, но бронь уже не оплатить: истекла, отменена или оплачена
        // другим платежом. Бронь НЕ воскрешаем — её остаток мог уже уйти другому
        // клиенту. Помечаем платёж: деньги нужно вернуть.
        if (booking.status === BookingStatus.RESERVED) {
          // Срок вышел, но cron ещё не успел её закрыть — закрываем сейчас
          await this.bookingsService.expireBooking(manager, booking);
        }
        payment.status = PaymentStatus.REFUND_REQUIRED;
      }

      await manager.save(payment);
      return { received: true, duplicate: false };
    });
  }

  /**
   * Только для разработки: сам формирует событие «оплата прошла», подписывает его
   * секретом и отправляет настоящим HTTP-запросом на собственный /payments/webhook —
   * ровно как это сделал бы провайдер. Так через Swagger проверяется весь путь,
   * включая проверку подписи.
   */
  async simulateSuccess(paymentId: string): Promise<SimulateResponseDto> {
    const payment = await this.paymentsRepository.findOneBy({ id: paymentId });
    if (!payment) {
      throw new NotFoundException({
        code: ErrorCode.PAYMENT_NOT_FOUND,
        message: 'Платёж не найден',
      });
    }

    const event: PaymentWebhookDto = {
      eventId: `evt_sim_${randomUUID()}`,
      paymentId: payment.id,
      status: 'succeeded',
      amount: payment.amount,
    };
    const rawBody = JSON.stringify(event);
    const signature = signPayload(
      rawBody,
      this.config.getOrThrow<string>('WEBHOOK_SECRET'),
    );

    // Порт, на котором сейчас слушает это же приложение
    const server = this.httpAdapterHost.httpAdapter.getHttpServer() as {
      address(): AddressInfo;
    };
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/payments/webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        body: rawBody,
      },
    );

    return {
      event,
      webhookStatus: response.status,
      webhookResponse: (await response.json()) as WebhookResponseDto,
    };
  }
}
