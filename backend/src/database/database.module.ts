import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DatabaseHealthController } from './database-health.controller';

@Module({
  controllers: [DatabaseHealthController],
  providers: [DatabaseService],
})
export class DatabaseModule {}
