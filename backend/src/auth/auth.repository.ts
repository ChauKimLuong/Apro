import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma, type PasswordResetCode } from '../generated/prisma/client';

type ResetCodeKey = Pick<PasswordResetCode, 'userId' | 'issuedAt' | 'codeHash'>;

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async createInactiveUser(data: {
    fullName: string;
    email: string;
    passwordHash: string;
  }) {
    try {
      return await this.database.user.create({
        data: { ...data, status: 'INACTIVE' },
        select: { id: true, fullName: true, email: true, status: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }

      throw error;
    }
  }

  findUserByEmail(email: string) {
    return this.database.user.findUnique({
      where: { email },
    });
  }

  async savePasswordResetCode(data: {
    userId: string;
    codeHash: string;
    issuedAt: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    const { userId, ...code } = data;
    const resendBefore = new Date(code.issuedAt.getTime() - 60_000);

    const updated = await this.database.passwordResetCode.updateMany({
      where: { userId, issuedAt: { lte: resendBefore } },
      data: { ...code, failedAttempts: 0, consumedAt: null },
    });

    if (updated.count === 1) {
      return true;
    }

    const created = await this.database.passwordResetCode.createMany({
      data,
      skipDuplicates: true,
    });

    return created.count === 1;
  }

  findUsablePasswordResetCode(email: string) {
    return this.database.passwordResetCode.findFirst({
      where: {
        ...usableResetCode(new Date()),
        user: { email, status: 'ACTIVE' },
      },
      select: {
        userId: true,
        issuedAt: true,
        codeHash: true,
        user: { select: { passwordHash: true } },
      },
    });
  }

  async incrementPasswordResetAttempts({
    userId,
    issuedAt,
    codeHash,
  }: ResetCodeKey): Promise<void> {
    await this.database.passwordResetCode.updateMany({
      where: { userId, issuedAt, codeHash, ...usableResetCode(new Date()) },
      data: { failedAttempts: { increment: 1 } },
    });
  }

  async resetPasswordAndRevokeSessions(
    { userId, issuedAt, codeHash }: ResetCodeKey,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    return this.database.$transaction(async (tx) => {
      // Lock the user first, in the same order as an authenticated change.
      const user = await tx.user.updateMany({
        where: {
          id: userId,
          status: 'ACTIVE',
          passwordHash: expectedPasswordHash,
        },
        data: { passwordHash: expectedPasswordHash },
      });
      if (user.count === 0) {
        return false;
      }

      const now = new Date();
      const code = await tx.passwordResetCode.updateMany({
        where: { userId, issuedAt, codeHash, ...usableResetCode(now) },
        data: { consumedAt: now },
      });
      if (code.count === 0) {
        return false;
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: newPasswordHash,
          temporaryPasswordExpiresAt: null,
        },
      });
      await tx.authSession.deleteMany({ where: { userId } });
      return true;
    });
  }

  findPasswordByUserId(userId: string) {
    return this.database.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, status: true },
    });
  }

  async updatePasswordAndRevokeSessions(
    userId: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
  ): Promise<boolean> {
    return this.database.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: {
          id: userId,
          status: 'ACTIVE',
          passwordHash: expectedPasswordHash,
          ...passwordNotExpired(new Date()),
        },
        data: {
          passwordHash: newPasswordHash,
          temporaryPasswordExpiresAt: null,
        },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.passwordResetCode.deleteMany({ where: { userId } });
      await tx.authSession.deleteMany({ where: { userId } });
      return true;
    });
  }

  findSessionByTokenHash(tokenHash: string) {
    return this.database.authSession.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            status: true,
            temporaryPasswordExpiresAt: true,
          },
        },
      },
    });
  }

  async createSession(
    data: { tokenHash: string; userId: string; expiresAt: Date },
    verifiedPasswordHash: string,
  ): Promise<boolean> {
    return this.database.$transaction(async (tx) => {
      // Hold the user row lock until the session is created so a password change
      // either revokes this session or prevents it from being created.
      const result = await tx.user.updateMany({
        where: {
          id: data.userId,
          status: 'ACTIVE',
          passwordHash: verifiedPasswordHash,
          ...passwordNotExpired(new Date()),
        },
        data: { passwordHash: verifiedPasswordHash },
      });

      if (result.count === 0) {
        return false;
      }

      await tx.authSession.create({ data });
      return true;
    });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.database.authSession.deleteMany({ where: { tokenHash } });
  }
}

function passwordNotExpired(now: Date): Prisma.UserWhereInput {
  return {
    OR: [
      { temporaryPasswordExpiresAt: null },
      { temporaryPasswordExpiresAt: { gt: now } },
    ],
  };
}

function usableResetCode(now: Date): Prisma.PasswordResetCodeWhereInput {
  return {
    consumedAt: null,
    expiresAt: { gt: now },
    failedAttempts: { lt: 5 },
  };
}
