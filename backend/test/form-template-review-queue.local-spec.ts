import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { DatabaseService } from '../src/database/database.service';

const header = 'X-Employee-Assignment-Id';
const templatesPath = '/form-templates';
const queuePath = `${templatesPath}/review-queue`;
const draftPath = (id: string) => `${templatesPath}/drafts/${id}`;
const fields = [{ key: 'purpose', label: 'Mục đích', type: 'TEXT' }];

const assignments = {
  an: '20000000-0000-4000-8000-000000000101',
  quang: '20000000-0000-4000-8000-000000000103',
  dung: '20000000-0000-4000-8000-000000000104',
  ha: '20000000-0000-4000-8000-000000000105',
  chi: '20000000-0000-4000-8000-000000000106',
  member: '20000000-0000-4000-8000-000000000002',
};

type Agent = ReturnType<typeof request.agent>;
type Draft = { id: string; version: number };

// Run on a separate local DB after migrate deploy and seed-provisioning.cjs.
// npm run test:e2e -- --runInBand --testRegex=form-template-review-queue.local-spec.ts
describe('Form template review queue (local e2e)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  const agents = {} as Record<keyof typeof assignments, Agent>;
  const draftIds: string[] = [];
  let fixture: { roleIds: string[]; secondaryId: string } | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const config = module.get(ConfigService);
    const host = new URL(config.getOrThrow<string>('DATABASE_URL')).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
      await module.close();
      throw new Error('Use a separate local database for this test.');
    }

    database = module.get(DatabaseService);
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');

    const password = config.getOrThrow<string>('SEED_PROVISIONING_PASSWORD');
    for (const account of Object.keys(assignments) as Array<
      keyof typeof assignments
    >) {
      const agent = request.agent(app.getHttpServer());
      await agent
        .post('/auth/login')
        .send({ email: `${account}@example.test`, password })
        .expect(200);
      agents[account] = agent;
    }

    fixture = await database.$transaction(async (tx) => {
      const author = await tx.systemRole.create({
        data: {
          code: 'REQUESTER',
          name: 'Review queue test author',
          rolePermissions: {
            create: [
              { permission: { connect: { code: 'FORM_CREATE' } } },
              { permission: { connect: { code: 'FORM_UPDATE' } } },
            ],
          },
        },
      });
      const reviewer = await tx.systemRole.create({
        data: {
          code: 'APPROVER',
          name: 'Review queue test reviewer',
          rolePermissions: {
            create: { permission: { connect: { code: 'FORM_REVIEW' } } },
          },
        },
      });
      const manager = await tx.employeeAssignment.findUniqueOrThrow({
        where: { id: assignments.dung },
        select: { userId: true, organizationalUnitId: true },
      });
      const oneDay = 24 * 60 * 60 * 1000;
      const validFrom = new Date(Date.now() - 2 * oneDay);
      const secondary = await tx.employeeAssignment.create({
        data: {
          ...manager,
          positionId: '40000000-0000-4000-8000-000000000105',
          managerAssignmentId: assignments.dung,
          startedAt: validFrom,
          type: 'CONCURRENT',
        },
      });

      await tx.roleAssignment.createMany({
        data: [
          ...[assignments.ha, assignments.member, secondary.id].map(
            (employeeAssignmentId) => ({
              employeeAssignmentId,
              systemRoleId: author.id,
              scopeType: 'ORGANIZATIONAL_UNIT' as const,
              validFrom,
            }),
          ),
          ...[assignments.dung, assignments.quang, assignments.chi].map(
            (employeeAssignmentId) => ({
              employeeAssignmentId,
              systemRoleId: reviewer.id,
              scopeType: 'ORGANIZATIONAL_UNIT' as const,
              validFrom,
            }),
          ),
          {
            employeeAssignmentId: assignments.member,
            systemRoleId: reviewer.id,
            scopeType: 'ORGANIZATIONAL_UNIT',
            validFrom,
            validUntil: new Date(Date.now() - oneDay),
          },
        ],
      });
      return { roleIds: [author.id, reviewer.id], secondaryId: secondary.id };
    });
  }, 15000);

  afterAll(async () => {
    if (!app) return;
    try {
      await database.$transaction(async (tx) => {
        const forms = { in: draftIds };
        await tx.formField.deleteMany({ where: { formTemplateId: forms } });
        await tx.formTemplateRevision.deleteMany({
          where: { formTemplateId: forms },
        });
        await tx.formTemplate.deleteMany({ where: { id: forms } });

        if (fixture) {
          const systemRoleId = { in: fixture.roleIds };
          await tx.roleAssignment.deleteMany({ where: { systemRoleId } });
          await tx.rolePermission.deleteMany({ where: { systemRoleId } });
          await tx.systemRole.deleteMany({ where: { id: systemRoleId } });
          await tx.employeeAssignment.delete({
            where: { id: fixture.secondaryId },
          });
        }
      });
      await Promise.all(
        Object.values(agents).map((agent) => agent.post('/auth/logout')),
      );
    } finally {
      await app.close();
    }
  });

  async function createDraft(
    agent: Agent,
    assignmentId: string,
    draftFields = fields,
  ) {
    const code = `QUEUE_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const response = await agent
      .post(templatesPath)
      .set(header, assignmentId)
      .send({ code, name: `Mẫu ${code}`, fields: draftFields })
      .expect(201);
    const { id, version } = (response.body as { data: Draft }).data;
    draftIds.push(id);
    return { id, version };
  }

  function submit(agent: Agent, assignmentId: string, draft: Draft) {
    return agent
      .post(`${draftPath(draft.id)}/submit`)
      .set(header, assignmentId)
      .send({ expectedVersion: draft.version });
  }

  async function queueIds(agent: Agent, assignmentId: string) {
    const response = await agent
      .get(queuePath)
      .set(header, assignmentId)
      .expect(200);
    return (response.body as { data: Draft[] }).data.map(({ id }) => id);
  }

  it('sends an unassigned draft, preserves its revision, and removes it from drafts', async () => {
    const draft = await createDraft(agents.ha, assignments.ha);
    const response = await submit(agents.ha, assignments.ha, draft).expect(200);
    expect(response.body).toMatchObject({
      code: 'FORM_TEMPLATE_SUBMITTED',
      data: {
        ...draft,
        status: 'PENDING_REVIEW',
        reviewerAssignmentId: null,
      },
    });
    const { submittedAt } = (response.body as { data: { submittedAt: string } })
      .data;
    expect(Number.isNaN(Date.parse(submittedAt))).toBe(false);
    await expect(
      database.formTemplateRevision.count({
        where: { formTemplateId: draft.id },
      }),
    ).resolves.toBe(1);
    await agents.ha
      .get(draftPath(draft.id))
      .set(header, assignments.ha)
      .expect(404);
  });

  it('rejects an empty draft and leaves it editable', async () => {
    const draft = await createDraft(agents.ha, assignments.ha, []);
    const response = await submit(agents.ha, assignments.ha, draft).expect(400);
    expect(response.body).toMatchObject({ code: 'FORM_TEMPLATE_EMPTY_DRAFT' });
    await agents.ha
      .get(draftPath(draft.id))
      .set(header, assignments.ha)
      .expect(200);
  });

  it('requires a session and hides another assignment’s draft', async () => {
    const draft = await createDraft(agents.ha, assignments.ha);
    await submit(
      request.agent(app.getHttpServer()),
      assignments.ha,
      draft,
    ).expect(401);
    const response = await submit(
      agents.member,
      assignments.member,
      draft,
    ).expect(404);
    expect(response.body).toMatchObject({
      code: 'FORM_TEMPLATE_DRAFT_NOT_FOUND',
    });
  });

  it('rejects a stale revision and reports the current version', async () => {
    const draft = await createDraft(agents.ha, assignments.ha);
    await agents.ha
      .put(draftPath(draft.id))
      .set(header, assignments.ha)
      .send({ expectedVersion: draft.version, name: 'Tên đã sửa', fields })
      .expect(200);
    const response = await submit(agents.ha, assignments.ha, draft).expect(409);
    expect(response.body).toMatchObject({
      code: 'FORM_TEMPLATE_DRAFT_VERSION_CONFLICT',
      currentVersion: 2,
    });
  });

  it('allows exactly one of two concurrent submissions', async () => {
    const draft = await createDraft(agents.ha, assignments.ha);
    const results = await Promise.all([
      submit(agents.ha, assignments.ha, draft),
      submit(agents.ha, assignments.ha, draft),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body).toMatchObject({
      code: 'FORM_TEMPLATE_DRAFT_CHANGED',
    });
  });

  it('filters by management chain and unit tree, while global reviewers see both branches', async () => {
    const inside = await createDraft(agents.ha, assignments.ha);
    const outside = await createDraft(agents.member, assignments.member);
    await submit(agents.ha, assignments.ha, inside).expect(200);
    await submit(agents.member, assignments.member, outside).expect(200);

    const dung = await queueIds(agents.dung, assignments.dung);
    expect(dung).toContain(inside.id);
    expect(dung).not.toContain(outside.id);
    expect(await queueIds(agents.quang, assignments.quang)).toContain(
      inside.id,
    );
    expect(await queueIds(agents.chi, assignments.chi)).not.toContain(
      inside.id,
    );
    expect(await queueIds(agents.an, assignments.an)).toEqual(
      expect.arrayContaining([inside.id, outside.id]),
    );
  });

  it('hides the reviewer’s own submission even across two of their assignments', async () => {
    const secondaryId = fixture!.secondaryId;
    const own = await createDraft(agents.dung, secondaryId);
    await submit(agents.dung, secondaryId, own).expect(200);
    expect(await queueIds(agents.dung, assignments.dung)).not.toContain(own.id);
    expect(await queueIds(agents.an, assignments.an)).toContain(own.id);
  });

  it('rejects missing, expired, and borrowed review grants', async () => {
    for (const [agent, assignmentId] of [
      [agents.ha, assignments.ha],
      [agents.member, assignments.member],
      [agents.ha, assignments.dung],
    ] as const) {
      const response = await agent
        .get(queuePath)
        .set(header, assignmentId)
        .expect(403);
      expect(response.body).toMatchObject({ code: 'MISSING_PERMISSION' });
    }
  });
});
