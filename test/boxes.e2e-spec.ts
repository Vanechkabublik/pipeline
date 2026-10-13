import { INestApplication } from '@nestjs/common';
import {
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

describe('Boxes (e2e)', () => {
  let app: INestApplication;
  let admin: TestUser;
  let owner: TestUser;
  let venueId: string;

  const boxBody = (overrides: Record<string, unknown> = {}) => ({
    venueId,
    title: 'Бокс',
    description: 'Выпечка',
    originalPrice: 60000,
    price: 25000,
    quantity: 3,
    pickupStart: minutesFromNow(60),
    pickupEnd: minutesFromNow(120),
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    admin = await createAdmin(app);
    owner = await createUser(app);
    // Центр Москвы
    venueId = await createActiveVenue(app, owner, admin, {
      lat: 55.7558,
      lng: 37.6173,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('OWNER создаёт бокс (DRAFT) и публикует его (PUBLISHED)', async () => {
    const created = await http(app)
      .post('/boxes')
      .set('Cookie', owner.cookie)
      .send(boxBody())
      .expect(201);
    expect(created.body.status).toBe('DRAFT');

    const published = await http(app)
      .post(`/boxes/${created.body.id}/publish`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(published.body.status).toBe('PUBLISHED');

    const again = await http(app)
      .post(`/boxes/${created.body.id}/publish`)
      .set('Cookie', owner.cookie)
      .expect(409);
    expect(again.body.code).toBe('BOX_NOT_DRAFT');
  });

  it('бокс с ценой больше 50% от исходной → 400 VALIDATION_ERROR', async () => {
    const res = await http(app)
      .post('/boxes')
      .set('Cookie', owner.cookie)
      .send(boxBody({ originalPrice: 60000, price: 30001 }))
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toHaveProperty('price');
  });

  it('окно выдачи короче 30 минут или начало в прошлом → 400', async () => {
    const shortWindow = await http(app)
      .post('/boxes')
      .set('Cookie', owner.cookie)
      .send(
        boxBody({
          pickupStart: minutesFromNow(60),
          pickupEnd: minutesFromNow(80),
        }),
      )
      .expect(400);
    expect(shortWindow.body.details).toHaveProperty('pickupEnd');

    const past = await http(app)
      .post('/boxes')
      .set('Cookie', owner.cookie)
      .send(
        boxBody({
          pickupStart: minutesFromNow(-10),
          pickupEnd: minutesFromNow(60),
        }),
      )
      .expect(400);
    expect(past.body.details).toHaveProperty('pickupStart');
  });

  it('создавать боксы может только OWNER и только в ACTIVE заведении → 403', async () => {
    const staff = await createUser(app);
    await http(app)
      .post(`/venues/${venueId}/staff`)
      .set('Cookie', owner.cookie)
      .send({ email: staff.email })
      .expect(201);

    const byStaff = await http(app)
      .post('/boxes')
      .set('Cookie', staff.cookie)
      .send(boxBody())
      .expect(403);
    expect(byStaff.body.code).toBe('NOT_VENUE_OWNER');

    const pendingVenue = await http(app)
      .post('/venues')
      .set('Cookie', owner.cookie)
      .send({ name: 'Новая', address: 'Москва', lat: 55.75, lng: 37.61 })
      .expect(201);
    const inPending = await http(app)
      .post('/boxes')
      .set('Cookie', owner.cookie)
      .send(boxBody({ venueId: pendingVenue.body.id }))
      .expect(403);
    expect(inPending.body.code).toBe('VENUE_NOT_ACTIVE');
  });

  describe('поиск GET /boxes', () => {
    let nearBoxId: string;
    let farBoxId: string;

    beforeAll(async () => {
      const near = await createPublishedBox(app, owner, venueId, {
        title: 'Ближний',
        originalPrice: 40000,
        price: 15000,
      });
      nearBoxId = near.id;

      // Черновик не должен попадать в поиск
      await http(app)
        .post('/boxes')
        .set('Cookie', owner.cookie)
        .send(boxBody({ title: 'Черновик' }))
        .expect(201);

      // Заведение в ~5,5 км к северу (0,05° широты)
      const farVenueId = await createActiveVenue(app, owner, admin, {
        lat: 55.8058,
        lng: 37.6173,
      });
      const far = await createPublishedBox(app, owner, farVenueId, {
        title: 'Дальний',
      });
      farBoxId = far.id;
    });

    it('находит только опубликованные боксы в радиусе, с distanceMeters', async () => {
      const res = await http(app)
        .get('/boxes')
        .query({ lat: 55.7558, lng: 37.6173 })
        .expect(200);

      const ids = res.body.items.map((b: { id: string }) => b.id);
      expect(ids).toContain(nearBoxId);
      expect(ids).not.toContain(farBoxId); // радиус по умолчанию 3 км
      expect(
        res.body.items.map((b: { title: string }) => b.title),
      ).not.toContain('Черновик');
      expect(res.body.total).toBe(res.body.items.length);

      const near = res.body.items.find(
        (b: { id: string }) => b.id === nearBoxId,
      );
      expect(near.distanceMeters).toBe(0);
      expect(near.venue).toMatchObject({ id: venueId });
    });

    it('учитывает radiusKm, сортирует по расстоянию, считает total с пагинацией', async () => {
      const res = await http(app)
        .get('/boxes')
        .query({ lat: 55.7558, lng: 37.6173, radiusKm: 10, limit: 1 })
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.items[0].distanceMeters).toBe(0);

      const second = await http(app)
        .get('/boxes')
        .query({ lat: 55.7558, lng: 37.6173, radiusKm: 10, limit: 50 })
        .expect(200);
      const far = second.body.items.find(
        (b: { id: string }) => b.id === farBoxId,
      );
      // 0,05° по широте ≈ 5,56 км
      expect(far.distanceMeters).toBeGreaterThan(5500);
      expect(far.distanceMeters).toBeLessThan(5600);
    });

    it('фильтрует по maxPrice', async () => {
      const res = await http(app)
        .get('/boxes')
        .query({ lat: 55.7558, lng: 37.6173, radiusKm: 10, maxPrice: 20000 })
        .expect(200);
      const ids = res.body.items.map((b: { id: string }) => b.id);
      expect(ids).toEqual([nearBoxId]);
    });

    it('radiusKm больше 20 и limit больше 50 → 400', async () => {
      const res = await http(app)
        .get('/boxes')
        .query({ lat: 55.7558, lng: 37.6173, radiusKm: 21, limit: 51 })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Object.keys(res.body.details)).toEqual(
        expect.arrayContaining(['radiusKm', 'limit']),
      );
    });
  });
});
