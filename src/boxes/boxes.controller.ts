import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { User } from '../users/user.entity';
import { CreateBoxDto, SearchBoxesDto } from './boxes.dto';
import { BoxesService } from './boxes.service';

@Controller('boxes')
export class BoxesController {
  constructor(private boxesService: BoxesService) {}

  // Публичный поиск — без авторизации
  @Get()
  search(@Query() query: SearchBoxesDto) {
    return this.boxesService.search(query);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@CurrentUser() user: User, @Body() dto: CreateBoxDto) {
    return this.boxesService.create(user.id, dto);
  }

  @Post(':id/publish')
  @UseGuards(AuthGuard('jwt'))
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.boxesService.publish(user.id, id);
  }
}
