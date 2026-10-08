import bcrypt from 'bcryptjs';
import { prisma } from '../src/prisma.js';

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const fullname = process.env.ADMIN_FULLNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !/^[a-zA-Z0-9_]{3,50}$/.test(username)) {
    throw new Error('ADMIN_USERNAME phải có 3-50 ký tự chữ, số hoặc dấu gạch dưới.');
  }
  if (!fullname || [...fullname].length > 100) {
    throw new Error('ADMIN_FULLNAME là bắt buộc và không quá 100 ký tự.');
  }
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD phải có ít nhất 12 ký tự và không quá 72 byte.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async tx => {
    const adminRole = await tx.role.upsert({
      where: { rolename: 'ADMIN' }, update: {}, create: { rolename: 'ADMIN' },
    });
    // Preserve the role ID for existing users when upgrading the earlier MVP.
    const normalRole = await tx.role.findUnique({ where: { rolename: 'normal' } });
    const legacyRole = await tx.role.findUnique({ where: { rolename: 'CUSTOMER' } });
    if (!normalRole && legacyRole) {
      await tx.role.update({ where: { roleid: legacyRole.roleid }, data: { rolename: 'normal' } });
    } else {
      await tx.role.upsert({ where: { rolename: 'normal' }, update: {}, create: { rolename: 'normal' } });
      if (legacyRole) {
        const target = await tx.role.findUniqueOrThrow({ where: { rolename: 'normal' } });
        await tx.user.updateMany({ where: { roleid: legacyRole.roleid }, data: { roleid: target.roleid } });
      }
    }
    const membership = await tx.membership.upsert({
      where: { mname: 'BASIC' }, update: { score: 10 }, create: { mname: 'BASIC', score: 10 },
    });

    const admin = await tx.user.upsert({
      where: { username },
      update: {},
      create: { username, fullname, password: passwordHash, roleid: adminRole.roleid, mid: membership.mid },
      select: { uid: true, username: true, roleid: true },
    });
    if (admin.roleid !== adminRole.roleid) {
      throw new Error('Tên admin đã thuộc tài khoản khác quyền ADMIN. Seed đã rollback.');
    }
    return { uid: admin.uid, username: admin.username };
  });

  console.log('Seed thành công: ADMIN, normal, BASIC(score=10) và tài khoản admin.');
  console.log(`Admin: ${result.username} (uid=${result.uid}). Tài khoản đã có được giữ nguyên.`);
}

try {
  await main();
} catch (err) {
  console.error('Seed thất bại:', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
