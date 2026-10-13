import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { BoxesModule } from './boxes/boxes.module';
import { validateEnv } from './common/env.validation';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { VenuesModule } from './venues/venues.module';

@Module({
  imports: [
    // isGlobal: ConfigService доступен во всех модулях без повторного импорта.
    // validate: переменные окружения проверяются один раз при старте.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),
        // Сущности подхватываются из TypeOrmModule.forFeature() в модулях
        autoLoadEntities: true,
        // Схема меняется ТОЛЬКО миграциями (npm run migration:run)
        synchronize: false,
      }),
    }),
    ScheduleModule.forRoot(),
    UsersModule,
    AuthModule,
    VenuesModule,
    BoxesModule,
    BookingsModule,
    HealthModule,
  ],
})
export class AppModule {}
