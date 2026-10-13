import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Описание переменных окружения. ConfigModule вызывает validateEnv() при старте:
 * если чего-то не хватает или значение кривое — приложение падает сразу
 * с понятной ошибкой, а не через час на первом запросе.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @IsInt()
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USER: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @MinLength(16)
  WEBHOOK_SECRET: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string;

  @IsInt()
  @Min(10)
  BOOKING_HOLD_SECONDS: number = 600;
}

export function validateEnv(config: Record<string, unknown>) {
  // enableImplicitConversion превращает строки из .env в number там, где поле объявлено как number
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Некорректные переменные окружения:\n${messages}`);
  }
  return validated;
}
