import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column('uuid')
  userId: string;

  // RESTRICT: пользователя с бронями удалить нельзя — финансовая история не теряется
  @ApiHideProperty()
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty()
  @Column('uuid')
  boxId: string;

  @ApiHideProperty()
  @ManyToOne(() => Box, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boxId' })
  box: Box;

  @ApiProperty({ example: 1, minimum: 1, maximum: 3 })
  @Column({ type: 'int' })
  quantity: number;

  // Сумма фиксируется в момент брони: если заведение потом поменяет цену,
  // клиент всё равно платит ту, что видел
  @ApiProperty({ example: 25000, description: 'Сумма к оплате, копейки' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.RESERVED })
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.RESERVED,
  })
  status: BookingStatus;

  @ApiProperty({ description: 'До какого момента бронь ждёт оплаты' })
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '482913',
    description: 'Код выдачи, появляется после оплаты',
  })
  @Column({ type: 'varchar', length: 6, nullable: true })
  pickupCode: string | null;

  @ApiProperty()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
