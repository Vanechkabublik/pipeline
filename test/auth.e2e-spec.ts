import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  createUser,
  extractAuthCookie,
  http,
  PASSWORD,
  resetDatabase,
} from './utils';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('регистрирует пользователя и не отдаёт хэш пароля', async () => {
    const res = await http(app)
      .post('/auth/register')
      .send({ email: 'New@Test.dev', password: PASSWORD, name: 'Новый' })
      .expect(201);

    expect(res.body).toMatchObject({
      email: 'new@test.dev',
      name: 'Новый',
      role: 'USER',
    });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('повторная регистрация с тем же email → 409 EMAIL_TAKEN', async () => {
    const res = await http(app)
      .post('/auth/register')
      .send({ email: 'new@test.dev', password: PASSWORD, name: 'Дубль' })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('невалидное тело → 400 VALIDATION_ERROR с ошибками по полям', async () => {
    const res = await http(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '123', name: '', extra: 1 })
      .expect(400);

    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      path: '/auth/register',
    });
    expect(Object.keys(res.body.details)).toEqual(
      expect.arrayContaining(['email', 'password', 'name', 'extra']),
    );
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('вход ставит httpOnly cookie и не возвращает токен в теле', async () => {
    const res = await http(app)
      .post('/auth/login')
      .send({ email: 'new@test.dev', password: PASSWORD })
      .expect(200);

    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const authCookie = setCookie.find((c) => c.startsWith('access_token='));
    expect(authCookie).toBeDefined();
    expect(authCookie).toMatch(/HttpOnly/i);
    expect(authCookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toContain(
      extractAuthCookie(setCookie).split('=')[1],
    );
  });

  it('/auth/me с cookie → 200, без cookie → 401', async () => {
    const user = await createUser(app);

    const me = await http(app)
      .get('/auth/me')
      .set('Cookie', user.cookie)
      .expect(200);
    expect(me.body).toMatchObject({ id: user.id, email: user.email });
    expect(me.body.memberships).toEqual([]);

    const anonymous = await http(app).get('/auth/me').expect(401);
    expect(anonymous.body.code).toBe('UNAUTHORIZED');
  });

  it('неверный пароль и неизвестный email → одинаковый 401 INVALID_CREDENTIALS', async () => {
    const wrongPassword = await http(app)
      .post('/auth/login')
      .send({ email: 'new@test.dev', password: 'WrongPassword1!' })
      .expect(401);
    const unknownEmail = await http(app)
      .post('/auth/login')
      .send({ email: 'nobody@test.dev', password: PASSWORD })
      .expect(401);

    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('logout удаляет cookie', async () => {
    const res = await http(app).post('/auth/logout').expect(200);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(setCookie.some((c) => /^access_token=;/.test(c))).toBe(true);
  });
});
