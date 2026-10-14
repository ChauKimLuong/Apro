import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OrganizationManageGuard } from '../authorization/guards/organization-manage.guard';
import { OrganizationViewGuard } from '../authorization/guards/organization-view.guard';
import { UserViewGuard } from '../authorization/guards/user-view.guard';
import { CreateOrganizationPositionDto } from './dto/create-organization-position.dto';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { UpdateOrganizationPositionDto } from './dto/update-organization-position.dto';
import { UpdateOrganizationPositionStatusDto } from './dto/update-organization-position-status.dto';
import { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';
import { UpdateOrganizationUnitStatusDto } from './dto/update-organization-unit-status.dto';
import { OrganizationService } from './organization.service';

const unitIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_ORGANIZATION_UNIT_ID',
      message: 'Vui lòng chọn lại đơn vị cần chỉnh sửa.',
    }),
});

const positionIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_ORGANIZATION_POSITION_ID',
      message: 'Vui lòng chọn lại chức danh cần chỉnh sửa.',
    }),
});

@Controller('organization')
@UseGuards(AuthSessionGuard)
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get('units')
  @UseGuards(OrganizationViewGuard)
  listUnits() {
    return this.organization.listUnits();
  }

  @Get('chart')
  @UseGuards(OrganizationViewGuard, UserViewGuard)
  getChart() {
    return this.organization.getChart();
  }

  @Post('units')
  @UseGuards(OrganizationManageGuard)
  createUnit(@Body() body: CreateOrganizationUnitDto) {
    return this.organization.createUnit(body);
  }

  @Patch('units/:id')
  @UseGuards(OrganizationManageGuard)
  updateUnit(
    @Param('id', unitIdPipe) id: string,
    @Body() body: UpdateOrganizationUnitDto,
  ) {
    return this.organization.updateUnit(id, body);
  }

  @Patch('units/:id/status')
  @UseGuards(OrganizationManageGuard)
  updateUnitStatus(
    @Param('id', unitIdPipe) id: string,
    @Body() body: UpdateOrganizationUnitStatusDto,
  ) {
    return this.organization.updateUnitStatus(id, body.status);
  }

  @Get('positions')
  @UseGuards(OrganizationViewGuard)
  listPositions() {
    return this.organization.listPositions();
  }

  @Post('positions')
  @UseGuards(OrganizationManageGuard)
  createPosition(@Body() body: CreateOrganizationPositionDto) {
    return this.organization.createPosition(body);
  }

  @Patch('positions/:id')
  @UseGuards(OrganizationManageGuard)
  updatePosition(
    @Param('id', positionIdPipe) id: string,
    @Body() body: UpdateOrganizationPositionDto,
  ) {
    return this.organization.updatePosition(id, body);
  }

  @Patch('positions/:id/status')
  @UseGuards(OrganizationManageGuard)
  updatePositionStatus(
    @Param('id', positionIdPipe) id: string,
    @Body() body: UpdateOrganizationPositionStatusDto,
  ) {
    return this.organization.updatePositionStatus(id, body.status);
  }
}
