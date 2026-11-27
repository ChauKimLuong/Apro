import {
  Controller,
  Get,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AuthModule } from '../src/auth/auth.module';
import { AuthSessionGuard } from '../src/auth/guards/auth-session.guard';
import { AuthorizationModule } from '../src/authorization/authorization.module';
import { UserCreateGuard } from '../src/authorization/guards/user-create.guard';
import { createValidationPipe } from '../src/common/pipes/app-validation.pipe';

@Controller('_test/provisioning')
class PermissionProbeController {
  @Get('user-create')
  @UseGuards(AuthSessionGuard, UserCreateGuard)
  check() {
    return { allowed: true };
  }
}

describe('USER_CREATE guard (local e2e)', () => {
  let app: INestApplication<App>;
  let password: string;
  const path = '/_test/provisioning/user-create';

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule, AuthModule, AuthorizationModule],
      controllers: [PermissionProbeController],
    }).compile();

    app = fixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    password = fixture
      .get(ConfigService)
      .getOrThrow<string>('SEED_PROVISIONING_PASSWORD');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('trả 401 khi chưa đăng nhập', async () => {
    await request(app.getHttpServer()).get(path).expect(401).expect({
      statusCode: 401,
      code: 'INVALID_SESSION',
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
    });
  });

  it.each([
    {
      email: 'admin@example.test',
      status: 200,
      body: { allowed: true },
    },
    {
      email: 'member@example.test',
      status: 403,
      body: {
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: 'Bạn không có quyền cấp tài khoản',
      },
    },
  ])('$email nhận $status', async ({ email, status, body }) => {
    const agent = request.agent(app.getHttpServer());

    try {
      await agent.post('/auth/login').send({ email, password }).expect(200);
      const assignments = await agent
        .get('/employee-assignments/me')
        .expect(200);
      const { data } = assignments.body as {
        data: Array<{ id: string; isPrimary: boolean; canAct: boolean }>;
      };
      const actorAssignment = data.find(
        (assignment) => assignment.isPrimary && assignment.canAct,
      );
      if (!actorAssignment)
        throw new Error(`Thiếu phân công chính cho ${email}`);

      await agent
        .get(path)
        .set('X-Employee-Assignment-Id', actorAssignment.id)
        .expect(status)
        .expect(body);
    } finally {
      await agent.post('/auth/logout').expect(200);
    }
  });
});
