import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { CookieOptions } from 'express';
import { isUniqueViolation } from '../common/db-errors';
import { ErrorCode } from '../common/error-codes';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  BCRYPT_ROUNDS,
  JwtPayload,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// Хэш случайной строки. Сравниваем пароль с ним, когда email не найден,
// чтобы ответ «нет такого email» не был заметно быстрее, чем «неверный пароль».
const DUMMY_PASSWORD_HASH =
  '$2b$10$Sc8lK1eckJcJowQo65eo2ekWxjv5H7c4A0jElfGdBXfk8D2fTg0Xm';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<User> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      return await this.usersService.create({
        email: dto.email,
        name: dto.name,
        passwordHash,
      });
    } catch (error) {
      // Уникальный индекс по email — единственная надёжная проверка
      // (два одновременных запроса с одним email проверку «заранее» пройдут оба)
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: ErrorCode.EMAIL_TAKEN,
          message: 'Пользователь с таким email уже зарегистрирован',
        });
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ user: User; accessToken: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordOk = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    // Одна и та же ошибка для «нет такого email» и «неверный пароль»:
    // не подсказываем злоумышленнику, какие email зарегистрированы.
    if (!user || !passwordOk) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Неверный email или пароль',
      });
    }

    const payload: JwtPayload = { sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload);
    return { user, accessToken };
  }

  me(userId: string): Promise<User | null> {
    return this.usersService.findByIdWithMemberships(userId);
  }

  /**
   * Параметры cookie с токеном:
   *  - httpOnly: JavaScript страницы не может прочитать cookie (защита от XSS);
   *  - secure: в production cookie уходит только по HTTPS;
   *  - sameSite 'lax': браузер не шлёт cookie в POST-запросах с чужих сайтов (защита от CSRF).
   */
  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    };
  }
}
