import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenuesModule } from '../venues/venues.module';
import { Booking } from './booking.entity';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { IdempotencyKey } from './idempotency-key.entity';
import { PickupController } from './pickup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, IdempotencyKey]), VenuesModule],
  controllers: [BookingsController, PickupController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
