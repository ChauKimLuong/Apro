import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { createValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { DatabaseService } from '../src/database/database.service';

const userId = '10000000-0000-4000-8000-000000000001';
const allowedAssignmentId = '20000000-0000-4000-8000-000000000001';
const unprivilegedAssignmentId = '20000000-0000-4000-8000-000000000002';
const otherUserAssignmentId = '20000000-0000-4000-8000-000000000003';
const header = 'X-Employee-Assignment-Id';
const cookie = 'apro_session=test-session';

describe('Assignment context (e2e)', () => {
  let app: INestApplication<App>;
  const transaction = jest.fn();

  beforeAll(async () => {
    const grants = [
      { assignmentId: allowedAssignmentId, ownerId: userId },
      { assignmentId: otherUserAssignmentId, ownerId: 'other-user' },
    ];
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService)
      .useValue({
        getSessionUser: (token: unknown) => {
          if (token !== 'test-session') throw new UnauthorizedException();
          return Promise.resolve({ id: userId });
        },
      })
      .overrideProvider(DatabaseService)
      .useValue({
        $transaction: transaction,
        roleAssignment: {
          findFirst: ({
            where,
          }: {
            where: {
              employeeAssignmentId: string;
              employeeAssignment: { userId: string };
            };
          }) =>
            Promise.resolve(
              grants.find(
                (grant) =>
                  grant.assignmentId === where.employeeAssignmentId &&
                  grant.ownerId === where.employeeAssignment.userId,
              ) ?? null,
            ),
        },
        user: {
          findMany: () => Promise.resolve([]),
          findUnique: ({ where }: { where: { id: string } }) =>
            Promise.resolve(
              where.id === userId ? { id: userId, assignments: [] } : null,
            ),
        },
      })
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('uses only the selected assignment for the same signed-in account', async () => {
    const listEmployees = () =>
      request(app.getHttpServer()).get('/employees').set('Cookie', cookie);

    await listEmployees().set(header, allowedAssignmentId).expect(200);
    await listEmployees()
      .set(header, unprivilegedAssignmentId)
      .expect(403)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'MISSING_PERMISSION' }),
      );
    await listEmployees().set(header, allowedAssignmentId).expect(200);
  });

  it('rejects a grant that belongs to another signed-in account', async () => {
    await request(app.getHttpServer())
      .get('/employees')
      .set('Cookie', cookie)
      .set(header, otherUserAssignmentId)
      .expect(403);
  });

  it('requires a valid assignment ID for an authenticated permission check', async () => {
    const listEmployees = () =>
      request(app.getHttpServer()).get('/employees').set('Cookie', cookie);

    await listEmployees().expect(400);
    await listEmployees().set(header, 'invalid-id').expect(400);
  });

  it('requires a session even when the assignment ID is present', async () => {
    await request(app.getHttpServer())
      .get('/employees')
      .set(header, allowedAssignmentId)
      .expect(401);
  });

  it('gets employee details using the employee ID and validates the route parameter', async () => {
    const getEmployee = (employeeId: string) =>
      request(app.getHttpServer())
        .get(`/employees/${employeeId}`)
        .set('Cookie', cookie)
        .set(header, allowedAssignmentId);

    await getEmployee(userId).expect(200, {
      data: { id: userId, assignments: [] },
    });
    await getEmployee('invalid-id').expect(400);
    await getEmployee(otherUserAssignmentId).expect(404);
  });

  it('lists personal assignments before an actor assignment is selected', async () => {
    await request(app.getHttpServer())
      .get('/employee-assignments/me')
      .set('Cookie', cookie)
      .expect(200, { data: [] });
  });

  it('requires a target user ID in the body when creating a concurrent assignment', async () => {
    await request(app.getHttpServer())
      .post('/employee-assignments/concurrent')
      .set('Cookie', cookie)
      .set(header, allowedAssignmentId)
      .send({
        organizationalUnitId: allowedAssignmentId,
        positionId: unprivilegedAssignmentId,
      })
      .expect(400)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          code: 'VALIDATION_ERROR',
          errors: [{ field: 'userId' }],
        }),
      );
  });

  it('returns 409 when PostgreSQL reports a write conflict at primary assignment commit', async () => {
    const conflict = new Error('TransactionWriteConflict', {
      cause: { kind: 'TransactionWriteConflict', originalCode: '40001' },
    });
    conflict.name = 'DriverAdapterError';
    transaction.mockRejectedValueOnce(conflict);

    await request(app.getHttpServer())
      .post('/employee-assignments/primary')
      .set('Cookie', cookie)
      .set(header, allowedAssignmentId)
      .send({
        userId,
        organizationalUnitId: allowedAssignmentId,
        positionId: unprivilegedAssignmentId,
      })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toMatchObject({ code: 'ASSIGNMENT_CHANGED' }),
      );
  });
});
