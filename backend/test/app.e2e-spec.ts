import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { createValidationPipe } from '../src/common/pipes/app-validation.pipe';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('POST /auth/login rejects a numeric password with a localized error', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'active@example.test', password: 123 })
      .expect(400)
      .expect({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ',
        errors: [
          { field: 'password', message: 'Mật khẩu phải là chuỗi ký tự' },
        ],
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
