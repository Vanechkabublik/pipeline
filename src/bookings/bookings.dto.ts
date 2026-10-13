import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  boxId: string;

  @IsInt()
  @Min(1)
  @Max(3)
  quantity: number;
}

export class PickupDto {
  @Matches(/^\d{6}$/, { message: 'Код — 6 цифр' })
  code: string;
}
