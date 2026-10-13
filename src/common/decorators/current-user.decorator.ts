import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../../users/user.entity';

/**
 * Достаёт текущего пользователя из запроса. Его туда кладёт JwtStrategy.validate()
 * после проверки токена, поэтому работает только вместе с JwtAuthGuard.
 * Пример: me(@CurrentUser() user: User)
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<Request>().user as User,
);
