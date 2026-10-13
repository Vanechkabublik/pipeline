import { ApiProperty } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({ example: 'Пекарня «Утро»' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Москва, ул. Тверская, 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: 55.7575 })
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 37.6156 })
  @IsLongitude()
  lng: number;
}
