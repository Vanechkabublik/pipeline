import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../error-codes';

// Код по умолчанию, если в исключении не указан свой code
const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
};

/**
 * Глобальный фильтр: любую ошибку превращает в единый формат
 * { statusCode, code, message, details, path, timestamp }.
 *
 * В сервисах ошибки бросаются стандартными исключениями Nest с объектом:
 *   throw new ConflictException({ code: 'BOX_SOLD_OUT', message: '...' })
 * Фильтр достаёт из этого объекта code / message / details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_ERROR;
    let message = 'Внутренняя ошибка сервера';
    let details: unknown = null;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      code = DEFAULT_CODES[statusCode] ?? `HTTP_${statusCode}`;
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else {
        const payload = body as {
          code?: string;
          message?: string | string[];
          details?: unknown;
        };
        code = payload.code ?? code;
        message = Array.isArray(payload.message)
          ? payload.message.join('; ')
          : (payload.message ?? exception.message);
        details = payload.details ?? null;
      }
    } else {
      // Неожиданная ошибка (баг, упала БД и т. п.): клиенту — общий текст,
      // в лог — полный стек, чтобы можно было разобраться.
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      details,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
