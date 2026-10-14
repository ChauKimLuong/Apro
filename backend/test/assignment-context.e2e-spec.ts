import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';

const userId = '10000000-0000-4000-8000-000000000001';
const allowedAssignmentId = '20000000-0000-4000-8000-000000000001';
const unprivilegedAssignmentId = '20000000-0000-4000-8000-000000000002';
const otherUserAssignmentId = '20000000-0000-4000-8000-000000000003';
const header = 'X-Employee-Assignment-Id';
const cookie = 'apro_session=test-session';

describe('Assignment context (e2e)', () => {
  let app: INestApplication<App>;

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
        user: { findMany: () => Promise.resolve([]) },
      })
      .compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('uses only the selected assignment for the same signed-in account', async () => {
    const listEmployees = () =>
      request(app.getHttpServer()).get('/users').set('Cookie', cookie);

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
      .get('/users')
      .set('Cookie', cookie)
      .set(header, otherUserAssignmentId)
      .expect(403);
  });

  it('requires a valid assignment ID for an authenticated permission check', async () => {
    const listEmployees = () =>
      request(app.getHttpServer()).get('/users').set('Cookie', cookie);

    await listEmployees().expect(400);
    await listEmployees().set(header, 'invalid-id').expect(400);
  });

  it('requires a session even when the assignment ID is present', async () => {
    await request(app.getHttpServer())
      .get('/users')
      .set(header, allowedAssignmentId)
      .expect(401);
  });
});
