import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/**
 * White-label: a new one-time "set your password" link for the SUPER_ADMIN (e.g. when the link printed by the
 * first seed expired). Run inside the API container:
 *   docker compose -f docker-compose.prod.yml exec -T api npx tsx prisma/setupLink.ts [email]
 * (deploy/whitelabel/setup-link.sh does exactly this over SSH). Earlier unused links of that user stop working.
 */
const prisma = new PrismaClient();

const main = async () => {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  const user = email
    ? await prisma.user.findFirst({ where: { email, role: 'SUPER_ADMIN' } })
    : await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error(email ? `No SUPER_ADMIN with e-mail ${email}` : 'No SUPER_ADMIN account yet: run the seed first');
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
  });
  const base = (process.env.CLIENT_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  console.log(`Setup link for ${user.email} (valid 72 h): ${base}/reset-password?token=${token}`);
};

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
