import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { signPayload } from '../src/payments/webhook-signature';
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

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let db: DataSource;
  let secret: string;
  let admin: TestUser;
  let owner: TestUser;
  let staff: TestUser;
  let venueId: string;

  /** Отправляет вебхук так, как это делает провайдер: сырое тело + подпись */
  const sendWebhook = (
    payload: Record<string, unknown>,
    signWith: string = secret,
  ) => {
    const rawBody = JSON.stringify(payload);
    return http(app)
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signPayload(rawBody, signWith))
      .send(rawBody);
  };

  /** Создаёт бронь и платёж по ней, возвращает их id и сумму */
  const bookAndPay = async (client: TestUser) => {
    const box = await createPublishedBox(app, owner, venueId);
    const booking = await bookBox(app, client, box.id).expect(201);
    const pay = await http(app)
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', client.cookie)
      .expect(201);
    return {
      bookingId: booking.body.id as string,
      paymentId: pay.body.paymentId as string,
      amount: booking.body.amount as number,
      boxId: box.id,
    };
  };

  const getStatus = async (table: 'bookings' | 'payments', id: string) =>
    (
      await db.query<Array<{ status: string }>>(
        `SELECT status FROM ${table} WHERE id = $1`,
        [id],
      )
    )[0].status;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(DataSource);
    secret = app.get(ConfigService).getOrThrow<string>('WEBHOOK_SECRET');
    await resetDatabase(app);
    admin = await createAdmin(app);
    owner = await createUser(app);
    staff = await createUser(app);
    venueId = await createActiveVenue(app, owner, admin);
    await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: staff.email })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('полный сценарий: бронь → pay → simulate → PAID с кодом → выдача → PICKED_UP', async () => {
    const client = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId); // выдача через 5 минут

    // 1. Бронь
    const booking = await bookBox(app, client, box.id).expect(201);
    expect(booking.body.status).toBe('RESERVED');

    // 2. Начинаем оплату
    const pay = await http(app)
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', client.cookie)
      .expect(201);
    expect(pay.body.paymentId).toEqual(expect.any(String));

    // 3. Имитируем вебхук провайдера «оплата прошла»
    const simulated = await http(app)
      .post(`/payments/dev/simulate/${pay.body.paymentId}`)
      .expect(200);
    expect(simulated.body).toMatchObject({
      webhookStatus: 200,
      webhookResponse: { received: true, duplicate: false },
    });

    // 4. Бронь оплачена, появился 6-значный код выдачи
    const my = await http(app)
      .get('/bookings/my')
      .set('Cookie', client.cookie)
      .expect(200);
    const paid = my.body.find((b: { id: string }) => b.id === booking.body.id);
    expect(paid.status).toBe('PAID');
    expect(paid.pickupCode).toMatch(/^\d{6}$/);
    expect(await getStatus('payments', pay.body.paymentId)).toBe('SUCCEEDED');

    // 5. Сотрудник выдаёт заказ по коду
    const pickup = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', staff.cookie)
      .send({ code: paid.pickupCode })
      .expect(200);
    expect(pickup.body).toMatchObject({
      id: booking.body.id,
      status: 'PICKED_UP',
    });

    // Повторно выдать тот же заказ нельзя
    const again = await http(app)
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', staff.cookie)
      .send({ code: paid.pickupCode })
      .expect(409);
    expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('вебхук с неверной подписью или без неё → 401 INVALID_SIGNATURE', async () => {
    const client = await createUser(app);
    const { paymentId, amount, bookingId } = await bookAndPay(client);
    const payload = {
      eventId: randomUUID(),
      paymentId,
      status: 'succeeded',
      amount,
    };

    const forged = await sendWebhook(
      payload,
      'wrong-secret-wrong-secret',
    ).expect(401);
    expect(forged.body.code).toBe('INVALID_SIGNATURE');

    const unsigned = await http(app)
      .post('/payments/webhook')
      .send(payload)
      .expect(401);
    expect(unsigned.body.code).toBe('INVALID_SIGNATURE');

    // Подпись от одного тела не подходит к другому (подменили сумму)
    const rawBody = JSON.stringify(payload);
    await http(app)
      .post('/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Signature', signPayload(rawBody, secret))
      .send(JSON.stringify({ ...payload, amount: 1 }))
      .expect(401);

    expect(await getStatus('payments', paymentId)).toBe('PENDING');
    expect(await getStatus('bookings', bookingId)).toBe('RESERVED');
  });

  it('повторный eventId → 200, платёж обработан один раз', async () => {
    const client = await createUser(app);
    const { paymentId, amount, bookingId } = await bookAndPay(client);
    const payload = {
      eventId: `evt_${randomUUID()}`,
      paymentId,
      status: 'succeeded',
      amount,
    };

    const first = await sendWebhook(payload).expect(200);
    expect(first.body).toEqual({ received: true, duplicate: false });
    const [{ pickupCode }] = await db.query<Array<{ pickupCode: string }>>(
      'SELECT "pickupCode" FROM bookings WHERE id = $1',
      [bookingId],
    );

    const second = await sendWebhook(payload).expect(200);
    expect(second.body).toEqual({ received: true, duplicate: true });

    // Ничего не изменилось: тот же статус и тот же код выдачи, событие записано один раз
    expect(await getStatus('payments', paymentId)).toBe('SUCCEEDED');
    expect(await getStatus('bookings', bookingId)).toBe('PAID');
    const [after] = await db.query<Array<{ pickupCode: string }>>(
      'SELECT "pickupCode" FROM bookings WHERE id = $1',
      [bookingId],
    );
    expect(after.pickupCode).toBe(pickupCode);
    const [{ count }] = await db.query<Array<{ count: string }>>(
      'SELECT count(*) FROM webhook_events WHERE "eventId" = $1',
      [payload.eventId],
    );
    expect(Number(count)).toBe(1);
  });

  it('сумма не совпала → платёж FAILED, бронь остаётся RESERVED', async () => {
    const client = await createUser(app);
    const { paymentId, amount, bookingId } = await bookAndPay(client);

    await sendWebhook({
      eventId: randomUUID(),
      paymentId,
      status: 'succeeded',
      amount: amount - 1,
    }).expect(200);

    expect(await getStatus('payments', paymentId)).toBe('FAILED');
    expect(await getStatus('bookings', bookingId)).toBe('RESERVED');
  });

  it('провайдер сообщил failed → платёж FAILED, можно оплатить ещё раз', async () => {
    const client = await createUser(app);
    const { paymentId, amount, bookingId } = await bookAndPay(client);

    await sendWebhook({
      eventId: randomUUID(),
      paymentId,
      status: 'failed',
      amount,
    }).expect(200);
    expect(await getStatus('payments', paymentId)).toBe('FAILED');

    const retry = await http(app)
      .post(`/bookings/${bookingId}/pay`)
      .set('Cookie', client.cookie)
      .expect(201);
    expect(retry.body.paymentId).not.toBe(paymentId);
  });

  it('оплата пришла после истечения брони → REFUND_REQUIRED, бронь не воскресает', async () => {
    const client = await createUser(app);
    const { paymentId, amount, bookingId, boxId } = await bookAndPay(client);

    // Срок брони истёк (cron ещё не успел её закрыть)
    await db.query(
      `UPDATE bookings SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`,
      [bookingId],
    );

    await sendWebhook({
      eventId: randomUUID(),
      paymentId,
      status: 'succeeded',
      amount,
    }).expect(200);

    expect(await getStatus('payments', paymentId)).toBe('REFUND_REQUIRED');
    expect(await getStatus('bookings', bookingId)).toBe('EXPIRED');
    // Остаток вернулся в бокс (было 5, бронировали 1)
    const [box] = await db.query<Array<{ quantity: number }>>(
      'SELECT quantity FROM boxes WHERE id = $1',
      [boxId],
    );
    expect(box.quantity).toBe(5);
  });

  it('оплатить чужую бронь нельзя → 404, отменённую → 409', async () => {
    const client = await createUser(app);
    const stranger = await createUser(app);
    const box = await createPublishedBox(app, owner, venueId);
    const booking = await bookBox(app, client, box.id).expect(201);

    const foreign = await http(app)
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    expect(foreign.body.code).toBe('BOOKING_NOT_FOUND');

    await http(app)
      .delete(`/bookings/${booking.body.id}`)
      .set('Cookie', client.cookie)
      .expect(200);
    const cancelled = await http(app)
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', client.cookie)
      .expect(409);
    expect(cancelled.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});
