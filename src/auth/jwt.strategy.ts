import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

// Срабатывает на @UseGuards(AuthGuard('jwt')): проверяет токен и кладёт пользователя в req.user
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectRepository(User) private users: Repository<User>) {
    super({
      // Токен берём из cookie access_token, а не из заголовка Authorization
      jwtFromRequest: (req: Request) => req.cookies?.access_token ?? null,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
