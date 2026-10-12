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

  async createSession(data: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.authSession.create({ data });
  }
}
