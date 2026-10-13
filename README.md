# ДоЗакрытия — MVP бэкенда

Кафе и пекарни продают непроданную за день еду «боксами» со скидкой. Клиент бронирует бокс,
оплачивает (имитация платёжного провайдера) и забирает по 6-значному коду выдачи.

- Swagger: http://localhost:3000/docs
- Проверка здоровья: http://localhost:3000/health
- Архитектура (ER-диаграмма, статусы брони, маршруты с ролями): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Стек

Node.js 24 LTS, NestJS 12, TypeScript 6 (strict), PostgreSQL 16, TypeORM 0.3 (только миграции,
`synchronize: false`), passport-jwt + httpOnly cookie, class-validator, Swagger, @nestjs/schedule,
Jest + supertest, Docker / docker compose, GitLab CI. Redis не используется — всё хранится в PostgreSQL.

## Структура

```
src/
  main.ts                 точка входа
  app.module.ts           корневой модуль: конфиг, БД, cron, модули
  configure-app.ts        общая настройка (cookie, CORS, ValidationPipe, фильтр ошибок) — и для main, и для тестов
  data-source.ts          подключение для TypeORM CLI (миграции) и seed
  common/                 фильтр ошибок, коды ошибок, @Roles, @CurrentUser, guards, валидация env
  auth/  users/  venues/  boxes/  bookings/  payments/  health/
  migrations/             миграции (генерируются по сущностям)
  seed/seed.ts            тестовые данные
test/                     e2e-тесты и их инфраструктура
```

Каждый модуль устроен стандартно для NestJS: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
`*.entity.ts`, `dto/`. Неочевидные места (транзакции, атомарные UPDATE, guards, idempotency,
подпись вебхука, миграции, cron) прокомментированы в коде.

## Быстрый старт (локальная разработка)

Нужны **Node.js ≥ 24.9** (актуальная LTS) и Docker с compose.

```bash
cp .env.example .env          # шаблон переменных; для разработки подходит как есть
npm ci                        # зависимости
docker compose up -d db       # только PostgreSQL в Docker
npm run migration:run         # создать таблицы
npm run seed                  # тестовые пользователи, заведения и боксы
npm run start:dev             # API с перезапуском при изменении кода
```

Открыть http://localhost:3000/docs.

## Запуск через Docker

```bash
cp .env.example .env                              # и поменять секреты
docker compose up -d --build                      # db + api; миграции применяются при старте api
docker compose exec api node dist/seed/seed.js    # (по желанию) тестовые данные
docker compose logs -f api
```

`docker-compose.yml` один и для разработки, и для деплоя:

- `db` — `postgres:16`, данные в томе `pgdata`, healthcheck через `pg_isready`, порт проброшен только на `127.0.0.1`;
- `api` — собирается из `Dockerfile`, стартует только после того, как `db` стал healthy, `restart: unless-stopped`,
  порт берётся из `PORT`.

`Dockerfile` двухэтапный: на этапе `build` ставятся все зависимости и собирается `dist`, в runtime-образ
(`node:24-alpine`) попадают только `dist` и production-зависимости. Команда контейнера:
`npm run migration:run:prod && exec node dist/main`.

Остановить и удалить вместе с данными: `docker compose down -v`.

## Переменные окружения

Проверяются при старте (`src/common/env.validation.ts`): если чего-то нет или значение некорректно,
приложение не запустится и напишет, что не так.

| Переменная | Пример / по умолчанию | Назначение |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `production` / `test`. В `production` cookie ставится с `secure`, а `/payments/dev/simulate` отвечает 404 |
| `PORT` | `3000` | Порт API (и порт, который compose пробрасывает наружу) |
| `DB_HOST` | `localhost` | Хост PostgreSQL. В compose для `api` подменяется на `db` |
| `DB_PORT` | `5432` | Порт PostgreSQL на хосте. В compose для `api` подменяется на `5432` |
| `DB_USER` / `DB_PASSWORD` | `dozakrytiya` | Пользователь БД (compose создаёт его в контейнере `db`) |
| `DB_NAME` | `dozakrytiya` | Основная БД |
| `DB_NAME_TEST` | `dozakrytiya_test` | БД для e2e-тестов, создаётся автоматически |
| `JWT_SECRET` | — | Секрет подписи JWT, минимум 32 символа |
| `WEBHOOK_SECRET` | — | Секрет HMAC-подписи вебхуков, минимум 16 символов |
| `CORS_ORIGIN` | `http://localhost:5173` | Origin фронтенда. С `credentials: true` нельзя `*` |
| `BOOKING_HOLD_SECONDS` | `600` | Сколько секунд неоплаченная бронь держит товар |

