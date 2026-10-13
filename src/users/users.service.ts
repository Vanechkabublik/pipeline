import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ email: email.toLowerCase() });
  }

  /** Пользователь вместе с членствами в заведениях — для GET /auth/me */
  findByIdWithMemberships(id: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: { memberships: { venue: true } },
    });
  }

  create(data: Pick<User, 'email' | 'name' | 'passwordHash'>): Promise<User> {
    const user = this.usersRepository.create({
      ...data,
      email: data.email.toLowerCase(),
    });
    return this.usersRepository.save(user);
  }
}
