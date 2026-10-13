import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { User } from '../../users/user.entity';
import { UsersService } from '../../users/users.service';
import { ACCESS_TOKEN_COOKIE, JwtPayload } from '../auth.constants';

/**
 * Стратегия 'jwt' для passport. Запускается JwtAuthGuard'ом:
 *  1) достаёт токен из cookie access_token (НЕ из заголовка Authorization —
 *     httpOnly cookie недоступна JavaScript'у страницы, её не украсть через XSS);
 *  2) проверяет подпись и срок действия;
 *  3) вызывает validate() — его результат становится req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) =>
          (req?.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Берём пользователя из БД, а не только из токена: так актуальна роль,
  // а токен удалённого пользователя перестаёт работать.
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
