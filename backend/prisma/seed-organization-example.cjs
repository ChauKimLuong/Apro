const { hash } = require('bcrypt');

function exampleId(group, number) {
  return `${group}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

const company = exampleId(3, 101);
const division = exampleId(3, 102);
const department = exampleId(3, 103);

const units = [
  { id: company, name: 'Công ty A', type: 'COMPANY' },
  { id: division, name: 'Khối Công nghệ', type: 'DIVISION', parentId: company },
  {
    id: department,
    name: 'Phòng Công nghệ thông tin',
    type: 'DEPARTMENT',
    parentId: division,
  },
];

const positions = [
  { id: exampleId(4, 101), name: 'CEO', type: 'EXECUTIVE' },
  { id: exampleId(4, 102), name: 'CFO', type: 'EXECUTIVE' },
  { id: exampleId(4, 103), name: 'Giám đốc khối', type: 'MANAGER' },
  { id: exampleId(4, 104), name: 'Trưởng phòng', type: 'MANAGER' },
  { id: exampleId(4, 105), name: 'Phó phòng', type: 'MANAGER' },
  { id: exampleId(4, 106), name: 'Nhân viên', type: 'STAFF' },
];

// Managers appear before the employees who report to them.
const roster = [
  {
    number: 101,
    fullName: 'An',
    email: 'an@example.test',
    organizationalUnitId: company,
    position: 101,
  },
  {
    number: 102,
    fullName: 'Bình',
    email: 'binh@example.test',
    organizationalUnitId: company,
    position: 102,
    manager: 101,
  },
  {
    number: 103,
    fullName: 'Quang',
    email: 'quang@example.test',
    organizationalUnitId: division,
    position: 103,
    manager: 101,
  },
  {
    number: 104,
    fullName: 'Dũng',
    email: 'dung@example.test',
    organizationalUnitId: department,
    position: 104,
    manager: 103,
  },
  {
    number: 105,
    fullName: 'Hà',
    email: 'ha@example.test',
    organizationalUnitId: department,
    position: 105,
    manager: 104,
  },
  {
    number: 106,
    fullName: 'Chi',
    email: 'chi@example.test',
    organizationalUnitId: division,
    position: 106,
    manager: 103,
  },
  {
    number: 107,
    fullName: 'Minh',
    email: 'minh@example.test',
    organizationalUnitId: department,
    position: 106,
    manager: 104,
  },
];

async function prepareOrganizationExample(password) {
  return Promise.all(
    roster.map(async (person) => ({
      ...person,
      passwordHash: await hash(password, 10),
    })),
  );
}

async function seedOrganizationExample(tx, users, systemRoleId, effectiveFrom) {
  for (const unit of units) {
    await tx.organizationalUnit.upsert({
      where: { id: unit.id },
      update: {},
      create: unit,
    });
  }
  for (const position of positions) {
    await tx.position.upsert({
      where: { id: position.id },
      update: {},
      create: position,
    });
  }

  for (const {
    number,
    fullName,
    email,
    passwordHash,
    organizationalUnitId,
    position,
    manager,
  } of users) {
    const userId = exampleId(1, number);
    const assignmentId = exampleId(2, number);
    await tx.user.upsert({
      where: { id: userId },
      update: { fullName },
      create: { id: userId, fullName, email, passwordHash, status: 'ACTIVE' },
    });
    await tx.employeeAssignment.upsert({
      where: { id: assignmentId },
      update: {},
      create: {
        id: assignmentId,
        userId,
        organizationalUnitId,
        positionId: exampleId(4, position),
        managerAssignmentId: manager ? exampleId(2, manager) : null,
        type: 'OFFICIAL',
        isPrimary: true,
        startedAt: effectiveFrom,
      },
    });
  }

  await tx.roleAssignment.upsert({
    where: { id: exampleId(5, 101) },
    update: {},
    create: {
      id: exampleId(5, 101),
      employeeAssignmentId: exampleId(2, 101),
      systemRoleId,
      scopeType: 'GLOBAL',
      validFrom: effectiveFrom,
    },
  });
}

module.exports = { prepareOrganizationExample, seedOrganizationExample };
