import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Box } from '../boxes/box.entity';
import { VenueMember } from './venue-member.entity';

export enum VenueStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
}

@Entity('venues')
export class Venue {
  @ApiProperty({ example: '0b6c1f0e-5a3d-4c2b-9e8f-7a6b5c4d3e2f' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'Пекарня «Утро»' })
  @Column()
  name: string;

  @ApiProperty({ example: 'Москва, ул. Тверская, 1' })
  @Column()
  address: string;

  // double precision (а не numeric): драйвер pg отдаёт его как number, а не строку
  @ApiProperty({ example: 55.7575 })
  @Column({ type: 'double precision' })
  lat: number;

  @ApiProperty({ example: 37.6156 })
  @Column({ type: 'double precision' })
  lng: number;

  @ApiProperty({ enum: VenueStatus, example: VenueStatus.PENDING })
  @Column({ type: 'enum', enum: VenueStatus, default: VenueStatus.PENDING })
  status: VenueStatus;

  // Тип указан явно: для `string | null` TypeScript не может сообщить TypeORM тип колонки
  @ApiProperty({ type: String, nullable: true, example: null })
  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ApiHideProperty()
  @OneToMany(() => VenueMember, (member) => member.venue)
  members: VenueMember[];

  @ApiHideProperty()
  @OneToMany(() => Box, (box) => box.venue)
  boxes: Box[];
}
