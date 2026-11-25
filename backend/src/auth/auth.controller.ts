import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AllowTemporaryPassword,
  AUTH_SESSION_COOKIE,
  getAuthSessionCookieOptions,
  readAuthSessionCookie,
  type AuthenticatedRequest,
} from './auth-session';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthSessionGuard } from './guards/auth-session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: RegisterDto) {
    const user = await this.authService.register(
      body.fullName,
      body.email,
      body.password,
    );

    return {
      ...user,
      code: 'REGISTRATION_SUCCESS',
      message: 'Đăng ký thành công. Tài khoản đang chờ kích hoạt.',
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token, expiresAt } = await this.authService.login(
      body.email,
      body.password,
    );

    response.cookie(AUTH_SESSION_COOKIE, token, {
      ...getAuthSessionCookieOptions(),
      expires: expiresAt,
    });

    return {
      ...user,
      code: 'LOGIN_SUCCESS',
      message: 'Đăng nhập thành công.',
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(readAuthSessionCookie(request));
    response.clearCookie(AUTH_SESSION_COOKIE, getAuthSessionCookieOptions());

    return { code: 'LOGOUT_SUCCESS', message: 'Đăng xuất thành công.' };
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    this.authService.requestPasswordReset(body.email);

    return {
      message:
        'Nếu tài khoản đủ điều kiện, mã đặt lại mật khẩu sẽ được gửi qua email',
    };
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    await this.authService.resetPassword(
      body.email,
      body.otp,
      body.newPassword,
    );

    return {
      code: 'PASSWORD_RESET_SUCCESS',
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }

  @Post('password')
  @AllowTemporaryPassword()
  @UseGuards(AuthSessionGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.changePassword(
      request.authUser.id,
      body.currentPassword,
      body.newPassword,
    );

    response.clearCookie(AUTH_SESSION_COOKIE, getAuthSessionCookieOptions());

    return {
      code: 'PASSWORD_CHANGE_SUCCESS',
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.',
    };
  }

  @Get('me')
  @AllowTemporaryPassword()
  @UseGuards(AuthSessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.authUser;
  }
}
