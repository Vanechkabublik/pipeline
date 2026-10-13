import { ApiProperty } from '@nestjs/swagger';
import { Box } from '../../boxes/box.entity';
import { Booking } from '../booking.entity';

/** Только для документации Swagger: элемент ответа GET /bookings/my */
export class BookingWithBoxDto extends Booking {
  @ApiProperty({ type: () => Box })
  declare box: Box;
}
