import { config } from 'dotenv';

/**
 * Переменные окружения для e2e-тестов. Выполняется перед каждым файлом тестов
 * (setupFiles) и в global-setup.ts.
 *
 * Локально DB_HOST, пароли и секреты берутся из .env, в CI — из переменных job'а
 * (dotenv не перезаписывает уже заданные переменные).
 * Тесты всегда работают с отдельной БД DB_NAME_TEST, чтобы не трогать данные разработки.
 */
config({ quiet: true });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST ?? 'dozakrytiya_test';
