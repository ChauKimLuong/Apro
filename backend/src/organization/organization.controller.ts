import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OrganizationManageGuard } from '../authorization/guards/organization-manage.guard';
import { OrganizationViewGuard } from '../authorization/guards/organization-view.guard';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { OrganizationService } from './organization.service';

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

  @Get('positions')
  @UseGuards(OrganizationViewGuard)
  listPositions() {
    return this.organization.listPositions();
  }
}
