const { hash } = require('bcrypt');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('../dist/generated/prisma/client.js');

const accounts = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    assignmentId: '20000000-0000-4000-8000-000000000001',
    email: 'admin@example.test',
    fullName: 'Quản trị viên kiểm thử',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    assignmentId: '20000000-0000-4000-8000-000000000002',
    email: 'member@example.test',
    fullName: 'Nhân viên kiểm thử',
  },
];

const unitId = '30000000-0000-4000-8000-000000000001';
const positionId = '40000000-0000-4000-8000-000000000001';
const warehousePositionId = '40000000-0000-4000-8000-000000000002';
const adminGrantId = '50000000-0000-4000-8000-000000000001';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.SEED_PROVISIONING_PASSWORD;
  const localHosts = ['localhost', '127.0.0.1', '[::1]'];

  if (
    !connectionString ||
    !localHosts.includes(new URL(connectionString).hostname)
  ) {
    throw new Error('Seed phân quyền chỉ dùng với PostgreSQL local');
  }

  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error(
      'SEED_PROVISIONING_PASSWORD cần ít nhất 12 ký tự và tối đa 72 byte',
    );
  }

  const users = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      passwordHash: await hash(password, 10),
    })),
  );
  const [admin] = users;
  const effectiveFrom = new Date();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.organizationalUnit.upsert({
        where: { id: unitId },
        update: {},
        create: { id: unitId, name: 'Công ty kiểm thử Apro', type: 'COMPANY' },
      });
      await tx.position.upsert({
        where: { id: positionId },
        update: {},
        create: { id: positionId, name: 'Nhân viên kiểm thử', type: 'STAFF' },
      });
      await tx.position.upsert({
        where: { id: warehousePositionId },
        update: {},
        create: {
          id: warehousePositionId,
          name: 'Phụ trách kho',
          type: 'STAFF',
        },
      });

      for (const { assignmentId, ...user } of users) {
        await tx.user.upsert({
          where: { id: user.id },
          update: {},
          create: { ...user, status: 'ACTIVE' },
        });
        await tx.employeeAssignment.upsert({
          where: { id: assignmentId },
          update: {},
          create: {
            id: assignmentId,
            userId: user.id,
            organizationalUnitId: unitId,
            positionId,
            type: 'OFFICIAL',
            isPrimary: true,
            startedAt: effectiveFrom,
          },
        });
      }

      const role = await tx.systemRole.upsert({
        where: { code: 'SYSTEM_ADMIN' },
        update: {},
        create: { code: 'SYSTEM_ADMIN', name: 'Quản trị hệ thống' },
      });
      for (const data of [
        { code: 'USER_CREATE', name: 'Cấp tài khoản' },
        { code: 'USER_VIEW', name: 'Xem danh sách nhân viên' },
        { code: 'USER_UPDATE', name: 'Cập nhật trạng thái tài khoản' },
        { code: 'ORGANIZATION_VIEW', name: 'Xem cơ cấu tổ chức' },
      ]) {
        const permission = await tx.permission.upsert({
          where: { code: data.code },
          update: {},
          create: data,
        });
        const rolePermission = {
          systemRoleId: role.id,
          permissionId: permission.id,
        };
        await tx.rolePermission.upsert({
          where: { systemRoleId_permissionId: rolePermission },
          update: {},
          create: rolePermission,
        });
      }
      await tx.roleAssignment.upsert({
        where: { id: adminGrantId },
        update: {},
        create: {
          id: adminGrantId,
          employeeAssignmentId: admin.assignmentId,
          systemRoleId: role.id,
          scopeType: 'GLOBAL',
          validFrom: effectiveFrom,
        },
      });
    });

    console.log(
      'Seed phân quyền hoàn tất cho admin@example.test và member@example.test.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
