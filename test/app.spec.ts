import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

// Тесты работают с той же базой, что и разработка (перед запуском: npm run migration:run)
describe('ДоЗакрытия', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(
      new ClassSerializerInterceptor(app.get(Reflector)),
    );
    await app.listen(0); // реальный порт нужен для /payments/dev/simulate
  });

  afterAll(() => app.close());

  // Регистрирует пользователя со случайным email, логинит и возвращает cookie
  async function signUp(admin = false) {
    const email = `${randomUUID()}@test.dev`;
    const user = await http()
      .post('/auth/register')
      .send({ email, password: 'Password123!', name: 'Тест' });
    if (admin) {
      await app
        .get(DataSource)
        .query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [user.body.id]);
    }
    const login = await http()
      .post('/auth/login')
      .send({ email, password: 'Password123!' })
      .expect(200);
    return login.get('Set-Cookie')![0].split(';')[0];
  }

  // Владелец создаёт заведение, админ одобряет, владелец создаёт и публикует бокс
  async function createBox(quantity: number) {
    const owner = await signUp();
    const admin = await signUp(true);
    const venue = await http()
      .post('/venues')
      .set('Cookie', owner)
      .send({ name: 'Пекарня', address: 'Москва', lat: 55.75, lng: 37.61 });
    await http()
      .patch(`/admin/venues/${venue.body.id}/approve`)
      .set('Cookie', admin)
      .expect(200);

    const box = await http()
      .post('/boxes')
      .set('Cookie', owner)
      .send({
        venueId: venue.body.id,
        title: 'Бокс',
        description: 'Выпечка',
        originalPrice: 60000,
        price: 25000,
        quantity,
        pickupStart: new Date(Date.now() + 5 * 60_000), // выдача через 5 минут
        pickupEnd: new Date(Date.now() + 65 * 60_000),
      })
      .expect(201);
    await http()
      .post(`/boxes/${box.body.id}/publish`)
      .set('Cookie', owner)
      .expect(201);
    return { owner, venueId: venue.body.id, boxId: box.body.id };
  }

  const book = (cookie: string, boxId: string) =>
    http()
      .post('/bookings')
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ boxId, quantity: 1 });

  it('бронь → оплата → выдача', async () => {
    const { owner, venueId, boxId } = await createBox(5);
    const client = await signUp();

    const booking = await book(client, boxId).expect(201);
    const pay = await http()
      .post(`/bookings/${booking.body.id}/pay`)
      .set('Cookie', client)
      .expect(201);
    await http()
      .post(`/payments/dev/simulate/${pay.body.paymentId}`)
      .expect(200);

    const my = await http()
      .get('/bookings/my')
      .set('Cookie', client)
      .expect(200);
    expect(my.body[0].status).toBe('PAID');

    const pickup = await http()
      .post(`/venues/${venueId}/pickup`)
      .set('Cookie', owner)
      .send({ code: my.body[0].pickupCode })
      .expect(200);
    expect(pickup.body.status).toBe('PICKED_UP');
  });

  it('20 человек одновременно бронируют последний бокс → успешна ровно одна бронь', async () => {
    const { boxId } = await createBox(1);
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => signUp()),
    );

    const responses = await Promise.all(
      clients.map((client) => book(client, boxId)),
    );
    const statuses = responses.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
  });
});
