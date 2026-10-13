import { IsEmail, IsLatitude, IsLongitude, IsNotEmpty } from 'class-validator';

export class CreateVenueDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  address: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

export class RejectVenueDto {
  @IsNotEmpty()
  reason: string;
}

export class AddStaffDto {
  @IsEmail()
  email: string;
}
