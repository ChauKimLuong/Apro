import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('db')
  async check() {
    try {
      await this.database.checkConnection();
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
