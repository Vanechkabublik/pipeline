import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ErrorCode } from '../common/error-codes';
import { ErrorResponseDto } from '../common/error-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Проверка, что API живо и база доступна' })
  @ApiOkResponse({ schema: { example: { status: 'ok', db: 'up' } } })
  @ApiResponse({
    status: 503,
    description: 'DB_UNAVAILABLE',
    type: ErrorResponseDto,
  })
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: ErrorCode.DB_UNAVAILABLE,
        message: 'База данных недоступна',
      });
    }
    return { status: 'ok', db: 'up' };
  }
}
