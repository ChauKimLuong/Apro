import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization/authorization.repository';
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

async function collectBranchIds(
  rootId: string,
  findChildren: (parentIds: string[]) => Promise<Array<{ id: string }>>,
) {
  const seen = new Set([rootId]);
  let level = [rootId];

  while (level.length > 0) {
    const children = await findChildren(level);
    level = [];

    for (const { id } of children) {
      if (seen.has(id)) continue;
      seen.add(id);
      level.push(id);
    }
  }

  return [...seen];
}

@Injectable()
export class FormTemplatesRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly authorization: AuthorizationRepository,
  ) {}

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

  async submitDraft(
    id: string,
    expectedVersion: number,
    actorAssignmentId: string,
  ) {
    const owner = { id, createdByAssignmentId: actorAssignmentId };

    const [submitted] = await this.database.formTemplate.updateManyAndReturn({
      where: {
        ...owner,
        status: 'DRAFT',
        version: expectedVersion,
        currentRevision: { fields: { some: {} } },
      },
      data: {
        status: 'PENDING_REVIEW',
        submittedAt: new Date(),
        reviewerAssignmentId: null,
        reviewedAt: null,
        reviewComment: null,
      },
      select: { ...draftSelect, reviewerAssignmentId: true, submittedAt: true },
    });

    if (submitted) return { kind: 'submitted', data: submitted } as const;

    const current = await this.database.formTemplate.findFirst({
      where: owner,
      select: {
        status: true,
        version: true,
        currentRevision: { select: { _count: { select: { fields: true } } } },
      },
    });

    if (!current) return { kind: 'not-found' } as const;
    if (current.status !== 'DRAFT') return { kind: 'changed' } as const;
    if (current.version !== expectedVersion) {
      return {
        kind: 'version-conflict',
        currentVersion: current.version,
      } as const;
    }
    if (current.currentRevision._count.fields === 0) {
      return { kind: 'empty' } as const;
    }

    return { kind: 'changed' } as const;
  }

  private async reviewQueueWhere(
    tx: Prisma.TransactionClient,
    userId: string,
    actorAssignmentId: string,
  ): Promise<Prisma.FormTemplateWhereInput | null> {
    const grants = await this.authorization.findFormReviewGrants(
      userId,
      actorAssignmentId,
      tx,
    );
    const [grant] = grants;
    if (!grant) return null;

    const where: Prisma.FormTemplateWhereInput = {
      status: 'PENDING_REVIEW',
      reviewerAssignmentId: null,
      creator: { userId: { not: userId } },
    };

    if (grants.some(({ scopeType }) => scopeType === 'GLOBAL')) return where;

    const [managedIds, unitIds] = await Promise.all([
      collectBranchIds(actorAssignmentId, (ids) =>
        tx.employeeAssignment.findMany({
          where: { managerAssignmentId: { in: ids } },
          select: { id: true },
        }),
      ),
      collectBranchIds(grant.employeeAssignment.organizationalUnitId, (ids) =>
        tx.organizationalUnit.findMany({
          where: { parentId: { in: ids } },
          select: { id: true },
        }),
      ),
    ]);

    return {
      ...where,
      createdByAssignmentId: { in: managedIds },
      creator: {
        userId: { not: userId },
        organizationalUnitId: { in: unitIds },
      },
    };
  }

  listReviewQueue(userId: string, actorAssignmentId: string) {
    return this.database.$transaction(
      async (tx) => {
        const where = await this.reviewQueueWhere(
          tx,
          userId,
          actorAssignmentId,
        );
        if (!where) return null;

        return tx.formTemplate.findMany({
          where,
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            code: true,
            version: true,
            submittedAt: true,
            currentRevision: { select: { name: true } },
          },
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
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
