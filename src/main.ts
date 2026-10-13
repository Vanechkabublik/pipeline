import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './configure-app';

async function bootstrap() {
  // rawBody: true — Nest сохраняет сырое тело запроса в req.rawBody.
  // Оно нужно для проверки HMAC-подписи вебхука: подпись считается
  // от байтов тела, а не от распарсенного и заново сериализованного JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  configureApp(app);
  setupSwagger(app);
  // Корректно закрываем соединения с БД и cron-задачи при SIGTERM (docker stop)
  app.enableShutdownHooks();

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
