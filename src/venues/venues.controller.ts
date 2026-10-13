import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import { AddStaffDto } from './dto/add-staff.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { VenueDetailsDto } from './dto/venue-details.dto';
import { VenueMember } from './venue-member.entity';
import { Venue } from './venue.entity';
import { VenuesService } from './venues.service';

@ApiTags('venues')
@ApiCookieAuth('access_token')
@ApiResponse({
  status: 401,
  description: 'UNAUTHORIZED',
  type: ErrorResponseDto,
})
@UseGuards(JwtAuthGuard)
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать заведение (статус PENDING, создатель — OWNER)',
  })
  @ApiCreatedResponse({ type: Venue })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  create(@CurrentUser() user: User, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Заведение вместе с боксами и участниками' })
  @ApiOkResponse({ type: VenueDetailsDto })
  @ApiResponse({
    status: 404,
    description: 'VENUE_NOT_FOUND',
    type: ErrorResponseDto,
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.findOneWithDetails(id);
  }

  @Post(':id/staff')
  @ApiOperation({
    summary: 'Добавить сотрудника (STAFF) по email. Только OWNER',
  })
  @ApiCreatedResponse({ type: VenueMember })
  @ApiResponse({
    status: 403,
    description: 'NOT_VENUE_OWNER',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'VENUE_NOT_FOUND, USER_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'ALREADY_MEMBER',
    type: ErrorResponseDto,
  })
  addStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: AddStaffDto,
  ) {
    return this.venuesService.addStaff(id, user.id, dto.email);
  }
}
