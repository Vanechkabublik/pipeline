import { ClassSerializerInterceptor, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createValidationPipe } from './common/validation';

/**
 * Общая настройка приложения. Вызывается и в main.ts, и в e2e-тестах,
 * чтобы тесты проверяли ровно то же поведение, что и в проде
 * (cookie, валидация, формат ошибок, сериализация).
 */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  // Разбирает заголовок Cookie в req.cookies — оттуда JwtStrategy берёт токен
  app.use(cookieParser());

  // credentials: true разрешает браузеру отправлять cookie на другой origin.
  // С credentials origin обязан быть конкретным, "*" браузер не примет.
  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  // Учитывает @Exclude() в сущностях — например, passwordHash никогда не уйдёт в ответ
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
}

export function setupSwagger(app: INestApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ДоЗакрытия API')
      .setDescription(
        'Боксы с непроданной едой со скидкой. Авторизация — httpOnly cookie `access_token`: ' +
          'выполните POST /auth/login прямо в Swagger, браузер сохранит cookie и будет ' +
          'отправлять её во все следующие запросы.',
      )
      .setVersion('0.1.0')
      // Схема безопасности с именем 'access_token' — на неё ссылаются @ApiCookieAuth('access_token')
      .addCookieAuth(
        'access_token',
        {
          type: 'apiKey',
          description: 'JWT в httpOnly cookie, ставится POST /auth/login',
        },
        'access_token',
      )
      .build(),
  );
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { withCredentials: true },
  });
}
