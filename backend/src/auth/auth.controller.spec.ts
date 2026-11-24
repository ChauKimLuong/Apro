import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

jest.mock('./auth.service', () => ({ AuthService: class AuthService {} }));

describe('AuthController', () => {
  it('sets the session cookie and returns the public user with a success message', async () => {
    const user = {
      id: 'test-user-id',
      email: 'active@example.test',
      fullName: 'Tài khoản test',
    };
    const expiresAt = new Date('2026-11-24T12:00:00Z');
    const login = jest.fn().mockResolvedValue({
      user,
      token: 'test-token',
      expiresAt,
    });
    const cookie = jest.fn();
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { login } }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    try {
      const controller = module.get(AuthController);
      const password = 'test-password';
      const response = { cookie } as unknown as Response;

      await expect(
        controller.login({ email: user.email, password }, response),
      ).resolves.toEqual({
        ...user,
        code: 'LOGIN_SUCCESS',
        message: 'Đăng nhập thành công.',
      });
      expect(login).toHaveBeenCalledWith(user.email, password);
      expect(cookie).toHaveBeenCalledWith(
        'apro_session',
        'test-token',
        expect.objectContaining({ httpOnly: true, expires: expiresAt }),
      );
    } finally {
      await module.close();
    }
  });
});
