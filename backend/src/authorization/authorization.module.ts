import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationRepository } from './authorization.repository';
import { UserCreateGuard } from './guards/user-create.guard';

@Module({
  imports: [DatabaseModule],
  providers: [AuthorizationRepository, UserCreateGuard],
  exports: [AuthorizationRepository, UserCreateGuard],
})
export class AuthorizationModule {}
