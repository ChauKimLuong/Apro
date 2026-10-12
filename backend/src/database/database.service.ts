import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      host: config.getOrThrow<string>('DB_HOST'),
      port: Number(config.getOrThrow<string>('DB_PORT')),
      user: config.getOrThrow<string>('POSTGRES_USER'),
      database: config.getOrThrow<string>('POSTGRES_DB'),
      password: config.getOrThrow<string>('POSTGRES_PASSWORD'),
      connectionTimeoutMillis: 3000,
    });

    this.pool.on('error', (error) => {
      this.logger.error(error.message);
    });
  }

  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
