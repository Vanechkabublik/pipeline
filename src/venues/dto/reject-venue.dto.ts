import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVenueDto {
  @ApiProperty({ example: 'Не удалось подтвердить адрес заведения' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
