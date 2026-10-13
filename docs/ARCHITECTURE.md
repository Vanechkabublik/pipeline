# Архитектура «ДоЗакрытия»

Монолит на NestJS: модули `auth`, `users`, `venues`, `boxes`, `bookings`, `payments`, `health`
поверх одной базы PostgreSQL. Каждый модуль — стандартные `module / controller / service / entity / dto`.

Зависимости модулей направлены в одну сторону, без циклов:

```mermaid
flowchart LR
  auth --> users
  venues --> users
  boxes --> venues
  bookings --> venues
  payments --> bookings
```

## ER-диаграмма

Деньги — `integer` в копейках, время — `timestamptz` (UTC). Внешние ключи броней и платежей — `ON DELETE RESTRICT`:
финансовую историю удалить нельзя.

```mermaid
erDiagram
  users ||--o{ venue_members : "состоит в заведениях"
  venues ||--o{ venue_members : "участники"
  venues ||--o{ boxes : "продаёт"
  users ||--o{ bookings : "бронирует (RESTRICT)"
  boxes ||--o{ bookings : "бронируется (RESTRICT)"
  bookings ||--o{ payments : "попытки оплаты (RESTRICT)"
  users ||..o{ idempotency_keys : "userId (без FK)"

  users {
    uuid id PK
    varchar email UK
    varchar passwordHash
    varchar name
    enum role "USER | ADMIN"
    timestamptz createdAt
  }
  venues {
    uuid id PK
    varchar name
    varchar address
    double lat
    double lng
    enum status "PENDING | ACTIVE | REJECTED"
    text rejectReason "nullable"
    timestamptz createdAt
  }
  venue_members {
    uuid id PK
    uuid userId FK "UNIQUE(userId, venueId)"
    uuid venueId FK
    enum role "OWNER | STAFF"
  }
  boxes {
    uuid id PK
    uuid venueId FK
    varchar title
    text description
    int originalPrice "копейки"
    int price "копейки, не больше 50% originalPrice"
    int quantity "текущий остаток, CHECK >= 0"
    timestamptz pickupStart
    timestamptz pickupEnd
    enum status "DRAFT | PUBLISHED | SOLD_OUT | CLOSED"
    timestamptz createdAt
  }
  bookings {
    uuid id PK
    uuid userId FK
    uuid boxId FK
    int quantity "1-3"
    int amount "фиксируется при бронировании"
    enum status "RESERVED | PAID | PICKED_UP | EXPIRED | CANCELLED"
    timestamptz expiresAt
    varchar pickupCode "6 цифр, nullable"
    timestamptz createdAt
  }
  payments {
    uuid id PK
    uuid bookingId FK
    int amount
    enum status "PENDING | SUCCEEDED | FAILED | REFUND_REQUIRED"
    timestamptz createdAt
  }
  webhook_events {
    varchar eventId PK "повтор = конфликт PK"
  }
  idempotency_keys {
    uuid key PK
    uuid userId
    varchar requestHash "sha256 тела запроса"
    int responseStatus
    jsonb responseBody
    timestamptz createdAt
  }
```

## Статусы брони

Все переходы проходят через одну функцию `BookingsService.changeStatus`, которая сверяется с картой
`BOOKING_STATUS_TRANSITIONS` (`src/bookings/booking-status.ts`). Любой другой переход → `409 INVALID_STATUS_TRANSITION`.

```mermaid
stateDiagram-v2
  [*] --> RESERVED : POST /bookings<br/>остаток бокса уменьшается
  RESERVED --> PAID : вебхук succeeded<br/>сумма совпала, срок не истёк<br/>генерируется pickupCode
  RESERVED --> CANCELLED : DELETE /bookings/:id<br/>остаток возвращается
  RESERVED --> EXPIRED : cron раз в минуту после expiresAt<br/>(или вебхук пришёл слишком поздно)<br/>остаток возвращается
  PAID --> PICKED_UP : POST /venues/:id/pickup<br/>в окне выдачи ± 15 минут
  PICKED_UP --> [*]
  CANCELLED --> [*]
  EXPIRED --> [*]
```

