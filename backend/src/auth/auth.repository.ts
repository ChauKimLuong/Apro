import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  findUserByEmail(email: string) {
    return this.database.user.findUnique({
      where: { email },
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
        },
        data: { passwordHash: newPasswordHash },
      });

      if (result.count === 0) {
        return false;
      }

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
          select: { id: true, email: true, fullName: true, status: true },
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
