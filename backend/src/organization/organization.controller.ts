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
import { CreateOrganizationPositionDto } from './dto/create-organization-position.dto';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
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

@Controller('organization')
@UseGuards(AuthSessionGuard)
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get('units')
  @UseGuards(OrganizationViewGuard)
  listUnits() {
    return this.organization.listUnits();
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
}
