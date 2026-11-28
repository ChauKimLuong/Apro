import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization/authorization.repository';
import { DatabaseService } from '../database/database.service';
import type { Prisma } from '../generated/prisma/client';
import type { CreateFormTemplateDto } from './dto/create-form-template.dto';
import type { ReviewFormTemplateDto } from './dto/review-form-template.dto';
import type { UpdateFormTemplateDraftDto } from './dto/update-form-template-draft.dto';

const targetUnitSelect = {
  id: true,
  name: true,
  type: true,
} satisfies Prisma.OrganizationalUnitSelect;

const draftSelect = {
  id: true,
  code: true,
  status: true,
  version: true,
  createdAt: true,
  targetOrganizationalUnitId: true,
  targetOrganizationalUnit: { select: targetUnitSelect },
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

const waitingForReview = {
  status: 'PENDING_REVIEW',
  reviewerAssignmentId: null,
} as const;

const revisionDetailSelect = {
  name: true,
  fields: { orderBy: { sortOrder: 'asc' }, select: formFieldSelect },
} satisfies Prisma.FormTemplateRevisionSelect;

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

  listTargetUnits(actorAssignmentId: string) {
    return this.database.$transaction(
      (tx) =>
        this.authorization.listAssignmentUnitAncestors(actorAssignmentId, tx),
      { isolationLevel: 'RepeatableRead' },
    );
  }

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
      where: { status: { in: ['DRAFT', 'RETURNED'] }, createdByAssignmentId },
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
      where: {
        id,
        status: { in: ['DRAFT', 'RETURNED'] },
        createdByAssignmentId,
      },
      select: {
        ...draftSelect,
        reviewComment: true,
        currentRevision: { select: revisionDetailSelect },
      },
    });
  }

  async submitDraft(
    id: string,
    expectedVersion: number,
    actorAssignmentId: string,
  ) {
    const owner = { id, createdByAssignmentId: actorAssignmentId };

    const submitted = await this.database.$transaction(async (tx) => {
      const submittedAt = new Date();
      const [template] = await tx.formTemplate.updateManyAndReturn({
        where: {
          ...owner,
          status: 'DRAFT',
          version: expectedVersion,
          currentRevision: { fields: { some: {} } },
        },
        data: {
          status: 'PENDING_REVIEW',
          submittedAt,
          reviewerAssignmentId: null,
          reviewedAt: null,
          reviewComment: null,
        },
        select: {
          ...draftSelect,
          reviewerAssignmentId: true,
          submittedAt: true,
        },
      });

      if (template) {
        await tx.auditLog.create({
          data: {
            formTemplateId: id,
            actorAssignmentId,
            eventType: 'FORM_TEMPLATE_SUBMITTED',
            occurredAt: submittedAt,
            details: {
              version: template.version,
              submittedAt: submittedAt.toISOString(),
              targetOrganizationalUnitId: template.targetOrganizationalUnitId,
            },
          },
        });
      }

      return template;
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

  private async reviewScopeWhere(
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
      targetOrganizationalUnitId: { in: unitIds },
      creator: {
        userId: { not: userId },
        organizationalUnitId: { in: unitIds },
      },
    };
  }

  listReviewQueue(userId: string, actorAssignmentId: string) {
    return this.database.$transaction(
      async (tx) => {
        const scope = await this.reviewScopeWhere(
          tx,
          userId,
          actorAssignmentId,
        );
        if (!scope) return null;

        return tx.formTemplate.findMany({
          where: { ...scope, ...waitingForReview },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            code: true,
            version: true,
            submittedAt: true,
            targetOrganizationalUnitId: true,
            targetOrganizationalUnit: { select: targetUnitSelect },
            currentRevision: { select: { name: true } },
          },
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  findReviewDraft(id: string, userId: string, actorAssignmentId: string) {
    return this.database.$transaction(
      async (tx) => {
        const scope = await this.reviewScopeWhere(
          tx,
          userId,
          actorAssignmentId,
        );
        if (!scope) return { kind: 'forbidden' } as const;

        const draft = await tx.formTemplate.findFirst({
          where: { ...scope, ...waitingForReview, id },
          select: {
            ...draftSelect,
            submittedAt: true,
            currentRevision: { select: revisionDetailSelect },
          },
        });

        return draft
          ? ({ kind: 'found', data: draft } as const)
          : ({ kind: 'not-found' } as const);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  reviewDraft(
    id: string,
    input: ReviewFormTemplateDto,
    userId: string,
    actorAssignmentId: string,
  ) {
    return this.database.$transaction(
      async (tx) => {
        const scope = await this.reviewScopeWhere(
          tx,
          userId,
          actorAssignmentId,
        );
        if (!scope) return { kind: 'forbidden' } as const;

        const current = await tx.formTemplate.findFirst({
          where: { ...scope, id },
          select: {
            status: true,
            version: true,
            submittedAt: true,
            reviewerAssignmentId: true,
          },
        });

        if (!current?.submittedAt) return { kind: 'not-found' } as const;
        const submittedAt = current.submittedAt.toISOString();
        if (
          current.status !== waitingForReview.status ||
          current.reviewerAssignmentId !== null ||
          current.version !== input.expectedVersion ||
          submittedAt !== input.expectedSubmittedAt
        ) {
          return { kind: 'changed' } as const;
        }

        const approved = input.decision === 'APPROVE';
        const reviewedAt = new Date();
        const [reviewed] = await tx.formTemplate.updateManyAndReturn({
          where: {
            ...scope,
            ...waitingForReview,
            id,
            version: current.version,
            submittedAt: current.submittedAt,
          },
          data: {
            status: approved ? 'ACTIVE' : 'RETURNED',
            reviewerAssignmentId: actorAssignmentId,
            reviewedAt,
            reviewComment: input.comment ?? null,
          },
          select: {
            ...draftSelect,
            reviewerAssignmentId: true,
            reviewedAt: true,
            reviewComment: true,
          },
        });

        if (!reviewed) return { kind: 'changed' } as const;

        await tx.auditLog.create({
          data: {
            formTemplateId: id,
            actorAssignmentId,
            eventType: approved
              ? 'FORM_TEMPLATE_APPROVED'
              : 'FORM_TEMPLATE_RETURNED',
            occurredAt: reviewedAt,
            details: {
              version: reviewed.version,
              submittedAt,
              targetOrganizationalUnitId: reviewed.targetOrganizationalUnitId,
              comment: reviewed.reviewComment,
            },
          },
        });

        return { kind: 'reviewed', data: reviewed } as const;
      },
      { isolationLevel: 'Serializable' },
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
    return this.database.$transaction(
      async (tx) => {
        const allowedUnits =
          await this.authorization.listAssignmentUnitAncestors(
            createdByAssignmentId,
            tx,
          );
        const targetId =
          draft.targetOrganizationalUnitId?.toLowerCase() ??
          allowedUnits[0]?.id;
        if (!targetId || !allowedUnits.some((unit) => unit.id === targetId))
          return null;

        const template = await tx.formTemplate.create({
          data: {
            code: draft.code,
            createdByAssignmentId,
            targetOrganizationalUnitId: targetId,
          },
          include: { targetOrganizationalUnit: { select: targetUnitSelect } },
        });

        const revision = await this.createRevision(tx, template, draft);
        return { ...template, ...revision };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  updateDraft(
    id: string,
    draft: UpdateFormTemplateDraftDto,
    createdByAssignmentId: string,
  ) {
    const scope = { id, createdByAssignmentId, status: 'DRAFT' } as const;
    const targetId = draft.targetOrganizationalUnitId?.toLowerCase();

    return this.database.$transaction(
      async (tx) => {
        if (targetId) {
          const current = await tx.formTemplate.findFirst({
            where: scope,
            select: { version: true },
          });
          if (!current) return { kind: 'not-found' } as const;
          if (current.version !== draft.expectedVersion) {
            return {
              kind: 'version-conflict',
              currentVersion: current.version,
            } as const;
          }

          const units = await this.authorization.listAssignmentUnitAncestors(
            createdByAssignmentId,
            tx,
          );
          if (!units.some((unit) => unit.id === targetId)) {
            return { kind: 'invalid-target' } as const;
          }
        }

        const [template] = await tx.formTemplate.updateManyAndReturn({
          where: { ...scope, version: draft.expectedVersion },
          data: {
            version: { increment: 1 },
            targetOrganizationalUnitId: targetId,
          },
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
      { isolationLevel: targetId ? 'Serializable' : 'ReadCommitted' },
    );
  }
}
