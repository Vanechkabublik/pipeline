import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Простые проверки полей — здесь, декораторами.
 * Правила, связывающие поля (цена ≤ 50%, окно выдачи 30 мин – 3 ч),
 * проверяет validateBoxRules() в сервисе.
 */
export class CreateBoxDto {
  @ApiProperty({ example: '0b6c1f0e-5a3d-4c2b-9e8f-7a6b5c4d3e2f' })
  @IsUUID()
  venueId: string;

  @ApiProperty({ example: 'Бокс выпечки' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Круассаны и булочки, испечённые сегодня' })
  @IsString()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ example: 60000, description: 'Цена без скидки, копейки' })
  @IsInt()
  @Min(1)
  originalPrice: number;

  @ApiProperty({
    example: 25000,
    description: 'Цена со скидкой, копейки; не больше 50% от originalPrice',
  })
  @IsInt()
  @Min(1)
  price: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 50 })
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  // @Type(() => Date): строку ISO из JSON превращаем в Date (ValidationPipe с transform: true)
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-01-01T18:00:00.000Z',
    description: 'Начало выдачи, в будущем',
  })
  @Type(() => Date)
  @IsDate()
  pickupStart: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-01-01T20:00:00.000Z',
    description: 'Конец выдачи: через 30 минут – 3 часа после начала',
  })
  @Type(() => Date)
  @IsDate()
  pickupEnd: Date;
}
