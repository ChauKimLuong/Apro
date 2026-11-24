import { createHmac } from 'node:crypto';

export function hashPasswordResetCode(
  secret: string,
  userId: string,
  issuedAt: Date,
  otp: string,
): string {
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error('PASSWORD_RESET_OTP_SECRET phải là chuỗi hex 64 ký tự');
  }

  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${userId}:${issuedAt.toISOString()}:${otp}`)
    .digest('hex');
}
