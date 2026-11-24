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

  async createSession(data: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.authSession.create({ data });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.database.authSession.deleteMany({ where: { tokenHash } });
  }
}
