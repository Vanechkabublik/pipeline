import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { Box } from './box.entity';
import { BoxesService } from './boxes.service';
import { CreateBoxDto } from './dto/create-box.dto';
import { SearchBoxesResponseDto } from './dto/search-boxes-response.dto';
import { SearchBoxesQueryDto } from './dto/search-boxes.query.dto';

@ApiTags('boxes')
@Controller('boxes')
export class BoxesController {
  constructor(private readonly boxesService: BoxesService) {}

  @Get()
  @ApiOperation({
    summary: 'Публичный поиск боксов рядом с точкой',
    description:
      'Только PUBLISHED, с остатком, выдача ещё не закончилась, заведение ACTIVE. ' +
      'Сортировка по расстоянию. Авторизация не нужна.',
  })
  @ApiOkResponse({ type: SearchBoxesResponseDto })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  search(@Query() query: SearchBoxesQueryDto) {
    return this.boxesService.search(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Создать бокс (DRAFT). Только OWNER активного заведения',
  })
  @ApiCreatedResponse({ type: Box })
  @ApiResponse({
    status: 400,
    description:
      'VALIDATION_ERROR — в т. ч. цена > 50% или неверное окно выдачи',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'NOT_VENUE_OWNER, VENUE_NOT_ACTIVE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'VENUE_NOT_FOUND',
    type: ErrorResponseDto,
  })
  create(@CurrentUser() user: User, @Body() dto: CreateBoxDto) {
    return this.boxesService.create(user.id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({
    summary: 'Опубликовать бокс: DRAFT → PUBLISHED. Только OWNER',
  })
  @ApiOkResponse({ type: Box })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'NOT_VENUE_OWNER',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'BOX_NOT_FOUND',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'BOX_NOT_DRAFT',
    type: ErrorResponseDto,
  })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.boxesService.publish(user.id, id);
  }
}
