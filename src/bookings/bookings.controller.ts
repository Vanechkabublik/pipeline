import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiHeader } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { CreateBookingDto, PickupDto } from './bookings.dto';
import { BookingsService } from './bookings.service';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post('bookings')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Любой UUID, новый на каждую бронь',
  })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') key: string,
  ) {
    if (!key || !isUUID(key))
      throw new BadRequestException('Нужен заголовок Idempotency-Key (UUID)');
    return this.bookingsService.create(user.id, dto, key);
  }

  @Get('bookings/my')
  findMy(@CurrentUser() user: User) {
    return this.bookingsService.findMy(user.id);
  }

  @Delete('bookings/:id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsService.cancel(user.id, id);
  }

  // Выдача заказа по коду (OWNER или STAFF заведения)
  @Post('venues/:id/pickup')
  @HttpCode(200)
  pickup(
    @Param('id', ParseUUIDPipe) venueId: string,
    @CurrentUser() user: User,
    @Body() dto: PickupDto,
  ) {
    return this.bookingsService.pickup(user.id, venueId, dto.code);
  }
}
