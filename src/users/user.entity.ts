import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VenueMember } from '../venues/venue-member.entity';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

@Entity('users')
export class User {
  @ApiProperty({ example: '6f1c2a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'client@test.dev' })
  @Column({ unique: true })
  email: string;

  // @Exclude: ClassSerializerInterceptor вырежет поле из любого ответа API
  @ApiHideProperty()
  @Exclude()
  @Column()
  passwordHash: string;

  @ApiProperty({ example: 'Иван' })
  @Column()
  name: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ApiHideProperty()
  @OneToMany(() => VenueMember, (member) => member.user)
  memberships: VenueMember[];
}