`.env` в `.gitignore`, в репозитории только `.env.example`.

## Миграции

Схема БД меняется **только** миграциями (`synchronize: false`). Миграции генерируются TypeORM по
разнице между сущностями (`*.entity.ts`) и текущей схемой БД — SQL руками не пишем.

```bash
npm run migration:generate -- src/migrations/AddSomething   # сгенерировать по изменениям в сущностях
npm run migration:run                                       # применить новые миграции
npm run migration:revert                                    # откатить последнюю
npm run migration:run:prod                                  # применить из собранного dist (так делает Docker при старте)
```

`migration:generate`, `migration:run` и `migration:revert` работают с исходниками через ts-node
(`src/data-source.ts`), `migration:run:prod` — с `dist/data-source.js`, поэтому внутри образа не нужен
TypeScript. Расширение `uuid-ossp` (функция `uuid_generate_v4()`) TypeORM создаёт сам при подключении.

## Seed и тестовые учётки

```bash
npm run seed                                    # локально
docker compose exec api node dist/seed/seed.js  # в Docker
```

Скрипт идемпотентный: повторный запуск ничего не дублирует. Боксы создаются, только если у пекарни нет
ни одного бокса с ещё не закончившимся окном выдачи (так на следующий день можно получить свежие).

Пароль у всех: **`Password123!`**

| Email | Роль | Что может |
|---|---|---|
| `admin@test.dev` | ADMIN | Одобрять и отклонять заведения |
| `owner@test.dev` | USER, OWNER «Пекарни «Утро»» (ACTIVE) и «Кофейни «Вечер»» (PENDING) | Создавать и публиковать боксы, добавлять сотрудников, выдавать заказы |
| `staff@test.dev` | USER, STAFF «Пекарни «Утро»» | Выдавать заказы |
| `client@test.dev` | USER | Искать, бронировать, оплачивать |

Боксы «Пекарни «Утро»» (координаты 55.7575, 37.6156 — центр Москвы), все опубликованы:

| Бокс | Остаток | Окно выдачи |
|---|---|---|
| Бокс выпечки | 5 | через 10 минут, 2 часа — выдавать можно сразу |
| Сладкий бокс | 3 | через 1 час |
| Хлебный бокс | 4 | через 1,5 часа |
| Последний бокс | **1** | через 10 минут — для проверки `BOX_SOLD_OUT` |

## Тесты

```bash
npm run test       # unit (без БД): карта переходов статусов брони, правила бокса, подпись вебхука
npm run test:e2e   # e2e (supertest + настоящая PostgreSQL); нужна запущенная БД: docker compose up -d db
```

E2E-тесты работают с отдельной БД `DB_NAME_TEST`: `test/global-setup.ts` создаёт её, если нужно,
и применяет миграции; перед каждым набором тестов таблицы очищаются (`TRUNCATE`).

Jest запускается с флагом `--experimental-vm-modules` — см. «Принятые решения», п. 1.

## Ошибки

Любая ошибка возвращается в одном формате (глобальный `AllExceptionsFilter`):

