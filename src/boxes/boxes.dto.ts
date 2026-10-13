import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateBoxDto {
  @IsUUID()
  venueId: string;

  @IsNotEmpty()
  title: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(1)
  originalPrice: number; // копейки

  @IsInt()
  @Min(1)
  price: number; // копейки

  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @Type(() => Date) // строку из JSON превращаем в Date
  @IsDate()
  pickupStart: Date;

  @Type(() => Date)
  @IsDate()
  pickupEnd: Date;
}

// Параметры поиска GET /boxes (из query всё приходит строками, @Type превращает в числа)
export class SearchBoxesDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @Max(20)
  radiusKm: number = 3;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(50)
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset: number = 0;
}
