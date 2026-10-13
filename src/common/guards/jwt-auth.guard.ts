import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Пускает только запросы с валидным JWT в cookie access_token.
 * Вся логика — в JwtStrategy (auth/strategies/jwt.strategy.ts),
 * guard лишь запускает стратегию 'jwt'. Нет токена или он невалиден → 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
