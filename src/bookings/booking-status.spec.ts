import { ConflictException } from '@nestjs/common';
import { BookingStatus } from './booking.entity';
import { assertBookingTransition, canTransition } from './booking-status';

describe('карта переходов статусов брони', () => {
  const allowed: Array<[BookingStatus, BookingStatus]> = [
    [BookingStatus.RESERVED, BookingStatus.PAID],
    [BookingStatus.RESERVED, BookingStatus.EXPIRED],
    [BookingStatus.RESERVED, BookingStatus.CANCELLED],
    [BookingStatus.PAID, BookingStatus.PICKED_UP],
  ];

  const allStatuses = Object.values(BookingStatus);
  const allPairs = allStatuses.flatMap((from) =>
    allStatuses.map((to) => [from, to] as [BookingStatus, BookingStatus]),
  );
  const forbidden = allPairs.filter(
    ([from, to]) => !allowed.some(([f, t]) => f === from && t === to),
  );

  it.each(allowed)('разрешает %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertBookingTransition(from, to)).not.toThrow();
  });

  it.each(forbidden)('запрещает %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('недопустимый переход → ConflictException с кодом INVALID_STATUS_TRANSITION', () => {
    let error: unknown;
    try {
      assertBookingTransition(BookingStatus.PAID, BookingStatus.CANCELLED);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
  });

  it('из конечных статусов перейти никуда нельзя', () => {
    for (const final of [
      BookingStatus.PICKED_UP,
      BookingStatus.EXPIRED,
      BookingStatus.CANCELLED,
    ]) {
      for (const to of allStatuses) {
        expect(canTransition(final, to)).toBe(false);
      }
    }
  });
});
