import * as bcrypt from 'bcrypt';
import { MoreThan } from 'typeorm';
import { Box, BoxStatus } from './boxes/box.entity';
import dataSource from './data-source';
import { User, UserRole } from './users/user.entity';
import { VenueMember, VenueRole } from './venues/venue-member.entity';
import { Venue, VenueStatus } from './venues/venue.entity';

// Тестовые данные. Можно запускать много раз — дублей не будет.
async function seed() {
  await dataSource.initialize();
  const m = dataSource.manager;
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const user = async (email: string, name: string, role = UserRole.USER) =>
    (await m.findOneBy(User, { email })) ??
    m.save(m.create(User, { email, name, role, passwordHash }));

  const venue = async (
    name: string,
    status: VenueStatus,
    lat: number,
    lng: number,
  ) =>
    (await m.findOneBy(Venue, { name })) ??
    m.save(m.create(Venue, { name, address: 'Москва', lat, lng, status }));

  const member = async (u: User, v: Venue, role: VenueRole) => {
    if (!(await m.existsBy(VenueMember, { userId: u.id, venueId: v.id }))) {
      await m.save(
        m.create(VenueMember, { userId: u.id, venueId: v.id, role }),
      );
    }
  };

  await user('admin@test.dev', 'Админ', UserRole.ADMIN);
  const owner = await user('owner@test.dev', 'Владелец');
  const staff = await user('staff@test.dev', 'Сотрудник');
  await user('client@test.dev', 'Клиент');

  const bakery = await venue(
    'Пекарня «Утро»',
    VenueStatus.ACTIVE,
    55.7575,
    37.6156,
  );
  const cafe = await venue(
    'Кофейня «Вечер»',
    VenueStatus.PENDING,
    55.7494,
    37.5912,
  );
  await member(owner, bakery, VenueRole.OWNER);
  await member(staff, bakery, VenueRole.STAFF);
  await member(owner, cafe, VenueRole.OWNER);

  // 4 опубликованных бокса, если у пекарни нет актуальных. Выдача: через 10 минут, на 2 часа.
  if (
    !(await m.existsBy(Box, {
      venueId: bakery.id,
      pickupEnd: MoreThan(new Date()),
    }))
  ) {
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000);
    const boxes: [string, number, number, number][] = [
      ['Бокс выпечки', 90000, 39000, 5],
      ['Сладкий бокс', 120000, 49000, 3],
      ['Хлебный бокс', 50000, 19900, 4],
      ['Последний бокс', 70000, 29000, 1],
    ];
    for (const [title, originalPrice, price, quantity] of boxes) {
      await m.save(
        m.create(Box, {
          venueId: bakery.id,
          title,
          description: 'Свежая выпечка дня',
          originalPrice,
          price,
          quantity,
          pickupStart: at(10),
          pickupEnd: at(130),
          status: BoxStatus.PUBLISHED,
        }),
      );
    }
  }

  console.log('Seed готов. Пароль у всех: Password123!');
  await dataSource.destroy();
}

seed();
