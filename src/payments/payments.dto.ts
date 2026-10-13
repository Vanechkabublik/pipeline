import { IsIn, IsInt, IsNotEmpty, IsUUID } from 'class-validator';

// Тело вебхука от платёжного провайдера
export class WebhookDto {
  @IsNotEmpty()
  eventId: string;

  @IsUUID()
  paymentId: string;

  @IsIn(['succeeded', 'failed'])
  status: 'succeeded' | 'failed';

  @IsInt()
  amount: number;
}
