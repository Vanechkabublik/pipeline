import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsModule } from '../bookings/bookings.module';
import { Payment } from './payment.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhookEvent } from './webhook-event.entity';
import { WebhookSignatureGuard } from './webhook-signature.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, WebhookEvent]), BookingsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WebhookSignatureGuard],
})
export class PaymentsModule {}
