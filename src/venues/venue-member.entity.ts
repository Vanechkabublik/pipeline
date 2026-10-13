import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
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

/**
 * Явная таблица-связка M:N между User и Venue с ролью участника.
 * UNIQUE(userId, venueId): один человек — одна роль в заведении.
 */
@Entity('venue_members')
@Unique(['userId', 'venueId'])
export class VenueMember {
  @ApiProperty({ example: '3d2c1b0a-9e8f-4a5b-8c7d-6e5f4a3b2c1d' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column('uuid')
  userId: string;

  @ApiProperty()
  @Column('uuid')
  venueId: string;

  @ApiProperty({ enum: VenueRole, example: VenueRole.STAFF })
  @Column({ type: 'enum', enum: VenueRole })
  role: VenueRole;

  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiHideProperty()
  @ManyToOne(() => Venue, (venue) => venue.members)
  @JoinColumn({ name: 'venueId' })
  venue: Venue;
}
