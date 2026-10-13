import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AdminVenuesController } from './admin-venues.controller';
import { VenueMember } from './venue-member.entity';
import { Venue } from './venue.entity';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, VenueMember]), UsersModule],
  controllers: [VenuesController, AdminVenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
