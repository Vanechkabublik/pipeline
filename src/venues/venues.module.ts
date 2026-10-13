import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { VenueMember } from './venue-member.entity';
import { Venue } from './venue.entity';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, VenueMember, User])],
  controllers: [VenuesController],
  providers: [VenuesService],
})
export class VenuesModule {}
