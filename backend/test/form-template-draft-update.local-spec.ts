import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthorizationRepository } from '../src/authorization/authorization.repository';
import { createValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { DatabaseService } from '../src/database/database.service';

const adminAssignmentId = '20000000-0000-4000-8000-000000000001';
const memberAssignmentId = '20000000-0000-4000-8000-000000000002';
const anAssignmentId = '20000000-0000-4000-8000-000000000101';
const header = 'X-Employee-Assignment-Id';
const templatesPath = '/form-templates';
const draftPath = (id: string) => `${templatesPath}/drafts/${id}`;
const originalFields = [
  { key: 'reason', label: 'Lý do', type: 'TEXT', isRequired: true },
  { key: 'priority', label: 'Mức ưu tiên', type: 'SELECT', options: ['Khẩn'] },
];
const revisedFields = [
  {
    key: 'priority',
    label: 'Mức ưu tiên mới',
    type: 'SELECT',
    options: ['Bình thường', 'Khẩn'],
  },
  { key: 'delegate', label: 'Người bàn giao', type: 'TEXT', isRequired: true },
];
const revisionInput = {
  expectedVersion: 1,
  name: 'Mẫu nháp đã sửa',
  fields: revisedFields,
};

type DraftCreated = { data: { id: string; code: string; version: number } };

// Run on a separate local DB after migrate deploy and seed-provisioning.cjs.
// npm run test:e2e -- --runInBand --testRegex=form-template-draft-update.local-spec.ts
describe('Form template draft revisions (local e2e)', () => {
  let app: INestApplication<App>;
  let database: DatabaseService;
  let authorization: AuthorizationRepository;
  let admin: ReturnType<typeof request.agent>;
  let member: ReturnType<typeof request.agent>;
  let an: ReturnType<typeof request.agent>;
  const draftIds: string[] = [];

  async function createDraft() {
    const code = `REVISION_E2E_${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const response = await admin
      .post(templatesPath)
      .set(header, adminAssignmentId)
      .send({ code, name: 'Mẫu nháp ban đầu', fields: originalFields })
      .expect(201);
    const { data } = response.body as DraftCreated;
    draftIds.push(data.id);
    return data;
  }

  const updateAsAdmin = (id: string) =>
    admin.put(draftPath(id)).set(header, adminAssignmentId);

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    database = fixture.get(DatabaseService);
    authorization = fixture.get(AuthorizationRepository);
    app = fixture.createNestApplication();
    app.useLogger(false);
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');

    const password = fixture
      .get(ConfigService)
      .getOrThrow<string>('SEED_PROVISIONING_PASSWORD');
    const server = app.getHttpServer();
    admin = request.agent(server);
    member = request.agent(server);
    an = request.agent(server);

    await Promise.all([
      admin
        .post('/auth/login')
        .send({ email: 'admin@example.test', password })
        .expect(200),
      member
        .post('/auth/login')
        .send({ email: 'member@example.test', password })
        .expect(200),
      an
        .post('/auth/login')
        .send({ email: 'an@example.test', password })
        .expect(200),
    ]);
  }, 15000);

  afterAll(async () => {
    if (!app) return;

    try {
      if (draftIds.length) {
        const forms = { in: draftIds };
        await database.$transaction([
          database.formField.deleteMany({ where: { formTemplateId: forms } }),
          database.formTemplateRevision.deleteMany({
            where: { formTemplateId: forms },
          }),
          database.formTemplate.deleteMany({ where: { id: forms } }),
        ]);
      }
    } finally {
      try {
        await Promise.all([
          admin?.post('/auth/logout'),
          member?.post('/auth/logout'),
          an?.post('/auth/logout'),
        ]);
      } finally {
        await app.close();
      }
    }
  });

  it('stores revision 2 and preserves the name, IDs and field data of revision 1', async () => {
    const draft = await createDraft();
    const key = {
      formTemplateId_version: { formTemplateId: draft.id, version: 1 },
    };
    const include = { fields: { orderBy: { sortOrder: 'asc' } } } as const;
    const before = await database.formTemplateRevision.findUniqueOrThrow({
      where: key,
      include,
    });

    await updateAsAdmin(draft.id)
      .send(revisionInput)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: 'FORM_TEMPLATE_DRAFT_UPDATED',
          data: {
            id: draft.id,
            code: draft.code,
            status: 'DRAFT',
            version: 2,
            name: revisionInput.name,
            fieldCount: 2,
            fields: [
              { ...revisedFields[0], sortOrder: 1 },
              { ...revisedFields[1], sortOrder: 2 },
            ],
          },
        });
      });

    const oldRevision = await database.formTemplateRevision.findUniqueOrThrow({
      where: key,
      include,
    });
    expect(oldRevision).toEqual(before);
    const current = await database.formTemplate.findUniqueOrThrow({
      where: { id: draft.id },
      include: { currentRevision: { include } },
    });
    expect(current.version).toBe(2);
    expect(
      current.currentRevision.fields.every((field) =>
        before.fields.every((oldField) => oldField.id !== field.id),
      ),
    ).toBe(true);

    await admin
      .get(draftPath(draft.id))
      .set(header, adminAssignmentId)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          data: { version: 2, name: revisionInput.name },
        }),
      );
  });

  it('allows only one save when two requests use the same expectedVersion', async () => {
    const draft = await createDraft();
    const replies = await Promise.all([
      updateAsAdmin(draft.id).send({
        ...revisionInput,
        name: 'Thay đổi tab A',
      }),
      updateAsAdmin(draft.id).send({
        ...revisionInput,
        name: 'Thay đổi tab B',
      }),
    ]);

    expect(replies.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = replies.find(({ status }) => status === 200);
    const conflict = replies.find(({ status }) => status === 409);
    expect(conflict?.body).toMatchObject({
      code: 'FORM_TEMPLATE_DRAFT_VERSION_CONFLICT',
      currentVersion: 2,
    });

    const versions = await database.formTemplateRevision.findMany({
      where: { formTemplateId: draft.id },
      orderBy: { version: 'asc' },
      select: { version: true, name: true },
    });
    expect(versions.map(({ version }) => version)).toEqual([1, 2]);
    expect(winner?.body).toMatchObject({
      data: { version: 2, name: versions[1].name },
    });
  });

  it('supports saving an empty revision without deleting the previous fields', async () => {
    const draft = await createDraft();
    await updateAsAdmin(draft.id)
      .send({ ...revisionInput, fields: [] })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          data: { version: 2, fieldCount: 0, fields: [] },
        }),
      );
    expect(
      await database.formField.count({
        where: { formTemplateId: draft.id, templateVersion: 1 },
      }),
    ).toBe(2);
  });

  it('rejects invalid version, field configuration, immutable code and malformed IDs', async () => {
    const draft = await createDraft();
    await updateAsAdmin(draft.id)
      .send({ ...revisionInput, expectedVersion: '1' })
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'expectedVersion' }],
        }),
      );
    await updateAsAdmin(draft.id)
      .send({ ...revisionInput, code: 'NO_CODE_CHANGE' })
      .expect(400);
    await updateAsAdmin(draft.id)
      .send({
        ...revisionInput,
        fields: [originalFields[0], originalFields[0]],
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'DUPLICATE_FORM_FIELD_KEY',
        }),
      );
    await updateAsAdmin(draft.id)
      .send({
        ...revisionInput,
        fields: [{ ...originalFields[1], options: [] }],
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'INVALID_FORM_FIELD_OPTIONS',
        }),
      );
    await updateAsAdmin('not-a-uuid')
      .send(revisionInput)
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'INVALID_FORM_TEMPLATE_ID',
        }),
      );
    expect(
      await database.formTemplateRevision.count({
        where: { formTemplateId: draft.id },
      }),
    ).toBe(1);
  });

  it('requires authentication and the specific FORM_UPDATE permission', async () => {
    const draft = await createDraft();
    await request(app.getHttpServer())
      .put(draftPath(draft.id))
      .set(header, adminAssignmentId)
      .send(revisionInput)
      .expect(401);
    await member
      .put(draftPath(draft.id))
      .set(header, memberAssignmentId)
      .send(revisionInput)
      .expect(403);

    const check = jest
      .spyOn(authorization, 'hasPermissionOnOwnAssignment')
      .mockImplementation((_userId, _assignmentId, permission) =>
        Promise.resolve(permission === 'FORM_CREATE'),
      );
    try {
      await updateAsAdmin(draft.id)
        .send(revisionInput)
        .expect(403)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            code: 'MISSING_PERMISSION',
          }),
        );
      expect(check).toHaveBeenCalledWith(
        expect.any(String),
        adminAssignmentId,
        'FORM_UPDATE',
      );
    } finally {
      check.mockRestore();
    }
  });

  it('returns the same 404 for a draft from another assignment, an inactive form and a missing form', async () => {
    const draft = await createDraft();
    const checkNotFound = ({ body }: { body: unknown }) => {
      expect(body).toMatchObject({ code: 'FORM_TEMPLATE_DRAFT_NOT_FOUND' });
    };

    await an
      .put(draftPath(draft.id))
      .set(header, anAssignmentId)
      .send(revisionInput)
      .expect(404)
      .expect(checkNotFound);
    await database.formTemplate.update({
      where: { id: draft.id },
      data: { status: 'INACTIVE' },
    });
    await updateAsAdmin(draft.id)
      .send(revisionInput)
      .expect(404)
      .expect(checkNotFound);
    await updateAsAdmin(randomUUID())
      .send(revisionInput)
      .expect(404)
      .expect(checkNotFound);
  });

  it('rolls back the current-version pointer if writing the new revision fails', async () => {
    const draft = await createDraft();
    await database.formTemplateRevision.create({
      data: {
        formTemplateId: draft.id,
        version: 2,
        name: 'Trùng khóa revision',
      },
    });

    await updateAsAdmin(draft.id).send(revisionInput).expect(500);

    const persisted = await database.formTemplate.findUniqueOrThrow({
      where: { id: draft.id },
      include: { currentRevision: true },
    });
    expect(persisted.version).toBe(1);
    expect(persisted.currentRevision.name).toBe('Mẫu nháp ban đầu');
    expect(
      await database.formField.count({
        where: { formTemplateId: draft.id, templateVersion: 2 },
      }),
    ).toBe(0);
  });
});
