import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Превращает дерево ошибок class-validator в плоский объект
 * { "поле": ["сообщение", ...], "вложенный.поле": [...] }.
 */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    if (error.constraints) {
      result[path] = Object.values(error.constraints);
    }
    if (error.children?.length) {
      Object.assign(result, flattenValidationErrors(error.children, path));
    }
  }
  return result;
}

/** Единый способ вернуть 400 VALIDATION_ERROR — и из ValidationPipe, и из сервисов */
export function validationException(details: Record<string, string[]>) {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message: 'Ошибка валидации',
    details,
  });
}

/**
 * Глобальный ValidationPipe:
 *  - whitelist: лишние поля в теле вырезаются;
 *  - forbidNonWhitelisted: ...а если они есть — это 400 (ловим опечатки клиента);
 *  - transform: тело превращается в экземпляр DTO, строки query — в числа и т. д.
 */
export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      validationException(flattenValidationErrors(errors)),
  });
}
