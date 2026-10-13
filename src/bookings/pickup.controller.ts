import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { PickupDto } from './dto/pickup.dto';

/**
 * Выдача заказа сотрудником заведения. Маршрут начинается с /venues,
 * но логика работает с бронями, поэтому контроллер живёт в модуле bookings
 * (так BookingsModule зависит от VenuesModule, а не наоборот — без циклов).
 */
@ApiTags('pickup')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard)
@Controller('venues')
export class PickupController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post(':id/pickup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Выдать заказ по коду: PAID → PICKED_UP. Только OWNER/STAFF заведения',
    description:
      'Разрешено с (pickupStart − 15 минут) до (pickupEnd + 15 минут).',
  })
  @ApiOkResponse({ type: Booking })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'NOT_VENUE_MEMBER',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'BOOKING_NOT_FOUND — нет брони с таким кодом в этом заведении',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'OUTSIDE_PICKUP_WINDOW, INVALID_STATUS_TRANSITION',
    type: ErrorResponseDto,
  })
  pickup(
    @Param('id', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: User,
    @Body() dto: PickupDto,
  ) {
    return this.bookingsService.pickup(user.id, venueId, dto.code);
  }
}
