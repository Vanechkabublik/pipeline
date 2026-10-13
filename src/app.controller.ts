import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(private dataSource: DataSource) {}

  // Проверка, что API живо и база отвечает (если база упала — будет 500)
  @Get('health')
  async health() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }
}
