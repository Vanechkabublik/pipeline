# ДоЗакрытия — бэкенд (MVP)

Кафе продают остатки еды «боксами» со скидкой: клиент бронирует бокс, оплачивает и забирает по коду.

NestJS 11 + PostgreSQL 16 + TypeORM. Документация API — Swagger: http://localhost:3000/docs

## Запуск для разработки

Нужны Node.js 22+ и Docker.

```bash
cp .env.example .env
npm install
docker compose up -d db     # только база
npm run migration:run       # создать таблицы
npm run seed                # тестовые данные
npm run start:dev           # API на http://localhost:3000
```

## Деплой

```bash
cp .env.example .env        # поменять JWT_SECRET, WEBHOOK_SECRET, NODE_ENV=production
docker compose up -d --build
```

Миграции применяются сами при старте контейнера.

## Тестовые учётки (пароль `Password123!`)

| Email | Кто |
|---|---|
| admin@test.dev | админ: одобряет заведения |
| owner@test.dev | владелец «Пекарни «Утро»» |
| staff@test.dev | сотрудник пекарни: выдаёт заказы |
| client@test.dev | клиент |

## Маршруты

| | |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | вход ставит httpOnly cookie `access_token` |
| `POST /venues`, `GET /venues/:id`, `POST /venues/:id/staff` | заведения |
| `PATCH /admin/venues/:id/approve`, `PATCH /admin/venues/:id/reject` | только админ |
| `GET /boxes?lat=&lng=&radiusKm=&maxPrice=&limit=&offset=` | поиск, без авторизации |
| `POST /boxes`, `POST /boxes/:id/publish` | только владелец |
| `POST /bookings` (заголовок `Idempotency-Key: <uuid>`), `GET /bookings/my`, `DELETE /bookings/:id` | брони |
| `POST /bookings/:id/pay` → `POST /payments/dev/simulate/:paymentId` | оплата (имитация) |
| `POST /payments/webhook` | вебхук провайдера, подпись `X-Signature` |
| `POST /venues/:id/pickup` `{ code }` | выдача (владелец или сотрудник) |

## Проверка через Swagger

1. `POST /auth/login` как `client@test.dev` — браузер сохранит cookie.
2. `GET /boxes` с `lat=55.7558`, `lng=37.6173` — скопировать id бокса.
3. `POST /bookings` с любым UUID в `Idempotency-Key` → id брони.
4. `POST /bookings/{id}/pay` → `paymentId`, затем `POST /payments/dev/simulate/{paymentId}`.
5. `GET /bookings/my` — бронь `PAID`, есть `pickupCode`.
6. `POST /auth/login` как `staff@test.dev`, `GET /auth/me` → id заведения, `POST /venues/{id}/pickup` с кодом → `PICKED_UP`.

## Полезные команды

```bash
npm test                                            # 2 теста (нужна запущенная база и миграции)
npm run migration:generate -- src/migrations/Name   # новая миграция после изменения сущностей
npm run migration:revert                            # откатить последнюю
```

## Как не продать последний бокс дважды

Остаток списывается одним SQL-запросом:
`UPDATE boxes SET quantity = quantity - 1 WHERE id = ... AND quantity >= 1`.
Если 20 человек нажали одновременно, Postgres выполнит эти запросы по очереди,
и у 19 из них условие `quantity >= 1` уже не выполнится → ответ 409. Это проверяет второй тест.
