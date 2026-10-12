import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcrypt';
import type { User } from '../generated/prisma/client';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

jest.mock('./auth.repository', () => ({
  AuthRepository: class AuthRepository {},
}));

describe('AuthService', () => {
  const password = 'test-password';
  const findUserByEmail = jest.fn<Promise<User | null>, [string]>();
  let module: TestingModule;
  let service: AuthService;
  let user: User;

  beforeAll(async () => {
    user = {
      id: 'test-user-id',
      email: 'active@example.test',
      fullName: 'Tài khoản test',
      status: 'ACTIVE',
      passwordHash: await hash(password, 4),
    };
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: { findUserByEmail } },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  beforeEach(() => {
    findUserByEmail.mockReset();
  });

  afterAll(async () => {
    await module.close();
  });

  it('returns only the public profile when the password matches', async () => {
    findUserByEmail.mockResolvedValue(user);

    await expect(service.login(user.email, password)).resolves.toEqual({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    });
  });

  it('reports a locked account when the password matches', async () => {
    findUserByEmail.mockResolvedValue({ ...user, status: 'LOCKED' });

    await expect(service.login(user.email, password)).rejects.toMatchObject({
      response: { statusCode: 403, code: 'ACCOUNT_LOCKED' },
    });
  });

  it.each(['ACTIVE', 'LOCKED'] as const)(
    'returns the same error for an incorrect password on an %s account',
    async (status) => {
      findUserByEmail.mockResolvedValue({ ...user, status });

      await expect(
        service.login(user.email, 'wrong-password'),
      ).rejects.toMatchObject({
        response: { statusCode: 401, code: 'INVALID_CREDENTIALS' },
      });
    },
  );

  it('returns the same error when the email is unknown', async () => {
    findUserByEmail.mockResolvedValue(null);

    await expect(service.login(user.email, password)).rejects.toMatchObject({
      response: { statusCode: 401, code: 'INVALID_CREDENTIALS' },
    });
  });
});
