// Сгенерировано командой `npm run migration:generate -- src/migrations/Init`
// по сущностям (*.entity.ts). Руками SQL не правим: меняем сущность и генерируем новую миграцию.
// uuid_generate_v4() — функция расширения uuid-ossp; TypeORM сам выполняет
// CREATE EXTENSION IF NOT EXISTS "uuid-ossp" при подключении, если в сущностях есть uuid-ключи.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1791896140326 implements MigrationInterface {
  name = 'Init1791896140326';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."boxes_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'SOLD_OUT', 'CLOSED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "boxes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venueId" uuid NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL, "originalPrice" integer NOT NULL, "price" integer NOT NULL, "quantity" integer NOT NULL, "pickupStart" TIMESTAMP WITH TIME ZONE NOT NULL, "pickupEnd" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."boxes_status_enum" NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_7b1d1bcbfbc10fbc90ba538e3c" CHECK ("quantity" >= 0), CONSTRAINT "PK_749574b01e0038dae8464fcb445" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('USER', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "name" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'USER', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."venue_members_role_enum" AS ENUM('OWNER', 'STAFF')`,
    );
    await queryRunner.query(
      `CREATE TABLE "venue_members" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "venueId" uuid NOT NULL, "role" "public"."venue_members_role_enum" NOT NULL, CONSTRAINT "UQ_6dce7b388d4333d462107a2c038" UNIQUE ("userId", "venueId"), CONSTRAINT "PK_a7bcd0f4be0f6b2457e102cb806" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."venues_status_enum" AS ENUM('PENDING', 'ACTIVE', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "venues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" character varying NOT NULL, "lat" double precision NOT NULL, "lng" double precision NOT NULL, "status" "public"."venues_status_enum" NOT NULL DEFAULT 'PENDING', "rejectReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cb0f885278d12384eb7a81818be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "webhook_events" ("eventId" character varying NOT NULL, CONSTRAINT "PK_f474c452069d5fc87cc1cfb35e7" PRIMARY KEY ("eventId"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bookings_status_enum" AS ENUM('RESERVED', 'PAID', 'PICKED_UP', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "boxId" uuid NOT NULL, "quantity" integer NOT NULL, "amount" integer NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'RESERVED', "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "pickupCode" character varying(6), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'REFUND_REQUIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "bookingId" uuid NOT NULL, "amount" integer NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "idempotency_keys" ("key" uuid NOT NULL, "userId" uuid NOT NULL, "requestHash" character varying NOT NULL, "responseStatus" integer NOT NULL, "responseBody" jsonb NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0afd83cbf08c9d12089a9bffc5e" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "boxes" ADD CONSTRAINT "FK_86225708476315838bb2f4bd051" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venue_members" ADD CONSTRAINT "FK_ccdd003af20488147742c65fefe" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "venue_members" ADD CONSTRAINT "FK_382970f3fef9becc2ca152476c5" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_38a69a58a323647f2e75eb994de" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_8dedbe3013948e4f7e8d313ead7" FOREIGN KEY ("boxId") REFERENCES "boxes"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_1ead3dc5d71db0ea822706e389d" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_1ead3dc5d71db0ea822706e389d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_8dedbe3013948e4f7e8d313ead7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_38a69a58a323647f2e75eb994de"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venue_members" DROP CONSTRAINT "FK_382970f3fef9becc2ca152476c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "venue_members" DROP CONSTRAINT "FK_ccdd003af20488147742c65fefe"`,
    );
    await queryRunner.query(
      `ALTER TABLE "boxes" DROP CONSTRAINT "FK_86225708476315838bb2f4bd051"`,
    );
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP TABLE "venues"`);
    await queryRunner.query(`DROP TYPE "public"."venues_status_enum"`);
    await queryRunner.query(`DROP TABLE "venue_members"`);
    await queryRunner.query(`DROP TYPE "public"."venue_members_role_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "boxes"`);
    await queryRunner.query(`DROP TYPE "public"."boxes_status_enum"`);
  }
}
