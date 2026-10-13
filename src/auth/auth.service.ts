import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { LoginDto, RegisterDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    if (await this.users.existsBy({ email })) {
      throw new ConflictException('Email уже занят');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.users.save(
      this.users.create({ email, name: dto.name, passwordHash }),
    );
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOneBy({ email: dto.email.toLowerCase() });
    // Одна ошибка и для неверного email, и для неверного пароля
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    const token = await this.jwt.signAsync({ sub: user.id });
    return { user, token };
  }

  // Пользователь + его заведения с ролями
  me(userId: string) {
    return this.users.findOne({
      where: { id: userId },
      relations: { memberships: { venue: true } },
    });
  }
}
