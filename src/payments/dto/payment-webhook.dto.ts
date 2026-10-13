import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const WEBHOOK_STATUSES = ['succeeded', 'failed'] as const;
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

/** Тело вебхука от платёжного провайдера */
export class PaymentWebhookDto {
  @ApiProperty({
    example: 'evt_8f14e45f',
    description: 'Уникальный id события у провайдера',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventId: string;

  @ApiProperty({ example: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f' })
  @IsUUID()
  paymentId: string;

  @ApiProperty({ enum: WEBHOOK_STATUSES, example: 'succeeded' })
  @IsIn(WEBHOOK_STATUSES)
  status: WebhookStatus;

  @ApiProperty({ example: 25000, description: 'Сколько списано, копейки' })
  @IsInt()
  @Min(0)
  amount: number;
}
