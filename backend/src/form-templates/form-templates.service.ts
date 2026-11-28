import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isTransactionWriteConflict } from '../database/transaction-write-conflict';
import { Prisma } from '../generated/prisma/client';
import type { CreateFormTemplateDto } from './dto/create-form-template.dto';
import type { ReviewFormTemplateDto } from './dto/review-form-template.dto';
import type { UpdateFormTemplateDraftDto } from './dto/update-form-template-draft.dto';
import { FormTemplatesRepository } from './form-templates.repository';

function assertValidFields(fields: CreateFormTemplateDto['fields']) {
  const keys = new Set<string>();

  for (const field of fields) {
    if (keys.has(field.key)) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'DUPLICATE_FORM_FIELD_KEY',
        message: `Mã trường "${field.key}" đã xuất hiện trong mẫu.`,
      });
    }
    keys.add(field.key);

    const hasOptions = (field.options?.length ?? 0) > 0;
    if ((field.type === 'SELECT') !== hasOptions) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_FORM_FIELD_OPTIONS',
        message:
          field.type === 'SELECT'
            ? `Trường "${field.key}" cần ít nhất một lựa chọn.`
            : `Trường "${field.key}" chỉ có thể có lựa chọn khi dùng kiểu SELECT.`,
      });
    }
  }
}

function draftNotFound() {
  return new NotFoundException({
    statusCode: 404,
    code: 'FORM_TEMPLATE_DRAFT_NOT_FOUND',
    message: 'Không tìm thấy mẫu nháp trong phân công đang chọn.',
  });
}

function invalidTargetUnit() {
  return new BadRequestException({
    statusCode: 400,
    code: 'INVALID_FORM_TEMPLATE_TARGET_UNIT',
    message:
      'Vui lòng chọn đơn vị của phân công hiện tại hoặc một đơn vị cấp trên.',
  });
}

function targetUnitChanged() {
  return new ConflictException({
    statusCode: 409,
    code: 'FORM_TEMPLATE_TARGET_CHANGED',
    message:
      'Dữ liệu vừa thay đổi. Vui lòng tải lại đơn vị áp dụng và thử lại.',
  });
}

function reviewForbidden() {
  return new ForbiddenException({
    statusCode: 403,
    code: 'MISSING_PERMISSION',
    message: 'Phân công đang chọn không có quyền kiểm duyệt mẫu.',
  });
}

function reviewNotFound() {
  return new NotFoundException({
    statusCode: 404,
    code: 'FORM_TEMPLATE_REVIEW_NOT_FOUND',
    message: 'Không tìm thấy mẫu chờ kiểm duyệt trong phạm vi của em.',
  });
}

function reviewChanged() {
  return new ConflictException({
    statusCode: 409,
    code: 'FORM_TEMPLATE_REVIEW_CHANGED',
    message:
      'Mẫu đã được xử lý hoặc lượt gửi đã thay đổi. Vui lòng tải lại hàng chờ.',
  });
}

@Injectable()
export class FormTemplatesService {
  constructor(private readonly forms: FormTemplatesRepository) {}

  async listTargetUnits(actorAssignmentId: string) {
    return { data: await this.forms.listTargetUnits(actorAssignmentId) };
  }

  async listPresets() {
    const presets = await this.forms.listPresets();
    const palette = presets.find(({ kind }) => kind === 'PALETTE');

    const starterTemplates = presets
      .filter(({ kind }) => kind === 'STARTER')
      .map(({ code, name, description, fields }) => ({
        code,
        name,
        description,
        fields,
      }));

    return {
      data: {
        fieldPalette: palette?.fields ?? [],
        starterTemplates,
      },
    };
  }

  async listDrafts(actorAssignmentId: string) {
    const drafts = await this.forms.listDrafts(actorAssignmentId);

    return {
      data: drafts.map(({ currentRevision, ...draft }) => ({
        ...draft,
        name: currentRevision.name,
        fieldCount: currentRevision._count.fields,
      })),
    };
  }

  async getDraft(id: string, actorAssignmentId: string) {
    const draft = await this.forms.findDraft(id, actorAssignmentId);

    if (!draft) throw draftNotFound();

    const { currentRevision, ...template } = draft;

    return {
      data: {
        ...template,
        name: currentRevision.name,
        fieldCount: currentRevision.fields.length,
        fields: currentRevision.fields,
      },
    };
  }

