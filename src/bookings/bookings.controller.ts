import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorCode } from '../common/error-codes';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingWithBoxDto } from './dto/booking-with-box.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@ApiCookieAuth('access_token')
@ApiResponse({
  status: 401,
  description: 'UNAUTHORIZED',
  type: ErrorResponseDto,
})
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @ApiOperation({
    summary: 'Забронировать бокс (RESERVED, ждёт оплаты BOOKING_HOLD_SECONDS)',
    description:
      'Повтор с тем же Idempotency-Key и тем же телом вернёт сохранённый ответ ' +
      'и не создаст вторую бронь. Тот же ключ с другим телом → 422.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID, уникальный для каждой новой попытки бронирования',
    example: '3f0e9a52-8a51-4a7e-9a0e-6f6d3c2b1a00',
  })
  @ApiCreatedResponse({ type: Booking })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR, IDEMPOTENCY_KEY_REQUIRED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'OWN_VENUE_BOOKING',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'BOX_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'BOX_SOLD_OUT, BOX_NOT_AVAILABLE, RESERVATION_LIMIT',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 422,
    description: 'IDEMPOTENCY_KEY_REUSED',
    type: ErrorResponseDto,
  })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Заголовок обязателен и должен быть UUID. Отдельный код ошибки — чтобы клиент
    // сразу понял, что забыл заголовок, а не ошибся в теле запроса.
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException({
        code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        message: 'Заголовок Idempotency-Key обязателен и должен быть UUID',
      });
    }
    const result = await this.bookingsService.create(
      user.id,
      dto,
      idempotencyKey,
    );
    // При повторе отдаём сохранённый HTTP-статус и тело
    res.status(result.status);
    return result.body;
  }

  @Get('my')
  @ApiOperation({ summary: 'Мои брони (новые первыми)' })
  @ApiOkResponse({ type: [BookingWithBoxDto] })
  findMy(@CurrentUser() user: User) {
    return this.bookingsService.findMy(user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Отменить свою бронь: RESERVED → CANCELLED' })
  @ApiOkResponse({ type: Booking })
  @ApiResponse({
    status: 404,
    description: 'BOOKING_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'INVALID_STATUS_TRANSITION — бронь уже не RESERVED',
    type: ErrorResponseDto,
  })
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.bookingsService.cancel(user.id, id);
  }
}
