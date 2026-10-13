import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { BookingsService } from '../src/bookings/bookings.service';
import {
  bookBox,
  createActiveVenue,
  createAdmin,
  createPublishedBox,
  createTestApp,
  createUser,
  http,
  resetDatabase,
  TestUser,
} from './utils';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let admin: TestUser;
  let owner: TestUser;
  let venueId: string;

  const getBox = async (id: string) =>
    (
      await db.query<Array<{ quantity: number; status: string }>>(
        'SELECT quantity, status FROM boxes WHERE id = $1',
        [id],
      )
    )[0];

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    await resetDatabase(app);
    admin = await createAdmin(app);
    owner = await createUser(app);
    venueId = await createActiveVenue(app, owner, admin);
  });

  afterAll(async () => {
    await app.close();
  });

  it('создаёт бронь RESERVED, фиксирует сумму и списывает остаток', async () => {
    const client = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId, { quantity: 5 });

    const res = await bookBox(app, client, box.id, 2).expect(201);

    expect(res.body).toMatchObject({
      boxId: box.id,
      userId: client.id,
      quantity: 2,
      amount: box.price * 2,
      status: 'RESERVED',
      pickupCode: null,
    });
    const holdMs = new Date(res.body.expiresAt).getTime() - Date.now();
    expect(holdMs).toBeGreaterThan(590_000);
    expect(holdMs).toBeLessThanOrEqual(600_000);
    expect(await getBox(box.id)).toEqual({ quantity: 3, status: 'PUBLISHED' });
  });

  it('гонка: 20 параллельных броней бокса с quantity = 1 → 1 успех, 19 × 409', async () => {
    const box = await createPublishedBox(app, owner, venueId, { quantity: 1 });
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => createUser(app)),
    );

    const responses = await Promise.all(
      clients.map((client) => bookBox(app, client, box.id, 1)),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    for (const r of responses.filter((r) => r.status === 409)) {
      expect(r.body.code).toBe('BOX_SOLD_OUT');
    }

    expect(await getBox(box.id)).toEqual({ quantity: 0, status: 'SOLD_OUT' });
    const [{ count }] = await db.query<Array<{ count: string }>>(
      'SELECT count(*) FROM bookings WHERE "boxId" = $1',
      [box.id],
    );
    expect(Number(count)).toBe(1);
  });

  describe('Idempotency-Key', () => {
    it('повтор с тем же ключом и телом → тот же id брони, вторая бронь не создаётся', async () => {
      const client = await createUser(app);
      const box = await createPublishedBox(app, owner, venueId, {
        quantity: 5,
      });
      const key = randomUUID();

      const first = await bookBox(app, client, box.id, 1, key).expect(201);
      const second = await bookBox(app, client, box.id, 1, key).expect(201);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body).toEqual(first.body);
      expect((await getBox(box.id)).quantity).toBe(4);
    });

    it('тот же ключ с другим телом → 422 IDEMPOTENCY_KEY_REUSED', async () => {
      const client = await createUser(app);
      const box = await createPublishedBox(app, owner, venueId, {
        quantity: 5,
      });
      const key = randomUUID();

      await bookBox(app, client, box.id, 1, key).expect(201);
      const res = await bookBox(app, client, box.id, 2, key).expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('без заголовка или не-UUID → 400 IDEMPOTENCY_KEY_REQUIRED', async () => {
      const client = await createUser(app);
      const box = await createPublishedBox(app, owner, venueId);

      const missing = await http(app)
        .post('/bookings')
        .set('Cookie', client.cookie)
        .send({ boxId: box.id, quantity: 1 })
        .expect(400);
      expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

      const notUuid = await bookBox(app, client, box.id, 1, 'abc').expect(400);
      expect(notUuid.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });
  });

  it('третья активная бронь → 409 RESERVATION_LIMIT', async () => {
    const client = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId, { quantity: 10 });

    await bookBox(app, client, box.id).expect(201);
    await bookBox(app, client, box.id).expect(201);
    const third = await bookBox(app, client, box.id).expect(409);

    expect(third.body.code).toBe('RESERVATION_LIMIT');
    expect((await getBox(box.id)).quantity).toBe(8);
  });

  it('OWNER и STAFF не могут бронировать боксы своего заведения → 403', async () => {
    const staff = await createUser(app);
    await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: staff.email })
      .expect(201);
    const box = await createPublishedBox(app, owner, venueId);

    const byOwner = await bookBox(app, owner, box.id).expect(403);
    const byStaff = await bookBox(app, staff, box.id).expect(403);
    expect(byOwner.body.code).toBe('OWN_VENUE_BOOKING');
    expect(byStaff.body.code).toBe('OWN_VENUE_BOOKING');
  });

  it('quantity вне диапазона 1–3 → 400 VALIDATION_ERROR', async () => {
    const client = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId);
    const res = await bookBox(app, client, box.id, 4).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toHaveProperty('quantity');
  });

  it('отмена: RESERVED → CANCELLED, остаток возвращается, SOLD_OUT → PUBLISHED', async () => {
    const client = await createUser(app);
    const stranger = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId, { quantity: 1 });
    const booking = await bookBox(app, client, box.id).expect(201);
    expect(await getBox(box.id)).toEqual({ quantity: 0, status: 'SOLD_OUT' });

    // Чужую бронь отменить нельзя — для чужого её «нет»
    await http(app)
      .delete(`/bookings/${booking.body.id}`)
      .set('Cookie', stranger.cookie)
      .expect(404);

    const cancelled = await http(app)
      .delete(`/bookings/${booking.body.id}`)
      .set('Cookie', client.cookie)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await getBox(box.id)).toEqual({ quantity: 1, status: 'PUBLISHED' });

    const again = await http(app)
      .delete(`/bookings/${booking.body.id}`)
      .set('Cookie', client.cookie)
      .expect(409);
    expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('GET /bookings/my возвращает только свои брони вместе с боксом', async () => {
    const client = await createUser(app);
    const other = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId);
    const mine = await bookBox(app, client, box.id).expect(201);
    await bookBox(app, other, box.id).expect(201);

    const res = await http(app)
      .get('/bookings/my')
      .set('Cookie', client.cookie)
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: mine.body.id,
      box: { id: box.id },
    });
  });

  it('cron: просроченная бронь → EXPIRED, остаток возвращается', async () => {
    const client = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId, { quantity: 1 });
    const booking = await bookBox(app, client, box.id).expect(201);
    expect((await getBox(box.id)).status).toBe('SOLD_OUT');

    // «Перематываем время»: срок брони истёк минуту назад
    await db.query(
      `UPDATE bookings SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`,
      [booking.body.id],
    );
    // Вызываем тот же метод, что cron запускает раз в минуту
    const expired = await app.get(BookingsService).expireOverdueBookings();

    expect(expired).toBeGreaterThanOrEqual(1);
    const [row] = await db.query<Array<{ status: string }>>(
      'SELECT status FROM bookings WHERE id = $1',
      [booking.body.id],
    );
    expect(row.status).toBe('EXPIRED');
    expect(await getBox(box.id)).toEqual({ quantity: 1, status: 'PUBLISHED' });
  });
});
