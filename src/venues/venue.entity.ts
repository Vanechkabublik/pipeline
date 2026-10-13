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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ type: 'enum', enum: VenueStatus, default: VenueStatus.PENDING })
  status: VenueStatus;

  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => VenueMember, (member) => member.venue)
  members: VenueMember[];

  @OneToMany(() => Box, (box) => box.venue)
  boxes: Box[];
}
