import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Booking } from '../bookings/booking.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  // Деньги пришли, но бронь уже нельзя оплатить (истекла/отменена) — нужен возврат
  REFUND_REQUIRED = 'REFUND_REQUIRED',
}

/** Попытка оплаты брони. У одной брони может быть несколько попыток (N:1). */
@Entity('payments')
export class Payment {
  @ApiProperty({ example: 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e1f' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column('uuid')
  bookingId: string;

  // RESTRICT: бронь с платежами удалить нельзя
  @ApiHideProperty()
  @ManyToOne(() => Booking, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @ApiProperty({ example: 25000, description: 'Копейки' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
