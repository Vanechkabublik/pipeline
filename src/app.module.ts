import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { BoxesModule } from './boxes/boxes.module';
import { dataSourceOptions } from './data-source';
import { PaymentsModule } from './payments/payments.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(dataSourceOptions),
    ScheduleModule.forRoot(), // для @Cron
    AuthModule,
    VenuesModule,
    BoxesModule,
    BookingsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
