import { prisma } from '../../src/db.js';
import { clearCache } from '../../src/lib/cache.js';

export { prisma };

/** Deletes all rows, children before parents so foreign keys are never violated. */
export const resetDb = async () => {
  await prisma.pushDevice.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.caseMessage.deleteMany();
  await prisma.caseEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentRequirement.deleteMany();
  await prisma.case.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.visaCategory.deleteMany();
  await prisma.service.deleteMany();
  await prisma.partner.deleteMany();
  await prisma.visaSample.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.faq.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  // The public content cache lives in this module graph; drop it with the data.
  clearCache();
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gives fire-and-forget work (emails are sent with `void sendMail(...)`) time to land. */
export const settle = () => sleep(150);

/** Polls until `check` returns a truthy value (used for fire-and-forget email rows). */
export const waitFor = async <T>(check: () => Promise<T | null | undefined | false>, timeoutMs = 3000): Promise<T> => {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met in time');
    await sleep(25);
  }
};

/** Email rows sent to `to`, waiting until at least `min` exist. */
export const emailsTo = async (to: string, min = 1) =>
  waitFor(async () => {
    const rows = await prisma.emailLog.findMany({ where: { to }, orderBy: { createdAt: 'asc' } });
    return rows.length >= min ? rows : null;
  });
