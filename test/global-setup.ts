import './setup-env';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from '../src/data-source';

/**
 * Выполняется один раз перед всеми e2e-тестами:
 *  1) создаёт тестовую БД, если её ещё нет;
 *  2) применяет к ней миграции — схема в тестах такая же, как в проде.
 */
export default async function globalSetup() {
  const database = process.env.DB_NAME as string;
  const connection = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };

  // CREATE DATABASE нельзя выполнить, подключившись к самой создаваемой БД,
  // поэтому идём в служебную БД postgres
  const admin = new Client({ ...connection, database: 'postgres' });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [database],
  );
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database}"`);
  }
  await admin.end();

  const dataSource = new DataSource({ ...dataSourceOptions, database });
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
