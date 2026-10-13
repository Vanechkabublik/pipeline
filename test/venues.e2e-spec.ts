import { INestApplication } from '@nestjs/common';
import {
  createAdmin,
  createTestApp,
  createUser,
  http,
  resetDatabase,
  TestUser,
} from './utils';

describe('Venues (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let owner: TestUser;
  let client: TestUser;
  let venueId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createAdmin(app);
    owner = await createUser(app);
    client = await createUser(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('создаёт заведение в статусе PENDING, создатель становится OWNER', async () => {
    const res = await http(app)
      .post('/venues')
      .set('Cookie', owner.cookie)
      .send({ name: 'Пекарня', address: 'Москва', lat: 55.75, lng: 37.61 })
      .expect(201);
    venueId = res.body.id;
    expect(res.body.status).toBe('PENDING');

    const me = await http(app)
      .get('/auth/me')
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(me.body.memberships).toEqual([
      expect.objectContaining({
        venueId,
        role: 'OWNER',
        venue: expect.objectContaining({ name: 'Пекарня' }),
      }),
    ]);
  });

  it('без авторизации создать заведение нельзя → 401', async () => {
    await http(app)
      .post('/venues')
      .send({ name: 'X', address: 'Y', lat: 1, lng: 1 })
      .expect(401);
  });

  it('клиент не может одобрить заведение → 403', async () => {
    const res = await http(app)
      .patch(`/admin/venues/${venueId}/approve`)
      .set('Cookie', client.cookie)
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('админ одобряет заведение → ACTIVE', async () => {
    const res = await http(app)
      .patch(`/admin/venues/${venueId}/approve`)
      .set('Cookie', admin.cookie)
      .expect(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('отклонение требует причину; с причиной → REJECTED', async () => {
    const other = await http(app)
      .post('/venues')
      .set('Cookie', owner.cookie)
      .send({ name: 'Кофейня', address: 'Москва', lat: 55.7, lng: 37.6 })
      .expect(201);

    const noReason = await http(app)
      .patch(`/admin/venues/${other.body.id}/reject`)
      .set('Cookie', admin.cookie)
      .send({})
      .expect(400);
    expect(noReason.body.code).toBe('VALIDATION_ERROR');
    expect(noReason.body.details).toHaveProperty('reason');

    const rejected = await http(app)
      .patch(`/admin/venues/${other.body.id}/reject`)
      .set('Cookie', admin.cookie)
      .send({ reason: 'Нет документов' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Нет документов',
    });
  });

  it('OWNER добавляет сотрудника по email, повтор → 409', async () => {
    const staff = await createUser(app);

    const res = await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: staff.email })
      .expect(201);
    expect(res.body).toMatchObject({
      userId: staff.id,
      venueId,
      role: 'STAFF',
    });

    const again = await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: staff.email })
      .expect(409);
    expect(again.body.code).toBe('ALREADY_MEMBER');
  });

  it('не OWNER не может добавлять сотрудников → 403, неизвестный email → 404', async () => {
    const forbidden = await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', client.cookie)
      .send({ email: admin.email })
      .expect(403);
    expect(forbidden.body.code).toBe('NOT_VENUE_OWNER');

    const unknown = await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: 'nobody@test.dev' })
      .expect(404);
    expect(unknown.body.code).toBe('USER_NOT_FOUND');
  });

  it('GET /venues/:id возвращает заведение с боксами и участниками', async () => {
    const res = await http(app)
      .get(`/venues/${venueId}`)
      .set('Cookie', client.cookie)
      .expect(200);

    expect(res.body).toMatchObject({ id: venueId, boxes: [] });
    expect(res.body.members).toHaveLength(2);
    expect(
      res.body.members.map((m: { role: string }) => m.role).sort(),
    ).toEqual(['OWNER', 'STAFF']);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('несуществующее заведение → 404 VENUE_NOT_FOUND, кривой id → 400', async () => {
    const notFound = await http(app)
      .get('/venues/00000000-0000-4000-8000-000000000000')
      .set('Cookie', client.cookie)
      .expect(404);
    expect(notFound.body.code).toBe('VENUE_NOT_FOUND');

    await http(app)
      .get('/venues/not-a-uuid')
      .set('Cookie', client.cookie)
      .expect(400);
  });
});
