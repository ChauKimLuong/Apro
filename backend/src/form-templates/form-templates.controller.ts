import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-session';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { FormTemplatesService } from './form-templates.service';
import { FormCreateGuard } from './guards/form-create.guard';

type FormActorRequest = AuthenticatedRequest & {
  actorAssignmentId: string;
};

const draftIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_FORM_TEMPLATE_ID',
      message: 'Vui lòng chọn lại mẫu nháp từ danh sách.',
    }),
});

@Controller('form-templates')
export class FormTemplatesController {
  constructor(private readonly forms: FormTemplatesService) {}

  @Get('presets')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  listPresets() {
    return this.forms.listPresets();
  }

  @Get('drafts')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  listDrafts(@Req() request: FormActorRequest) {
    return this.forms.listDrafts(request.actorAssignmentId);
  }

  @Get('drafts/:id')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  getDraft(
    @Param('id', draftIdPipe) id: string,
    @Req() request: FormActorRequest,
  ) {
    return this.forms.getDraft(id, request.actorAssignmentId);
  }

  @Post()
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  createDraft(
    @Body() body: CreateFormTemplateDto,
    @Req() request: FormActorRequest,
  ) {
    return this.forms.createDraft(body, request.actorAssignmentId);
  }
}
