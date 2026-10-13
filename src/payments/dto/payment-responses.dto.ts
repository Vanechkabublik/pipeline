import { ApiProperty } from '@nestjs/swagger';
import { PaymentWebhookDto } from './payment-webhook.dto';

export class CreatePaymentResponseDto {
  @ApiProperty({ example: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f' })
  paymentId: string;
}

export class WebhookResponseDto {
  @ApiProperty({ example: true })
  received: boolean;

  @ApiProperty({
    example: false,
    description:
      'true — событие с этим eventId уже обрабатывалось, ничего не изменено',
  })
  duplicate: boolean;
}

export class SimulateResponseDto {
  @ApiProperty({ type: PaymentWebhookDto, description: 'Отправленное событие' })
  event: PaymentWebhookDto;

  @ApiProperty({ example: 200, description: 'HTTP-статус ответа вебхука' })
  webhookStatus: number;

  @ApiProperty({ type: WebhookResponseDto })
  webhookResponse: WebhookResponseDto;
}
