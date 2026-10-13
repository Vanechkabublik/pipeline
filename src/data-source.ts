import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Booking } from './bookings/booking.entity';
import { IdempotencyKey } from './bookings/idempotency-key.entity';
import { Box } from './boxes/box.entity';
import { Payment } from './payments/payment.entity';
import { WebhookEvent } from './payments/webhook-event.entity';
import { User } from './users/user.entity';
import { VenueMember } from './venues/venue-member.entity';
import { Venue } from './venues/venue.entity';

config({ quiet: true }); // читаем .env

// Одни и те же настройки БД для приложения (app.module.ts) и для команд миграций
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    Venue,
    VenueMember,
    Box,
    Booking,
    IdempotencyKey,
    Payment,
    WebhookEvent,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false, // схема меняется только миграциями
};

export default new DataSource(dataSourceOptions);
