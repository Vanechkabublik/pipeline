import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Venue } from '../venues/venue.entity';

export enum BoxStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  SOLD_OUT = 'SOLD_OUT',
  CLOSED = 'CLOSED',
}

// Страховка на уровне БД: остаток не может уйти в минус, даже если в коде ошибка
@Check('"quantity" >= 0')
@Entity('boxes')
export class Box {
  @ApiProperty({ example: '9a8b7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column('uuid')
  venueId: string;

  @ApiHideProperty()
  @ManyToOne(() => Venue, (venue) => venue.boxes)
  @JoinColumn({ name: 'venueId' })
  venue: Venue;

  @ApiProperty({ example: 'Бокс выпечки' })
  @Column()
  title: string;

  @ApiProperty({ example: 'Круассаны и булочки, испечённые сегодня' })
  @Column({ type: 'text' })
  description: string;

  // Деньги — только целые копейки: никаких ошибок округления float
  @ApiProperty({ example: 60000, description: 'Цена без скидки, копейки' })
  @Column({ type: 'int' })
  originalPrice: number;

  @ApiProperty({ example: 25000, description: 'Цена со скидкой, копейки' })
  @Column({ type: 'int' })
  price: number;

  @ApiProperty({ example: 5, description: 'Текущий остаток' })
  @Column({ type: 'int' })
  quantity: number;

  @ApiProperty({ example: '2026-01-01T18:00:00.000Z' })
  @Column({ type: 'timestamptz' })
  pickupStart: Date;

  @ApiProperty({ example: '2026-01-01T20:00:00.000Z' })
  @Column({ type: 'timestamptz' })
  pickupEnd: Date;

  @ApiProperty({ enum: BoxStatus, example: BoxStatus.PUBLISHED })
  @Column({ type: 'enum', enum: BoxStatus, default: BoxStatus.DRAFT })
  status: BoxStatus;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
