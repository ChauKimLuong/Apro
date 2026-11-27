import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { UserCreateGuard } from '../authorization/guards/user-create.guard';
import { UserUpdateGuard } from '../authorization/guards/user-update.guard';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { userIdPipe } from './pipes/resource-id.pipes';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthSessionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('provisioning-options')
  @UseGuards(UserCreateGuard)
  getProvisioningOptions() {
    return this.users.getProvisioningOptions();
  }

  @Patch(':userId/status')
  @UseGuards(UserUpdateGuard)
  updateEmployeeStatus(
    @Param('userId', userIdPipe) userId: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.users.updateEmployeeStatus(userId, body.status);
  }

  @Post()
  @UseGuards(UserCreateGuard)
  createEmployee(@Body() body: CreateEmployeeDto) {
    return this.users.createEmployee(body);
  }
}
