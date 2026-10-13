import * as bcrypt from 'bcrypt';
import { EntityManager, MoreThan } from 'typeorm';
import { BCRYPT_ROUNDS } from '../auth/auth.constants';
import { Box, BoxStatus } from '../boxes/box.entity';
import dataSource from '../data-source';
import { User, UserRole } from '../users/user.entity';
import { VenueMember, VenueRole } from '../venues/venue-member.entity';
import { Venue, VenueStatus } from '../venues/venue.entity';

/**
 * Тестовые данные для ручной проверки: npm run seed
 * (в Docker: docker compose exec api node dist/seed/seed.js).
 *
 * Скрипт идемпотентный: его можно запускать сколько угодно раз —
 * существующие пользователи, заведения и членства не дублируются.
 * Боксы создаются, только если у пекарни нет ни одного бокса с ещё
 * не закончившейся выдачей, — так на следующий день можно получить свежие.
 */
const PASSWORD = 'Password123!';
const MINUTE = 60_000;

async function findOrCreateUser(
  manager: EntityManager,
  data: { email: string; name: string; role: UserRole; passwordHash: string },
): Promise<User> {
  const existing = await manager.findOneBy(User, { email: data.email });
  return existing ?? manager.save(manager.create(User, data));
}

async function findOrCreateVenue(
  manager: EntityManager,
  data: Pick<Venue, 'name' | 'address' | 'lat' | 'lng' | 'status'>,
): Promise<Venue> {
  const existing = await manager.findOneBy(Venue, { name: data.name });
  return existing ?? manager.save(manager.create(Venue, data));
}

async function ensureMember(
  manager: EntityManager,
  user: User,
  venue: Venue,
  role: VenueRole,
): Promise<void> {
  const existing = await manager.findOneBy(VenueMember, {
    userId: user.id,
    venueId: venue.id,
  });
  if (!existing) {
    await manager.save(
      manager.create(VenueMember, { userId: user.id, venueId: venue.id, role }),
    );
  }
}

async function ensureBoxes(
  manager: EntityManager,
  venue: Venue,
): Promise<number> {
  const actualBoxes = await manager.countBy(Box, {
    venueId: venue.id,
    pickupEnd: MoreThan(new Date()),
  });
  if (actualBoxes > 0) {
    return 0;
  }

  const now = Date.now();
  const at = (minutes: number) => new Date(now + minutes * MINUTE);
  const boxes: Array<Partial<Box>> = [
    {
      // Окно начинается через 10 минут — выдавать можно сразу (за 15 минут до начала)
      title: 'Бокс выпечки',
      description: 'Круассаны, булочки с корицей и багет',
      originalPrice: 90000,
      price: 39000,
      quantity: 5,
      pickupStart: at(10),
      pickupEnd: at(130),
    },
    {
      title: 'Сладкий бокс',
      description: 'Эклеры и пирожные дня',
      originalPrice: 120000,
      price: 49000,
      quantity: 3,
      pickupStart: at(60),
      pickupEnd: at(180),
    },
    {
      title: 'Хлебный бокс',
      description: 'Два хлеба на закваске',
      originalPrice: 50000,
      price: 19900,
      quantity: 4,
      pickupStart: at(90),
      pickupEnd: at(210),
    },
    {
      // Последний экземпляр — удобно проверять BOX_SOLD_OUT и гонку
      title: 'Последний бокс',
      description: 'Остаток витрины — сюрприз от пекаря',
      originalPrice: 70000,
      price: 29000,
      quantity: 1,
      pickupStart: at(10),
      pickupEnd: at(130),
    },
  ];

  for (const box of boxes) {
    await manager.save(
      manager.create(Box, {
        ...box,
        venueId: venue.id,
        status: BoxStatus.PUBLISHED,
      }),
    );
  }
  return boxes.length;
}

async function seed() {
  await dataSource.initialize();
  try {
    // Всё в одной транзакции: либо данные созданы полностью, либо не созданы вовсе
    const createdBoxes = await dataSource.transaction(async (manager) => {
      const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
      const user = (email: string, name: string, role = UserRole.USER) =>
        findOrCreateUser(manager, { email, name, role, passwordHash });

      await user('admin@test.dev', 'Администратор', UserRole.ADMIN);
      const owner = await user('owner@test.dev', 'Владелец пекарни');
      const staff = await user('staff@test.dev', 'Сотрудник пекарни');
      await user('client@test.dev', 'Клиент');

      const bakery = await findOrCreateVenue(manager, {
        name: 'Пекарня «Утро»',
        address: 'Москва, ул. Тверская, 1',
        lat: 55.7575,
        lng: 37.6156,
        status: VenueStatus.ACTIVE,
      });
      await ensureMember(manager, owner, bakery, VenueRole.OWNER);
      await ensureMember(manager, staff, bakery, VenueRole.STAFF);

      // Заведение на модерации — его можно одобрить под admin@test.dev
      const pending = await findOrCreateVenue(manager, {
        name: 'Кофейня «Вечер»',
        address: 'Москва, ул. Арбат, 10',
        lat: 55.7494,
        lng: 37.5912,
        status: VenueStatus.PENDING,
      });
      await ensureMember(manager, owner, pending, VenueRole.OWNER);

      return ensureBoxes(manager, bakery);
    });

    console.log('Seed выполнен.');
    console.log(
      'Пользователи (пароль у всех Password123!): admin@test.dev, owner@test.dev, staff@test.dev, client@test.dev',
    );
    console.log(
      createdBoxes > 0
        ? `Создано опубликованных боксов: ${createdBoxes}`
        : 'Актуальные боксы уже есть — новые не создавались',
    );
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed не выполнен:', error);
  process.exit(1);
});
