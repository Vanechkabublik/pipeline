import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../common/error-codes';
import { verifySignature } from './webhook-signature';

/**
 * Пускает к обработчику вебхука только запросы с верной подписью X-Signature.
 *
 * Почему guard, а не проверка в сервисе: guards выполняются ДО pipes,
 * то есть подделанный запрос отсекается раньше, чем мы начнём валидировать
 * и разбирать его тело.
 *
 * Подпись считается от req.rawBody — байтов тела ровно в том виде, в каком
 * их прислал провайдер (включено через NestFactory.create(..., { rawBody: true })).
 * Если пересериализовать уже распарсенный JSON, порядок ключей или пробелы
 * могут отличаться, и подпись не сойдётся.
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    const signature = request.header('x-signature');
    const secret = this.config.getOrThrow<string>('WEBHOOK_SECRET');

    if (
      !request.rawBody ||
      !verifySignature(request.rawBody, signature, secret)
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_SIGNATURE,
        message: 'Неверная подпись вебхука',
      });
    }
    return true;
  }
}
