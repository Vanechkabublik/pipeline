import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/**
 * Параметры GET /boxes. Всё, что приходит в query, — строки;
 * @Type(() => Number) превращает их в числа до валидации.
 * Значения по умолчанию — инициализаторы полей: ValidationPipe с transform: true
 * создаёт экземпляр класса, и незаданные поля получают эти значения.
 */
export class SearchBoxesQueryDto {
  @ApiProperty({ example: 55.7558, description: 'Широта точки поиска' })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 37.6173, description: 'Долгота точки поиска' })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({ example: 3, default: 3, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(20)
  radiusKm: number = 3;

  @ApiPropertyOptional({
    example: 30000,
    description: 'Максимальная цена, копейки',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset: number = 0;
}
