import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateFormTemplateDto } from './dto/create-form-template.dto';
import type { UpdateFormTemplateDraftDto } from './dto/update-form-template-draft.dto';

const draftSelect = {
  id: true,
  code: true,
  status: true,
  version: true,
  createdAt: true,
} satisfies Prisma.FormTemplateSelect;

const formFieldSelect = {
  id: true,
  key: true,
  label: true,
  type: true,
  isRequired: true,
  sortOrder: true,
  options: true,
} satisfies Prisma.FormFieldSelect;

@Injectable()
export class FormTemplatesRepository {
  constructor(private readonly database: DatabaseService) {}

  listPresets() {
    return this.database.formPreset.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        code: true,
        kind: true,
        name: true,
        description: true,
        fields: {
          orderBy: { sortOrder: 'asc' },
          select: {
            key: true,
            label: true,
            type: true,
            isRequired: true,
            options: true,
          },
        },
      },
    });
  }

  listDrafts(createdByAssignmentId: string) {
    return this.database.formTemplate.findMany({
      where: { status: 'DRAFT', createdByAssignmentId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        ...draftSelect,
        currentRevision: {
          select: {
            name: true,
            _count: { select: { fields: true } },
          },
        },
      },
    });
  }

  findDraft(id: string, createdByAssignmentId: string) {
    return this.database.formTemplate.findFirst({
      where: { id, status: 'DRAFT', createdByAssignmentId },
      select: {
        ...draftSelect,
        currentRevision: {
          select: {
            name: true,
            fields: {
              orderBy: { sortOrder: 'asc' },
              select: formFieldSelect,
            },
          },
        },
      },
    });
  }

  private createRevision(
    tx: Prisma.TransactionClient,
    template: { id: string; version: number },
    draft: Pick<CreateFormTemplateDto, 'name' | 'fields'>,
  ) {
    return tx.formTemplateRevision.create({
      data: {
        formTemplateId: template.id,
        version: template.version,
        name: draft.name,
        fields: {
          create: draft.fields.map((field, index) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            isRequired: field.isRequired ?? false,
            sortOrder: index + 1,
            options: field.options ?? [],
          })),
        },
      },
      select: {
        name: true,
        fields: {
          orderBy: { sortOrder: 'asc' },
          select: formFieldSelect,
        },
      },
    });
  }

  createDraft(draft: CreateFormTemplateDto, createdByAssignmentId: string) {
    return this.database.$transaction(async (tx) => {
      const template = await tx.formTemplate.create({
        data: {
          code: draft.code,
          createdByAssignmentId,
        },
      });

      const revision = await this.createRevision(tx, template, draft);
      return { ...template, ...revision };
    });
  }

  updateDraft(
    id: string,
    draft: UpdateFormTemplateDraftDto,
    createdByAssignmentId: string,
  ) {
    const scope = { id, createdByAssignmentId, status: 'DRAFT' } as const;

    return this.database.$transaction(
      async (tx) => {
        const [template] = await tx.formTemplate.updateManyAndReturn({
          where: { ...scope, version: draft.expectedVersion },
          data: { version: { increment: 1 } },
          select: draftSelect,
        });

        if (!template) {
          const current = await tx.formTemplate.findFirst({
            where: scope,
            select: { version: true },
          });

          return current
            ? ({
                kind: 'version-conflict',
                currentVersion: current.version,
              } as const)
            : ({ kind: 'not-found' } as const);
        }

        const revision = await this.createRevision(tx, template, draft);

        return {
          kind: 'updated',
          data: { ...template, ...revision },
        } as const;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