```json
{
  "statusCode": 409,
  "code": "BOX_SOLD_OUT",
  "message": "Бокс закончился",
  "details": null,
  "path": "/bookings",
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

Для `VALIDATION_ERROR` в `details` — ошибки по полям: `{ "price": ["Цена со скидкой должна быть не больше 50% от исходной"] }`.

| HTTP | code | Когда |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Тело или query не прошли валидацию, лишние поля; правила бокса (цена > 50%, окно выдачи) |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Нет заголовка `Idempotency-Key` или это не UUID |
| 400 | `BAD_REQUEST` | Прочие некорректные запросы, например id в URL — не UUID |
| 401 | `UNAUTHORIZED` | Нет cookie `access_token`, токен невалиден или истёк |
| 401 | `INVALID_CREDENTIALS` | Неверный email или пароль (ответ одинаковый в обоих случаях) |
| 401 | `INVALID_SIGNATURE` | Неверная или отсутствующая подпись `X-Signature` вебхука |
| 403 | `FORBIDDEN` | Нет нужной глобальной роли (эндпоинты `/admin/*` — только ADMIN) |
| 403 | `NOT_VENUE_OWNER` | Действие доступно только OWNER заведения |
| 403 | `NOT_VENUE_MEMBER` | Выдача доступна только OWNER/STAFF заведения |
| 403 | `VENUE_NOT_ACTIVE` | Боксы можно создавать только в заведении со статусом ACTIVE |
| 403 | `OWN_VENUE_BOOKING` | Нельзя бронировать боксы заведения, где ты OWNER или STAFF |
| 404 | `NOT_FOUND` | Нет такого маршрута; `/payments/dev/simulate` в production |
| 404 | `USER_NOT_FOUND` / `VENUE_NOT_FOUND` / `BOX_NOT_FOUND` / `BOOKING_NOT_FOUND` / `PAYMENT_NOT_FOUND` | Сущность не найдена (чужая бронь тоже «не найдена») |
| 409 | `EMAIL_TAKEN` | Email уже зарегистрирован |
| 409 | `ALREADY_MEMBER` | Пользователь уже состоит в заведении |
| 409 | `BOX_NOT_DRAFT` | Опубликовать можно только черновик |
| 409 | `BOX_NOT_AVAILABLE` | Бокс не продаётся: черновик, закрыт, выдача закончилась или заведение не ACTIVE |
| 409 | `BOX_SOLD_OUT` | Остатка не хватает |
| 409 | `RESERVATION_LIMIT` | Уже 2 активные брони (RESERVED или PAID) |
| 409 | `BOOKING_EXPIRED` | Время на оплату брони истекло |
| 409 | `INVALID_STATUS_TRANSITION` | Недопустимая смена статуса брони (например, отмена оплаченной, повторная выдача) |
| 409 | `OUTSIDE_PICKUP_WINDOW` | Выдача вне окна (pickupStart − 15 мин … pickupEnd + 15 мин) |
| 409 | `CONFLICT` | Прочие конфликты без собственного кода |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Этот `Idempotency-Key` уже использован с другим телом запроса |
| 500 | `INTERNAL_ERROR` | Непредвиденная ошибка (подробности — только в логе сервера) |
| 503 | `DB_UNAVAILABLE` | `/health`: база данных недоступна |

## Сценарий «бронь → оплата → выдача» через Swagger

Авторизация — httpOnly cookie. Swagger UI открыт на том же адресе, что и API, поэтому после
`POST /auth/login` браузер сам сохранит cookie и будет отправлять её во все запросы. Кнопку
**Authorize** (замок) для cookie заполнять не нужно — браузер не даёт JavaScript'у ставить cookie.

1. Выполните `npm run seed` и откройте http://localhost:3000/docs.
2. **`POST /auth/login`** с `{ "email": "client@test.dev", "password": "Password123!" }` → 200, cookie сохранена.
3. **`GET /boxes`** с `lat = 55.7558`, `lng = 37.6173` → скопируйте `id` бокса «Бокс выпечки».
4. **`POST /bookings`**: в поле `Idempotency-Key` — любой UUID (например, `3f0e9a52-8a51-4a7e-9a0e-6f6d3c2b1a00`;
   для следующей брони нужен новый), тело `{ "boxId": "<id бокса>", "quantity": 1 }` → 201, бронь `RESERVED`.
   Скопируйте её `id`. Повторите запрос с тем же ключом — вернётся та же бронь.
5. **`POST /bookings/{id}/pay`** → `{ "paymentId": "..." }`.
6. **`POST /payments/dev/simulate/{paymentId}`** → приложение само подписывает вебхук `succeeded`
   и отправляет его на `/payments/webhook`; в ответе `webhookStatus: 200`.
7. **`GET /bookings/my`** → бронь в статусе `PAID`, в поле `pickupCode` — 6 цифр.
8. **`POST /auth/login`** с `{ "email": "staff@test.dev", "password": "Password123!" }` — теперь вы сотрудник.
9. **`GET /auth/me`** → в `memberships[0].venueId` — id пекарни.
10. **`POST /venues/{id}/pickup`** с `{ "code": "<pickupCode>" }` → бронь `PICKED_UP`. Повторная выдача → 409.

Окно выдачи «Бокса выпечки» начинается через 10 минут после seed, а выдавать можно за 15 минут до начала, —
поэтому шаг 10 работает сразу. Для «Сладкого бокса» тот же шаг вернёт `409 OUTSIDE_PICKUP_WINDOW`.

## Как устроена защита от гонки за последний бокс

Задача: 20 человек одновременно бронируют бокс, которого осталась 1 штука. Должна получиться ровно
одна бронь, остаток — 0, а не −19.

**Почему нельзя «прочитать → проверить → записать».** Если сначала сделать `SELECT quantity`,
проверить `quantity >= 1` в коде, а потом `UPDATE ... SET quantity = 0`, то все 20 запросов успеют
прочитать `1` до того, как кто-то запишет `0`, — и все 20 решат, что бокс свободен.

**Как сделано.** Проверка и списание — один атомарный SQL-запрос внутри транзакции бронирования
(`BookingsService.create`):

```sql
UPDATE boxes SET quantity = quantity - :q
WHERE id = :id AND status = 'PUBLISHED' AND quantity >= :q
RETURNING quantity, price
```

1. Первый запрос блокирует строку бокса и уменьшает остаток до 0.
2. Остальные 19 ждут на этой блокировке, пока первая транзакция не закончится.
3. После её коммита PostgreSQL (уровень изоляции READ COMMITTED) **заново проверяет `WHERE`** на свежей
   версии строки: `quantity >= 1` уже ложно → затронуто 0 строк → `409 BOX_SOLD_OUT`.
4. Если остаток стал 0, в той же транзакции бокс переводится в `SOLD_OUT`, а бронь создаётся там же:
   либо списание и бронь сохраняются вместе, либо откатываются вместе.

Дополнительно:

- `CHECK (quantity >= 0)` на таблице `boxes` — страховка на уровне БД: остаток не уйдёт в минус даже при ошибке в коде.
- Брони **одного** пользователя выполняются по очереди: транзакция начинается с `SELECT ... FOR UPDATE`
  строки пользователя. Без этого два параллельных запроса оба насчитали бы «1 активная бронь» и оба прошли
  бы лимит в 2 брони. Эта же блокировка делает надёжным `Idempotency-Key`: повтор с тем же ключом дождётся
  первого запроса и вернёт его сохранённый ответ.
- Возврат остатка (отмена, истечение) — тоже атомарный `UPDATE ... SET quantity = quantity + :q`.
- Все смены статуса брони идут через одну функцию `BookingsService.changeStatus` с картой разрешённых
  переходов, а сама бронь перед изменением блокируется (`SELECT ... FOR UPDATE`) — поэтому cron, вебхук
  оплаты и отмена не могут одновременно изменить одну бронь.

E2E-тест `test/bookings.e2e-spec.ts` отправляет 20 параллельных броней от 20 разных пользователей на бокс
с `quantity = 1` и проверяет: ровно один ответ 201, девятнадцать — `409 BOX_SOLD_OUT`, остаток 0, бронь в БД одна.

## Вебхуки оплаты

- Подпись: `X-Signature = hex(HMAC-SHA256(сырое тело запроса, WEBHOOK_SECRET))`. Проверяет
  `WebhookSignatureGuard` по `req.rawBody` (включено `rawBody: true` в `main.ts`) через `timingSafeEqual`.
- Идемпотентность: `INSERT INTO webhook_events ... ON CONFLICT DO NOTHING`. Если `eventId` уже был —
  ответ `200 { "duplicate": true }`, ничего не меняется.
- `succeeded` + бронь `RESERVED` и не истекла → бронь `PAID` + код выдачи, платёж `SUCCEEDED`;
  сумма не совпала с суммой брони → платёж `FAILED`; бронь уже истекла (или отменена) → платёж
  `REFUND_REQUIRED`, бронь не воскрешается; `failed` → платёж `FAILED`, бронь остаётся `RESERVED`.

Пример ручной отправки вебхука:

```bash
BODY='{"eventId":"evt_1","paymentId":"<paymentId>","status":"succeeded","amount":39000}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/payments/webhook \
  -H 'Content-Type: application/json' -H "X-Signature: $SIG" -d "$BODY"
```

## GitLab CI

`.gitlab-ci.yml`, стадии `lint → test → build → deploy`:

| Job | Где | Что делает |
|---|---|---|
| `lint` | shared runner, `node:24-alpine` | `npm run lint` (oxlint) |
| `test` | shared runner + сервис `postgres:16` | `npm run migration:run`, `npm run test`, `npm run test:e2e` |
| `build:app` | shared runner | `npm run build`, артефакт `dist/` |
| `build:image` | shared runner, Docker-in-Docker | `docker build` |
| `deploy` | **ваш компьютер**, раннер с тегом `local` | только ветка `main`: копирует `.env` и выполняет `docker compose up -d --build` |

### Раннер с shell executor и тегом `local`

Инструкция для Linux (Ubuntu/Debian); на macOS `gitlab-runner` ставится через `brew install gitlab-runner`,
остальные шаги те же. Скрипт `deploy` написан для bash — для Windows его нужно адаптировать под PowerShell.

1. **Docker и compose** уже стоят? Проверка: `docker compose version`.
2. **Установить GitLab Runner:**
   ```bash
   curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
   sudo apt-get install -y gitlab-runner
   ```
3. **Дать раннеру доступ к Docker** (job'ы выполняются от пользователя `gitlab-runner`):
   ```bash
   sudo usermod -aG docker gitlab-runner
   sudo systemctl restart gitlab-runner
   ```
   На Ubuntu shell executor иногда падает на `.bash_logout` (`prepare environment: exit status 1`) —
   тогда удалите файл: `sudo rm /home/gitlab-runner/.bash_logout`.
4. **Создать раннер в GitLab:** проект → *Settings → CI/CD → Runners → New project runner*.
   Tags: `local`; галочку *Run untagged jobs* **не** ставить — тогда на ваш компьютер попадёт только `deploy`.
   GitLab покажет токен вида `glrt-...`.
5. **Зарегистрировать раннер** на компьютере:
   ```bash
   sudo gitlab-runner register \
     --non-interactive \
     --url "https://gitlab.com" \
     --token "glrt-..." \
     --executor "shell" \
     --description "local-deploy"
   sudo gitlab-runner verify
   ```
   (Для self-hosted GitLab укажите его адрес в `--url`. При регистрации по токену `glrt-` теги задаются
   в интерфейсе GitLab на шаге 4.)
6. **Положить `.env` для деплоя** — вне репозитория. По умолчанию job берёт `/opt/dozakrytiya/.env`;
   другой путь задаётся CI/CD-переменной `DEPLOY_ENV_FILE`:
   ```bash
   sudo mkdir -p /opt/dozakrytiya
   sudo cp .env /opt/dozakrytiya/.env      # с NODE_ENV=production и настоящими секретами
   sudo chown -R gitlab-runner:gitlab-runner /opt/dozakrytiya
   sudo chmod 600 /opt/dozakrytiya/.env
   ```
7. Запушить в `main` — после `lint`, `test` и `build` выполнится `deploy`. Проверка: `curl http://localhost:3000/health`.

Имя compose-проекта зафиксировано (`name: dozakrytiya`), поэтому каждый деплой обновляет одни и те же
контейнеры, а данные БД сохраняются в томе `dozakrytiya_pgdata`. Если на этой же машине вы запускаете
`docker compose` из рабочей копии для разработки — это тот же самый проект и та же БД.

С `NODE_ENV=production` cookie ставится с флагом `Secure`: браузеры принимают его на `https://` и на
`http://localhost`, но не на `http://<IP-адрес>`. Для доступа по сети нужен HTTPS (например, reverse proxy).

## Принятые решения

Там, где ТЗ допускало варианты, выбран самый простой.

1. **NestJS 12 + Jest.** NestJS 12 распространяется только как ES-модули, а его шаблон по умолчанию
   использует Vitest. Чтобы остаться на Jest (по ТЗ) и классическом CommonJS-стиле кода NestJS (без `.js`
   в импортах и без `Relation<>` в сущностях), проект собирается в CommonJS, а ESM-пакеты Nest подключаются
   через `require(esm)` (Node ≥ 22.12). Jest умеет `require(esm)` на Node ≥ 24.9 с флагом
   `--experimental-vm-modules` — он прописан в скриптах `test` и `test:e2e`. Отсюда требование Node ≥ 24.9.
2. **TypeScript 6.0**, а не 7: ts-jest пока поддерживает TypeScript < 7.
3. **Линтер — oxlint**, как в шаблоне NestJS 12 (вместо ESLint).
4. **Регистрация не логинит:** cookie ставит только `POST /auth/login`. `POST /auth/logout` не требует
   авторизации — просто удаляет cookie.
5. **`GET /venues/:id`** доступен любому авторизованному пользователю и возвращает все боксы заведения
   (включая черновики) и участников с их данными (без хэша пароля).
6. **Модерация:** approve/reject не проверяют текущий статус — админ может, например, отклонить ранее
   одобренное заведение. Approve очищает `rejectReason`.
7. **Поиск `GET /boxes`:** `lat` и `lng` обязательны; `radiusKm > 20` или `limit > 50` → 400 (а не тихое
   ограничение); сортировка по расстоянию; `total` — без учёта `limit/offset`.
8. **Бронирование:** кроме `BOX_SOLD_OUT` есть `BOX_NOT_AVAILABLE` — для черновика, закрытого бокса,
   закончившейся выдачи или неактивного заведения. Сумма брони берётся из того же атомарного UPDATE.
9. **Лимит активных броней** считает RESERVED и PAID. Оплаченная, но не забранная бронь остаётся активной —
   обработка «не пришёл за заказом» в MVP не реализована.
10. **Idempotency-Key** обязателен только для `POST /bookings`. Сохраняются только успешные ответы
    (при ошибке повтор с тем же ключом выполнится заново). Ключ, уже использованный другим пользователем,
    тоже даёт `422 IDEMPOTENCY_KEY_REUSED`. Старые ключи не удаляются.
11. **Отмена** возможна только для `RESERVED`; отмена оплаченной брони (возврат денег) — вне MVP.
12. **Оплата:** `POST /bookings/:id/pay` проверяет, что бронь `RESERVED` и не истекла. Вебхук по
    неизвестному `paymentId` → 404, и его `eventId` не запоминается (провайдер сможет повторить).
    Если оплата пришла после истечения срока, а cron ещё не успел закрыть бронь, — она закрывается сразу
    (EXPIRED + возврат остатка), а платёж получает `REFUND_REQUIRED`.
13. **`/payments/dev/simulate/:paymentId`** не требует авторизации, отправляет настоящий HTTP-запрос
    на собственный `/payments/webhook` и при `NODE_ENV=production` отвечает 404.
14. **Код выдачи** — случайные 6 цифр (`crypto.randomInt`), уникальные среди оплаченных броней заведения.
15. **Cron** запускается раз в минуту и обрабатывает до 100 просроченных броней за раз, каждую в своей
    транзакции. При нескольких экземплярах API двойной обработки не будет благодаря блокировкам строк.
16. **Имена таблиц** во множественном числе (`users`, `boxes`, ...) — `user` зарезервировано в PostgreSQL.
    Колонки — в camelCase, как по умолчанию в TypeORM, поэтому в сыром SQL их нужно брать в кавычки: `"venueId"`.
17. **Деплой:** `.env` копируется из `DEPLOY_ENV_FILE` (по умолчанию `/opt/dozakrytiya/.env`) в каталог
    сборки раннера, потому что GitLab Runner очищает этот каталог перед каждым job'ом.
