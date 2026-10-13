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

@Entity('boxes')
@Check('"quantity" >= 0') // страховка: остаток не уйдёт в минус
export class Box {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  venueId: string;

  @ManyToOne(() => Venue, (venue) => venue.boxes)
  @JoinColumn({ name: 'venueId' })
  venue: Venue;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  // Деньги — целые копейки
  @Column({ type: 'int' })
  originalPrice: number;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'timestamptz' })
  pickupStart: Date;

  @Column({ type: 'timestamptz' })
  pickupEnd: Date;

  @Column({ type: 'enum', enum: BoxStatus, default: BoxStatus.DRAFT })
  status: BoxStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
