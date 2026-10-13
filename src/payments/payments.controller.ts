import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import {
  CreatePaymentResponseDto,
  SimulateResponseDto,
  WebhookResponseDto,
} from './dto/payment-responses.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { PaymentsService } from './payments.service';
import { WebhookSignatureGuard } from './webhook-signature.guard';

/**
 * Маршруты оплаты. Без общего префикса: POST /bookings/:id/pay логически
 * про оплату, поэтому живёт здесь (PaymentsModule зависит от BookingsModule,
 * а не наоборот — так нет циклической зависимости модулей).
 */
@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('bookings/:id/pay')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Начать оплату брони: создаёт платёж PENDING',
    description:
      'Результат оплаты придёт вебхуком. Для ручной проверки вызовите ' +
      'POST /payments/dev/simulate/{paymentId}.',
  })
  @ApiCreatedResponse({ type: CreatePaymentResponseDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'BOOKING_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description:
      'INVALID_STATUS_TRANSITION (бронь не RESERVED), BOOKING_EXPIRED',
    type: ErrorResponseDto,
  })
  pay(
    @Param('id', ParseUUIDPipe) bookingId: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.createPayment(user.id, bookingId);
  }

  @Post('payments/webhook')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookSignatureGuard)
  @ApiOperation({
    summary: 'Вебхук платёжного провайдера',
    description:
      'Заголовок X-Signature = hex(HMAC-SHA256(сырое тело запроса, WEBHOOK_SECRET)). ' +
      'Повторное событие с тем же eventId → 200 без изменений.',
  })
  @ApiHeader({ name: 'X-Signature', required: true })
  @ApiOkResponse({ type: WebhookResponseDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'INVALID_SIGNATURE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'PAYMENT_NOT_FOUND',
    type: ErrorResponseDto,
  })
  webhook(@Body() event: PaymentWebhookDto) {
    return this.paymentsService.processWebhook(event);
  }

  @Post('payments/dev/simulate/:paymentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[только dev] Сымитировать успешную оплату',
    description:
      'Формирует корректно подписанный вебхук succeeded и отправляет его на ' +
      '/payments/webhook. При NODE_ENV=production отвечает 404.',
  })
  @ApiOkResponse({ type: SimulateResponseDto })
  @ApiResponse({
    status: 404,
    description: 'PAYMENT_NOT_FOUND или production-режим',
    type: ErrorResponseDto,
  })
  simulate(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    // В production этого маршрута «нет»: иначе любой мог бы бесплатно «оплатить» бронь
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    return this.paymentsService.simulateSuccess(paymentId);
  }
}
