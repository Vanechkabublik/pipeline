import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { User, UserRole } from '../users/user.entity';
import { VenueStatus } from './venue.entity';
import { AddStaffDto, CreateVenueDto, RejectVenueDto } from './venues.dto';
import { VenuesService } from './venues.service';

@Controller()
@UseGuards(AuthGuard('jwt')) // все маршруты — только для залогиненных
export class VenuesController {
  constructor(private venuesService: VenuesService) {}

  @Post('venues')
  create(@CurrentUser() user: User, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(user.id, dto);
  }

  @Get('venues/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.findOne(id);
  }

  @Post('venues/:id/staff')
  addStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddStaffDto,
  ) {
    return this.venuesService.addStaff(id, user.id, dto.email);
  }

  @Patch('admin/venues/:id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    onlyAdmin(user);
    return this.venuesService.setStatus(id, VenueStatus.ACTIVE);
  }

  @Patch('admin/venues/:id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectVenueDto,
  ) {
    onlyAdmin(user);
    return this.venuesService.setStatus(id, VenueStatus.REJECTED, dto.reason);
  }
}

function onlyAdmin(user: User) {
  if (user.role !== UserRole.ADMIN)
    throw new ForbiddenException('Только для админа');
}
