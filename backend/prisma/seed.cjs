const { randomBytes, scrypt } = require('node:crypto');
const { promisify } = require('node:util');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const deriveKey = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }
  if (!password || password.length < 12) {
    throw new Error('SEED_USER_PASSWORD must have at least 12 characters');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const { count } = await prisma.user.createMany({
      data: [
        {
          fullName: 'Tài khoản test hoạt động',
          email: 'active@example.test',
          status: 'ACTIVE',
          passwordHash: await hashPassword(password),
        },
        {
          fullName: 'Tài khoản test bị khóa',
          email: 'locked@example.test',
          status: 'LOCKED',
          passwordHash: await hashPassword(password),
        },
      ],
      skipDuplicates: true,
    });

    console.log(`Created ${count} test account(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});