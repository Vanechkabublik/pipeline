import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VenueMember } from '../venues/venue-member.entity';
import { Venue } from '../venues/venue.entity';
import { Box } from './box.entity';
import { BoxesController } from './boxes.controller';
import { BoxesService } from './boxes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Box, Venue, VenueMember])],
  controllers: [BoxesController],
  providers: [BoxesService],
})
export class BoxesModule {}
