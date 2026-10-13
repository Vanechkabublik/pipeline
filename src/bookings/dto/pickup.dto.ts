import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class PickupDto {
  @ApiProperty({ example: '482913', description: '6-значный код выдачи' })
  @Matches(/^\d{6}$/, { message: 'Код выдачи — ровно 6 цифр' })
  code: string;
}