Связанные статусы:

- **Бокс:** `DRAFT → PUBLISHED` (публикация владельцем); `PUBLISHED → SOLD_OUT`, когда остаток стал 0;
  `SOLD_OUT → PUBLISHED`, когда остаток вернулся (отмена или истечение брони). `CLOSED` зарезервирован, в MVP не используется.
- **Платёж:** создаётся `PENDING`; вебхук переводит его в `SUCCEEDED` (бронь стала PAID), `FAILED`
  (провайдер сообщил об ошибке или сумма не совпала) или `REFUND_REQUIRED` (деньги пришли, а бронь
  уже не оплатить — нужен возврат).

## Маршруты и роли

«Авторизованный» — есть валидная cookie `access_token`. OWNER / STAFF — роль в конкретном заведении
(`venue_members`), ADMIN — глобальная роль пользователя.

| Метод | Путь | Кто может | Что делает |
|---|---|---|---|
| POST | `/auth/register` | все | Регистрация (роль USER) |
| POST | `/auth/login` | все | Вход, ставит httpOnly cookie `access_token` (JWT на 24 часа) |
| POST | `/auth/logout` | все | Удаляет cookie |
| GET | `/auth/me` | авторизованный | Пользователь и его членства в заведениях с ролями |
| POST | `/venues` | авторизованный | Создать заведение (PENDING), создатель — OWNER |
| GET | `/venues/:id` | авторизованный | Заведение с боксами и участниками |
| POST | `/venues/:id/staff` | OWNER заведения | Добавить сотрудника (STAFF) по email |
| PATCH | `/admin/venues/:id/approve` | ADMIN | Одобрить → ACTIVE |
| PATCH | `/admin/venues/:id/reject` | ADMIN | Отклонить с причиной → REJECTED |
| GET | `/boxes` | все | Поиск: опубликованные боксы рядом, с расстоянием и пагинацией |
| POST | `/boxes` | OWNER заведения в статусе ACTIVE | Создать бокс (DRAFT) |
| POST | `/boxes/:id/publish` | OWNER заведения бокса | DRAFT → PUBLISHED |
| POST | `/bookings` | авторизованный, кроме OWNER/STAFF заведения бокса | Бронь (нужен заголовок `Idempotency-Key`) |
| GET | `/bookings/my` | авторизованный | Свои брони |
| DELETE | `/bookings/:id` | автор брони | Отмена: RESERVED → CANCELLED |
| POST | `/bookings/:id/pay` | автор брони | Создать платёж PENDING → `{ paymentId }` |
| POST | `/payments/webhook` | платёжный провайдер (подпись `X-Signature`) | Результат оплаты |
| POST | `/payments/dev/simulate/:paymentId` | все, только при `NODE_ENV != production` | Отправить себе подписанный вебхук succeeded |
| POST | `/venues/:id/pickup` | OWNER или STAFF заведения | Выдача по коду: PAID → PICKED_UP |
| GET | `/health` | все | Проверка API и подключения к БД |

## Где что проверяется

| Проверка | Где |
|---|---|
| Валидность JWT в cookie | `JwtAuthGuard` → `JwtStrategy` (`common/guards`, `auth/strategies`) |
| Глобальная роль ADMIN | `RolesGuard` + `@Roles()` |
| Роль в заведении (OWNER / STAFF) | `VenuesService.assertOwner / assertMember / getMemberRole` |
| Поля запросов | DTO + глобальный `ValidationPipe` |
| Правила бокса (цена, окно выдачи) | `validateBoxRules()` (`boxes/box-rules.ts`) |
| Переходы статусов брони | `assertBookingTransition()` (`bookings/booking-status.ts`) |
| Подпись вебхука | `WebhookSignatureGuard` (`payments/webhook-signature.guard.ts`) |
| Переменные окружения | `validateEnv()` при старте (`common/env.validation.ts`) |