  async submitDraft(
    id: string,
    expectedVersion: number,
    actorAssignmentId: string,
  ) {
    const result = await this.forms.submitDraft(
      id,
      expectedVersion,
      actorAssignmentId,
    );

    switch (result.kind) {
      case 'not-found':
        throw draftNotFound();
      case 'empty':
        throw new BadRequestException({
          statusCode: 400,
          code: 'FORM_TEMPLATE_EMPTY_DRAFT',
          message: 'Thêm ít nhất một trường trước khi gửi kiểm duyệt.',
        });
      case 'version-conflict':
        throw new ConflictException({
          statusCode: 409,
          code: 'FORM_TEMPLATE_DRAFT_VERSION_CONFLICT',
          message:
            'Mẫu nháp đã có phiên bản mới. Vui lòng mở lại mẫu trước khi gửi.',
          currentVersion: result.currentVersion,
        });
      case 'changed':
        throw new ConflictException({
          statusCode: 409,
          code: 'FORM_TEMPLATE_DRAFT_CHANGED',
          message: 'Mẫu đã được gửi hoặc không còn ở trạng thái nháp.',
        });
      case 'submitted':
        return {
          code: 'FORM_TEMPLATE_SUBMITTED',
          message: 'Đã gửi mẫu đi kiểm duyệt.',
          data: result.data,
        };
    }
  }

  async listReviewQueue(userId: string, actorAssignmentId: string) {
    const queue = await this.forms.listReviewQueue(userId, actorAssignmentId);
    if (!queue) throw reviewForbidden();

    return {
      data: queue.map(({ currentRevision, ...template }) => ({
        ...template,
        name: currentRevision.name,
      })),
    };
  }

  async getReviewDraft(id: string, userId: string, actorAssignmentId: string) {
    const result = await this.forms.findReviewDraft(
      id,
      userId,
      actorAssignmentId,
    );
    if (result.kind === 'forbidden') throw reviewForbidden();
    if (result.kind === 'not-found') throw reviewNotFound();

    const { currentRevision, ...template } = result.data;
    return { data: { ...template, ...currentRevision } };
  }

  async reviewDraft(
    id: string,
    input: ReviewFormTemplateDto,
    userId: string,
    actorAssignmentId: string,
  ) {
    const result = await this.forms
      .reviewDraft(id, input, userId, actorAssignmentId)
      .catch((error: unknown) => {
        if (isTransactionWriteConflict(error)) throw reviewChanged();
        throw error;
      });

    if (result.kind === 'forbidden') throw reviewForbidden();
    if (result.kind === 'not-found') throw reviewNotFound();
    if (result.kind === 'changed') throw reviewChanged();

    const approved = input.decision === 'APPROVE';
    return {
      code: approved ? 'FORM_TEMPLATE_APPROVED' : 'FORM_TEMPLATE_RETURNED',
      message: approved
        ? 'Đã duyệt mẫu biểu.'
        : 'Đã trả lại mẫu biểu kèm góp ý.',
      data: result.data,
    };
  }

  async updateDraft(
    id: string,
    draft: UpdateFormTemplateDraftDto,
    actorAssignmentId: string,
  ) {
    assertValidFields(draft.fields);

    const result = await this.forms
      .updateDraft(id, draft, actorAssignmentId)
      .catch((error: unknown) => {
        if (isTransactionWriteConflict(error)) throw targetUnitChanged();
        throw error;
      });

    if (result.kind === 'not-found') {
      throw draftNotFound();
    }

    if (result.kind === 'invalid-target') throw invalidTargetUnit();
    if (result.kind === 'version-conflict') {
      throw new ConflictException({
        statusCode: 409,
        code: 'FORM_TEMPLATE_DRAFT_VERSION_CONFLICT',
        message:
          'Mẫu nháp đã có phiên bản mới. Vui lòng mở lại mẫu trước khi lưu.',
        currentVersion: result.currentVersion,
      });
    }

    return {
      code: 'FORM_TEMPLATE_DRAFT_UPDATED',
      message: 'Đã lưu phiên bản mới của mẫu nháp.',
      data: {
        ...result.data,
        fieldCount: result.data.fields.length,
      },
    };
  }

  async createDraft(draft: CreateFormTemplateDto, actorAssignmentId: string) {
    assertValidFields(draft.fields);

    try {
      const data = await this.forms.createDraft(draft, actorAssignmentId);
      if (!data) throw invalidTargetUnit();
      return {
        code: 'FORM_TEMPLATE_CREATED',
        message: 'Đã lưu mẫu nháp.',
        data,
      };
    } catch (error) {
      if (isTransactionWriteConflict(error)) throw targetUnitChanged();
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          statusCode: 409,
          code: 'FORM_TEMPLATE_CODE_TAKEN',
          message: 'Mã mẫu đã được sử dụng.',
        });
      }
      throw error;
    }
  }
}
