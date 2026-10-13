import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Подключение для TypeORM CLI (миграции) и seed-скрипта.
 * Само приложение настраивает БД в AppModule через ConfigService,
 * а CLI запускается вне Nest, поэтому читает .env сам.
 * В Docker файла .env внутри образа нет — переменные приходят из окружения контейнера.
 */
config({ quiet: true });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Пути работают и для src/*.ts (ts-node), и для собранного dist/*.js
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
