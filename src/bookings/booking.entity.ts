import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Box } from '../boxes/box.entity';
import { User } from '../users/user.entity';

export enum BookingStatus {
  RESERVED = 'RESERVED',
  PAID = 'PAID',
  PICKED_UP = 'PICKED_UP',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  // RESTRICT — нельзя удалить пользователя или бокс, у которых есть брони
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('uuid')
  boxId: string;

  @ManyToOne(() => Box, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boxId' })
  box: Box;

  @Column({ type: 'int' })
  quantity: number;

  // Сумма запоминается в момент брони
  @Column({ type: 'int' })
  amount: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.RESERVED,
  })
  status: BookingStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'varchar', length: 6, nullable: true })
  pickupCode: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
