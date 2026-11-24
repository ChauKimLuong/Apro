const { hash } = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const accounts = [
  {
    email: 'active@example.test',
    fullName: 'Tài khoản test hoạt động',
    status: 'ACTIVE',
  },
  {
    email: 'locked@example.test',
    fullName: 'Tài khoản test bị khóa',
    status: 'LOCKED',
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_USER_PASSWORD;

  if (!connectionString) {
    throw new Error('Missing DATABASE_URL');
  }

  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('SEED_USER_PASSWORD must have at least 12 characters and at most 72 bytes');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const users = await Promise.all(
      accounts.map(async (account) => ({
        ...account,
        passwordHash: await hash(password, 10),
      })),
    );

    await prisma.$transaction(
      users.map((user) =>
        prisma.user.upsert({
          where: { email: user.email },
          update: { passwordHash: user.passwordHash },
          create: user,
        }),
      ),
    );

    console.log(`Prepared ${users.length} test accounts.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});