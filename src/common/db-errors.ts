import { QueryFailedError } from 'typeorm';

/**
 * true, если запрос упал на нарушении UNIQUE / PRIMARY KEY (код Postgres 23505).
 * Проверка «есть ли уже такая запись» перед вставкой не спасает от гонки
 * двух одновременных запросов — надёжный арбитр только уникальный индекс в БД.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string }).code === '23505'
  );
}
