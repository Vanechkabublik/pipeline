import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Venue } from './venue.entity';

export enum VenueRole {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}

// Связка «пользователь ↔ заведение» с ролью. Один человек — одна роль в заведении.
@Entity('venue_members')
@Unique(['userId', 'venueId'])
export class VenueMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  venueId: string;

  @Column({ type: 'enum', enum: VenueRole })
  role: VenueRole;

  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Venue, (venue) => venue.members)
  @JoinColumn({ name: 'venueId' })
  venue: Venue;
}
