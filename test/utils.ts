import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

export const PASSWORD = 'Password123!';

export interface TestUser {
  id: string;
  email: string;
  cookie: string; // строка для заголовка Cookie: "access_token=..."
}

/** Поднимает приложение так же, как main.ts (rawBody + общая настройка) */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app);
  // Слушаем случайный свободный порт: /payments/dev/simulate отправляет
  // вебхук настоящим HTTP-запросом самому приложению
  await app.listen(0);
  return app;
}

export function http(app: INestApplication) {
  return request(app.getHttpServer());
}

/** Очистка всех таблиц между наборами тестов (схема и миграции остаются) */
export async function resetDatabase(app: INestApplication) {
  await app
    .get(DataSource)
    .query(
      'TRUNCATE users, venues, venue_members, boxes, bookings, payments, webhook_events, idempotency_keys CASCADE',
    );
}

/** Достаёт "access_token=..." из заголовков Set-Cookie ответа */
export function extractAuthCookie(setCookie: string[] | string | undefined) {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const authCookie = cookies.find((c) => c.startsWith('access_token='));
  if (!authCookie) {
    throw new Error('Ответ не содержит cookie access_token');
  }
  return authCookie.split(';')[0];
}

/** Регистрирует пользователя и логинится; email по умолчанию — случайный */
export async function createUser(
  app: INestApplication,
  email = `user-${randomUUID()}@test.dev`,
): Promise<TestUser> {
  const registered = await http(app)
    .post('/auth/register')
    .send({ email, password: PASSWORD, name: 'Тестовый пользователь' })
    .expect(201);
  const login = await http(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    id: (registered.body as { id: string }).id,
    email,
    cookie: extractAuthCookie(login.headers['set-cookie']),
  };
}

export async function createAdmin(app: INestApplication): Promise<TestUser> {
  const admin = await createUser(app);
  // Через API стать админом нельзя — роль выдаём напрямую в БД
  await app
    .get(DataSource)
    .query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [admin.id]);
  return admin;
}

/** Создаёт заведение от имени owner и одобряет его админом → статус ACTIVE */
export async function createActiveVenue(
  app: INestApplication,
  owner: TestUser,
  admin: TestUser,
  coords = { lat: 55.7558, lng: 37.6173 },
): Promise<string> {
  const venue = await http(app)
    .post('/venues')
    .set('Cookie', owner.cookie)
    .send({ name: 'Пекарня', address: 'Москва, Тверская, 1', ...coords })
    .expect(201);
  const venueId = (venue.body as { id: string }).id;
  await http(app)
    .patch(`/admin/venues/${venueId}/approve`)
    .set('Cookie', admin.cookie)
    .expect(200);
  return venueId;
}

/** Время относительно «сейчас» в ISO-формате: minutesFromNow(30) → через 30 минут */
export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Создаёт и публикует бокс; по умолчанию окно выдачи начинается через 5 минут */
export async function createPublishedBox(
  app: INestApplication,
  owner: TestUser,
  venueId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; price: number }> {
  const created = await http(app)
    .post('/boxes')
    .set('Cookie', owner.cookie)
    .send({
      venueId,
      title: 'Бокс выпечки',
      description: 'Круассаны и булочки',
      originalPrice: 60000,
      price: 25000,
      quantity: 5,
      pickupStart: minutesFromNow(5),
      pickupEnd: minutesFromNow(65),
      ...overrides,
    })
    .expect(201);
  const box = created.body as { id: string; price: number };
  await http(app)
    .post(`/boxes/${box.id}/publish`)
    .set('Cookie', owner.cookie)
    .expect(200);
  return box;
}

/** Создаёт бронь (с обязательным Idempotency-Key) и возвращает ответ */
export function bookBox(
  app: INestApplication,
  user: TestUser,
  boxId: string,
  quantity = 1,
  idempotencyKey: string = randomUUID(),
) {
  return http(app)
    .post('/bookings')
    .set('Cookie', user.cookie)
    .set('Idempotency-Key', idempotencyKey)
    .send({ boxId, quantity });
}
