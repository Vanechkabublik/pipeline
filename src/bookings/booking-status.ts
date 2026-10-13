import { ConflictException } from '@nestjs/common';
import { ErrorCode } from '../common/error-codes';
import { BookingStatus } from './booking.entity';

/**
 * Карта разрешённых переходов статуса брони: «из какого статуса — в какие можно».
 *
 *   RESERVED ──оплата──▶ PAID ──выдача──▶ PICKED_UP
 *      │
 *      ├──истёк срок──▶ EXPIRED
 *      └──отмена──────▶ CANCELLED
 *
 * PICKED_UP, EXPIRED и CANCELLED — конечные: из них перейти никуда нельзя.
 */
export const BOOKING_STATUS_TRANSITIONS: Record<
  BookingStatus,
  readonly BookingStatus[]
> = {
  [BookingStatus.RESERVED]: [
    BookingStatus.PAID,
    BookingStatus.EXPIRED,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PAID]: [BookingStatus.PICKED_UP],
  [BookingStatus.PICKED_UP]: [],
  [BookingStatus.EXPIRED]: [],
  [BookingStatus.CANCELLED]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}

/** Бросает 409 INVALID_STATUS_TRANSITION, если переход from → to запрещён */
export function assertBookingTransition(
  from: BookingStatus,
  to: BookingStatus,
): void {
  if (!canTransition(from, to)) {
    throw new ConflictException({
      code: ErrorCode.INVALID_STATUS_TRANSITION,
      message: `Нельзя перевести бронь из статуса ${from} в ${to}`,
      details: { from, to },
    });
  }
}
