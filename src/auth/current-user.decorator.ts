import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// @CurrentUser() — текущий пользователь (его кладёт в req.user JwtStrategy)
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest().user,
);
