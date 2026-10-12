import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

jest.mock('./auth.service', () => ({ AuthService: class AuthService {} }));

describe('AuthController', () => {
  it('passes the credentials to AuthService and returns the public user', async () => {
    const user = {
      id: 'test-user-id',
      email: 'active@example.test',
      fullName: 'Tài khoản test',
    };
    const login = jest.fn().mockResolvedValue(user);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    }).compile();

    try {
      const controller = module.get(AuthController);
      const password = 'test-password';

      await expect(
        controller.login({ email: user.email, password }),
      ).resolves.toEqual(user);
      expect(login).toHaveBeenCalledWith(user.email, password);
    } finally {
      await module.close();
    }
  });
});
