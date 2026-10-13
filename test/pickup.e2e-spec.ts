import { INestApplication } from '@nestjs/common';
import {
  bookBox,
  createActiveVenue,
  createAdmin,
  createPublishedBox,
  createTestApp,
  createUser,
  http,
  minutesFromNow,
  resetDatabase,
  TestUser,
} from './utils';

describe('Pickup (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let owner: TestUser;
  let venueId: string;

  /** Бронирует бокс, оплачивает через dev-симулятор и возвращает код выдачи */
  const paidBookingCode = async (boxId: string): Promise<string> => {
    const client = await createUser(app);
    const booking = await bookBox(app, client, boxId).expect(201);
    const pay = await http(app)
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', client.cookie)
      .expect(201);
    await http(app)
      .post(`/payments/dev/simulate/${pay.body.paymentId}`)
      .expect(200);
    const my = await http(app)
      .get('/bookings/my')
      .set('Cookie', client.cookie)
      .expect(200);
    return my.body[0].pickupCode as string;
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createAdmin(app);
    owner = await createUser(app);
    venueId = await createActiveVenue(app, owner, admin);
  });

  afterAll(async () => {
    await app.close();
  });

  it('выдача вне окна → 409 OUTSIDE_PICKUP_WINDOW', async () => {
    // Окно выдачи начнётся через 2 часа: «за 15 минут до начала» ещё не наступило
    const box = await createPublishedBox(app, owner, venueId, {
      pickupStart: minutesFromNow(120),
      pickupEnd: minutesFromNow(180),
    });
    const code = await paidBookingCode(box.id);

    const res = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', owner.cookie)
      .send({ code })
      .expect(409);
    expect(res.body.code).toBe('OUTSIDE_PICKUP_WINDOW');
  });

  it('OWNER выдаёт заказ за 15 минут до начала окна', async () => {
    // Окно начнётся через 10 минут — уже можно выдавать
    const box = await createPublishedBox(app, owner, venueId, {
      pickupStart: minutesFromNow(10),
      pickupEnd: minutesFromNow(70),
    });
    const code = await paidBookingCode(box.id);

    const res = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', owner.cookie)
      .send({ code })
      .expect(200);
    expect(res.body.status).toBe('PICKED_UP');
  });

  it('выдавать могут только OWNER/STAFF этого заведения → 403', async () => {
    const box = await createPublishedBox(app, owner, venueId);
    const code = await paidBookingCode(box.id);
    const stranger = await createUser(app);

    const res = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', stranger.cookie)
      .send({ code })
      .expect(403);
    expect(res.body.code).toBe('NOT_VENUE_MEMBER');
  });

  it('код брони другого заведения → 404', async () => {
    const otherOwner = await createUser(app);
    const otherVenueId = await createActiveVenue(app, otherOwner, admin);
    const box = await createPublishedBox(app, owner, venueId);
    const code = await paidBookingCode(box.id);

    const res = await http(app)
      .post(`/venues/${otherVenueId}/pickup`)
      .set('Cookie', otherOwner.cookie)
      .send({ code })
      .expect(404);
    expect(res.body.code).toBe('BOOKING_NOT_FOUND');
  });

  it('код не из 6 цифр → 400 VALIDATION_ERROR', async () => {
    const res = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', owner.cookie)
      .send({ code: '12ab' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
