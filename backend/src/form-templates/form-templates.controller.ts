import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-session';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { readActorAssignmentId } from '../authorization/assignment-context';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { ReviewFormTemplateDto } from './dto/review-form-template.dto';
import { SubmitFormTemplateDraftDto } from './dto/submit-form-template-draft.dto';
import { UpdateFormTemplateDraftDto } from './dto/update-form-template-draft.dto';
import { FormTemplatesService } from './form-templates.service';
import {
  FormCreateGuard,
  FormUpdateGuard,
} from './guards/form-assignment-permission.guard';

type FormActorRequest = AuthenticatedRequest & {
  actorAssignmentId: string;
};

const draftIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_FORM_TEMPLATE_ID',
      message: 'Vui lòng chọn lại mẫu biểu từ danh sách.',
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

  @Get('target-units')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  listTargetUnits(@Req() request: FormActorRequest) {
    return this.forms.listTargetUnits(request.actorAssignmentId);
  }

  @Get('drafts')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  listDrafts(@Req() request: FormActorRequest) {
    return this.forms.listDrafts(request.actorAssignmentId);
  }

  @Get('review-queue')
  @UseGuards(AuthSessionGuard)
  listReviewQueue(@Req() request: AuthenticatedRequest) {
    return this.forms.listReviewQueue(
      request.authUser.id,
      readActorAssignmentId(request),
    );
  }

  @Get('review-queue/:id')
  @UseGuards(AuthSessionGuard)
  getReviewDraft(
    @Param('id', draftIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.forms.getReviewDraft(
      id,
      request.authUser.id,
      readActorAssignmentId(request),
    );
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthSessionGuard)
  reviewDraft(
    @Param('id', draftIdPipe) id: string,
    @Body() body: ReviewFormTemplateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.forms.reviewDraft(
      id,
      body,
      request.authUser.id,
      readActorAssignmentId(request),
    );
  }

  @Get('drafts/:id')
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  getDraft(
    @Param('id', draftIdPipe) id: string,
    @Req() request: FormActorRequest,
  ) {
    return this.forms.getDraft(id, request.actorAssignmentId);
  }

  @Put('drafts/:id')
  @UseGuards(AuthSessionGuard, FormUpdateGuard)
  updateDraft(
    @Param('id', draftIdPipe) id: string,
    @Body() body: UpdateFormTemplateDraftDto,
    @Req() request: FormActorRequest,
  ) {
    return this.forms.updateDraft(id, body, request.actorAssignmentId);
  }

  @Post('drafts/:id/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthSessionGuard, FormCreateGuard)
  submitDraft(
    @Param('id', draftIdPipe) id: string,
    @Body() body: SubmitFormTemplateDraftDto,
    @Req() request: FormActorRequest,
  ) {
    return this.forms.submitDraft(
      id,
      body.expectedVersion,
      request.actorAssignmentId,
    );
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
