import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { FormTemplatesRepository } from './form-templates.repository';

@Injectable()
export class FormTemplatesService {
  constructor(private readonly forms: FormTemplatesRepository) {}

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

    if (!draft) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'FORM_TEMPLATE_DRAFT_NOT_FOUND',
        message: 'Không tìm thấy mẫu nháp trong phân công đang chọn.',
      });
    }

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

  async createDraft(draft: CreateFormTemplateDto, actorAssignmentId: string) {
    const keys = new Set<string>();

    for (const field of draft.fields) {
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

    try {
      const data = await this.forms.createDraft(draft, actorAssignmentId);
      return {
        code: 'FORM_TEMPLATE_CREATED',
        message: 'Đã lưu mẫu nháp.',
        data,
      };
    } catch (error) {
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
