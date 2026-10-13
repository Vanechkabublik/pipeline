import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user.entity';
import { RejectVenueDto } from './dto/reject-venue.dto';
import { Venue } from './venue.entity';
import { VenuesService } from './venues.service';

/** Модерация заведений. Весь контроллер — только для ADMIN. */
@ApiTags('admin')
@ApiCookieAuth('access_token')
@ApiResponse({
  status: 401,
  description: 'UNAUTHORIZED',
  type: ErrorResponseDto,
})
@ApiResponse({
  status: 403,
  description: 'FORBIDDEN — не ADMIN',
  type: ErrorResponseDto,
})
@ApiResponse({
  status: 404,
  description: 'VENUE_NOT_FOUND',
  type: ErrorResponseDto,
})
// Порядок важен: сначала JwtAuthGuard кладёт пользователя в req.user,
// потом RolesGuard проверяет его роль
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/venues')
export class AdminVenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Одобрить заведение → ACTIVE' })
  @ApiOkResponse({ type: Venue })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.approve(id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Отклонить заведение с причиной → REJECTED' })
  @ApiOkResponse({ type: Venue })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectVenueDto) {
    return this.venuesService.reject(id, dto.reason);
  }
}
