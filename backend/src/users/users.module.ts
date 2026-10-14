import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { EmployeeAssignmentsController } from './employee-assignments.controller';
import { EmployeesController } from './employees.controller';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AuthorizationModule, DatabaseModule, MailModule],
  controllers: [
    UsersController,
    EmployeesController,
    EmployeeAssignmentsController,
  ],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
