import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { User, UserRole } from '../../users/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ErrorCode } from '../error-codes';

/**
 * Проверяет глобальную роль пользователя (USER / ADMIN) по @Roles().
 * Ставится ПОСЛЕ JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard),
 * потому что читает req.user, который заполняет JwtAuthGuard.
 *
 * Роли внутри заведения (OWNER / STAFF) проверяются в сервисах:
 * для этого нужен id заведения из URL или из бокса, а это бизнес-логика.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Метаданные метода важнее метаданных класса
    const requiredRoles = this.reflector.getAllAndOverride<
      UserRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<Request>().user as
      User | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Недостаточно прав',
      });
    }
    return true;
  }
}
