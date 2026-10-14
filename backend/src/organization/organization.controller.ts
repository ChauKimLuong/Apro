import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { OrganizationViewGuard } from '../authorization/guards/organization-view.guard';
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

  @Get('positions')
  @UseGuards(OrganizationViewGuard)
  listPositions() {
    return this.organization.listPositions();
  }
}
