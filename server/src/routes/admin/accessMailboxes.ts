import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { hasMinRole, requireRole } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { badRequest, notFound, parse } from '../../lib/http.js';
import { GRANT_LEVELS } from '../../lib/mail/access.js';
import { mailAccessText } from '../../lib/mail/accessTexts.js';
import { notifyUser } from '../../lib/notifications.js';

/**
 * Access Center › Mailboxes (SUPER_ADMIN only) — mounted at /api/admin/access/mailboxes:
 *
 *   GET    /                 every workspace mailbox (owner, address) with who else may open it, + the staff list
 *   POST   /grants           { accountId, userId, level: READ | SEND }  give or change access (upsert)
 *   DELETE /grants/:id       take access away
 *
 * A SUPER_ADMIN reads every mailbox without a grant; the owner always has full access. Every change is audit-logged
 * (MAIL_ACCESS_GRANTED / MAIL_ACCESS_CHANGED / MAIL_ACCESS_REVOKED) and the owner and the colleague get an in-app
 * notice. Never returns passwords or server settings. Enforcement: lib/mail/access.ts in routes/mail.ts.
 */
export const adminAccessMailboxesRouter = Router();
adminAccessMailboxesRouter.use(requireRole('SUPER_ADMIN'));

const person = { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true } as const;
const nameOf = (u: { firstName: string; lastName: string; email: string }) => `${u.firstName} ${u.lastName}`.trim() || u.email;

adminAccessMailboxesRouter.get('/', async (_req, res) => {
  const [accounts, users] = await Promise.all([
    prisma.mailAccount.findMany({
      orderBy: [{ user: { firstName: 'asc' } }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        syncStatus: true,
        user: { select: person },
        grants: { orderBy: { createdAt: 'asc' }, select: { id: true, level: true, createdAt: true, user: { select: person } } },
      },
    }),
    prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], select: person }),
  ]);
  res.json({
    mailboxes: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.displayName,
      syncStatus: a.syncStatus,
      owner: a.user,
      grants: a.grants.filter((g) => hasMinRole(g.user.role, 'STAFF')).map((g) => ({ id: g.id, level: g.level, createdAt: g.createdAt, user: g.user })),
    })),
    users,
  });
});

const notifyBoth = async (
  req: Request,
  kind: 'granted' | 'revoked',
  account: { email: string; user: { id: string; locale: string } & { firstName: string; lastName: string; email: string } },
  grantee: { id: string; locale: string; firstName: string; lastName: string; email: string },
  level: 'READ' | 'SEND',
) => {
  const to = account.user;
  const ot = mailAccessText(to.locale);
  const gt = mailAccessText(grantee.locale);
  const jobs: Promise<unknown>[] = [];
  if (to.id !== req.user!.id) {
    jobs.push(
      notifyUser(to.id, {
        type: 'MAIL_ACCESS',
        title: kind === 'granted' ? ot.ownerGrantedTitle(nameOf(grantee), account.email) : ot.ownerRevokedTitle(nameOf(grantee), account.email),
        body: kind === 'granted' ? ot.ownerGrantedBody(nameOf(grantee), ot.level[level]) : '',
        link: '/workspace/mail',
        email: false,
      }),
    );
  }
  if (grantee.id !== req.user!.id) {
    jobs.push(
      notifyUser(grantee.id, {
        type: 'MAIL_ACCESS',
        title: kind === 'granted' ? gt.userGrantedTitle(account.email) : gt.userRevokedTitle(account.email),
        body: kind === 'granted' ? gt.userGrantedBody(nameOf(to), gt.level[level]) : '',
        link: '/workspace/mail',
        email: false,
      }),
    );
  }
  await Promise.all(jobs.map((p) => p.catch(() => undefined)));
};

const grantSchema = z.object({ accountId: z.string().trim().min(1).max(40), userId: z.string().trim().min(1).max(40), level: z.enum(GRANT_LEVELS) });

adminAccessMailboxesRouter.post('/grants', async (req, res) => {
  const body = parse(grantSchema, req.body);
  const withLocale = { ...person, locale: true } as const;
  const [account, grantee] = await Promise.all([
    prisma.mailAccount.findUnique({ where: { id: body.accountId }, select: { id: true, email: true, userId: true, user: { select: withLocale } } }),
    prisma.user.findUnique({ where: { id: body.userId }, select: withLocale }),
  ]);
  if (!account) throw notFound('MAIL_ACCOUNT_NOT_FOUND');
  if (!grantee || !grantee.isActive) throw notFound('USER_NOT_FOUND');
  if (!hasMinRole(grantee.role, 'STAFF')) throw badRequest('NOT_STAFF'); // mailboxes are shared only inside the team
  if (grantee.id === account.userId) throw badRequest('OWNER_HAS_ACCESS');
  const before = await prisma.mailAccountGrant.findUnique({ where: { accountId_userId: { accountId: account.id, userId: grantee.id } } });
  const grant = await prisma.mailAccountGrant.upsert({
    where: { accountId_userId: { accountId: account.id, userId: grantee.id } },
    update: { level: body.level, grantedById: req.user!.id },
    create: { accountId: account.id, userId: grantee.id, level: body.level, grantedById: req.user!.id },
  });
  if (!before || before.level !== body.level) {
    await audit(req, before ? 'MAIL_ACCESS_CHANGED' : 'MAIL_ACCESS_GRANTED', account.id, {
      grantId: grant.id,
      mailbox: account.email,
      ownerId: account.userId,
      userId: grantee.id,
      level: body.level,
      ...(before ? { before: before.level } : {}),
    });
    await notifyBoth(req, 'granted', account, grantee, body.level);
  }
  res.status(before ? 200 : 201).json({ grant: { id: grant.id, level: grant.level, createdAt: grant.createdAt, user: { id: grantee.id, firstName: grantee.firstName, lastName: grantee.lastName, email: grantee.email, role: grantee.role } } });
});

adminAccessMailboxesRouter.delete('/grants/:id', async (req, res) => {
  const withLocale = { ...person, locale: true } as const;
  const grant = await prisma.mailAccountGrant.findUnique({
    where: { id: String(req.params.id) },
    include: { user: { select: withLocale }, account: { select: { id: true, email: true, userId: true, user: { select: withLocale } } } },
  });
  if (!grant) throw notFound('GRANT_NOT_FOUND');
  await prisma.mailAccountGrant.delete({ where: { id: grant.id } });
  await audit(req, 'MAIL_ACCESS_REVOKED', grant.accountId, { grantId: grant.id, mailbox: grant.account.email, ownerId: grant.account.userId, userId: grant.userId, level: grant.level });
  await notifyBoth(req, 'revoked', grant.account, grant.user, grant.level);
  res.json({ ok: true });
});
