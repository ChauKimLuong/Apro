import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-session';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { FormTemplatesService } from './form-templates.service';
import { FormCreateGuard } from './guards/form-create.guard';

@Controller('form-templates')
export class FormTemplatesController {
  constructor(private readonly forms: FormTemplatesService) {}

  @Get('presets')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  listPresets() {
    return this.forms.listPresets();
  }

  @Post()
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  createDraft(
    @Body() body: CreateFormTemplateDto,
    @Req() request: AuthenticatedRequest & { actorAssignmentId: string },
  ) {
    return this.forms.createDraft(body, request.actorAssignmentId);
  }
}
