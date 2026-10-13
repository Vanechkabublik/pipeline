import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ example: '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d' })
  @IsUUID()
  boxId: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 3 })
  @IsInt()
  @Min(1)
  @Max(3)
  quantity: number;
}
