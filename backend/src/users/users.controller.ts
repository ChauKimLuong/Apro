import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { UserCreateGuard } from '../authorization/guards/user-create.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthSessionGuard, UserCreateGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('provisioning-options')
  getProvisioningOptions() {
    return this.users.getProvisioningOptions();
  }

  @Post()
  createEmployee(@Body() body: CreateEmployeeDto) {
    return this.users.createEmployee(body);
  }
}
