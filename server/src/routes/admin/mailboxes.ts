import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, limiter, notFound, parse } from '../../lib/http.js';
import { requireMinRole } from '../../middleware/auth.js';
import {
  createMailbox,
  deleteMailbox,
  getAutoReply,
  getMailbox,
  listMailboxes,
  setAutoReply,
  setMailboxPassword,
  updateMailbox,
  type Mailbox,
} from '../../lib/stalwart/client.js';
import { clientSettings, stalwartConfig, stalwartDomain } from '../../lib/stalwart/config.js';
import {
  autoReplySchema,
  connectWorkspaceMailbox,
  generatePassword,
  isReservedLocalPart,
  linkedUsers,
  localPartSchema,
  mailboxPassword,
  protectionOf,
  reencryptWorkspaceAccounts,
  requireStalwart,
  setWorkspaceSync,
  suggestLocalPart,
  viaStalwart,
} from '../../lib/stalwart/service.js';

/**
 * /api/admin/mailboxes: our own @domain mailboxes on the Stalwart mail server.
 * ADMIN may look at the list (and auto-replies); every change is SUPER_ADMIN only.
 * Passwords are returned exactly once (in the create / reset / enable response) and never stored or
 * logged here; workspace mail accounts that use the mailbox get the new password re-encrypted.
 */
export const adminMailboxesRouter = Router();

const superOnly = requireMinRole('SUPER_ADMIN');

const idParam = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const MB = 1024 * 1024;

// Password resets and creations: generous for an admin, but bounded.
const passwordLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 30, keyGenerator: (req) => `u:${(req as Request).user?.id ?? req.ip}` });

const aliasesSchema = z
  .array(z.string().trim().toLowerCase().max(190))
  .max(50)
  .transform((list, ctx) => {
    const domain = stalwartDomain();
    const out: string[] = [];
    for (const raw of list) {
      if (!raw) continue;
      const [local, dom] = raw.includes('@') ? raw.split('@', 2) : [raw, domain];
      if (dom !== domain) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ALIAS_OTHER_DOMAIN' });
        return z.NEVER;
      }
      const lp = localPartSchema.safeParse(local);
      if (!lp.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_LOCAL_PART' });
        return z.NEVER;
      }
      if (!out.includes(lp.data)) out.push(lp.data);
    }
    return out;
  });

const quotaMb = z.number().int().min(1).max(10 * 1024 * 1024).nullable();

/** postmaster@, abuse@, no-reply@ … only when the super admin ticked "allow reserved". */
const assertNotReserved = (localParts: string[], allowReserved: boolean | undefined) => {
  if (allowReserved) return;
  const hit = localParts.find(isReservedLocalPart);
  if (hit) throw badRequest('RESERVED_LOCAL_PART', hit);
};

/** Mailboxes disabled in this app (password replaced by an unknown secret), by address. */
const disabledMap = async (addresses: string[]) => {
  if (!addresses.length) return new Map<string, Date>();
  const rows = await prisma.staffMailbox.findMany({ where: { address: { in: addresses }, disabledAt: { not: null } }, select: { address: true, disabledAt: true } });
  return new Map(rows.map((r) => [r.address, r.disabledAt!]));
};

const isDisabled = async (address: string) => !!(await prisma.staffMailbox.findUnique({ where: { address }, select: { disabledAt: true } }))?.disabledAt;

const linkedFor = async (list: Mailbox[]) => {
  const addresses = list.map((m) => m.address);
  const [{ byEmail, workspace }, disabled] = await Promise.all([linkedUsers(addresses), disabledMap(addresses)]);
  return (m: Mailbox) => {
    const u = byEmail.get(m.address);
    const ws = workspace.get(m.address) ?? [];
    const dto = (x: { id: string; email: string; firstName: string; lastName: string; role: string }) => ({ id: x.id, email: x.email, name: `${x.firstName} ${x.lastName}`.trim(), role: x.role });
    const disabledAt = disabled.get(m.address) ?? null;
    return { linkedUser: u ? dto(u) : null, workspaceUsers: ws.map(dto), status: disabledAt ? 'DISABLED' : 'ACTIVE', disabledAt };
  };
};

const dto = (m: Mailbox, extra: Record<string, unknown> = {}) => {
  const p = protectionOf(m);
  return {
    id: m.id,
    address: m.address,
    localPart: m.localPart,
    displayName: m.displayName,
    usedBytes: m.usedBytes,
    quotaBytes: m.quotaBytes,
    createdAt: m.createdAt,
    aliases: m.aliases,
    isAdmin: m.isAdmin,
    protection: p,
    canDelete: p === null,
    canResetPassword: p !== 'SITE_SENDER' && p !== 'MAIL_ADMIN',
    canDisable: p === null,
    status: 'ACTIVE',
    disabledAt: null,
    ...extra,
  };
};

const load = async (id: string) => {
  const cfg = requireStalwart();
  const m = await viaStalwart(() => getMailbox(cfg, id));
  if (!m) throw notFound('MAILBOX_NOT_FOUND');
  return { cfg, m };
};

/** A random secret nobody knows: a disabled mailbox can no longer log in (IMAP, SMTP, JMAP). */
const lockSecret = () => `${generatePassword()}-${generatePassword()}`;

adminMailboxesRouter.get('/', async (req, res) => {
  const settings = { domain: stalwartDomain(), ...clientSettings(), canManage: req.user!.role === 'SUPER_ADMIN' };
  const cfg = stalwartConfig();
  if (!cfg) {
    res.json({ configured: false, ...settings, mailboxes: [] });
    return;
  }
  const list = await viaStalwart(() => listMailboxes(cfg));
  const links = await linkedFor(list);
  res.json({ configured: true, ...settings, mailboxes: list.map((m) => dto(m, links(m))) });
});

/** Staff members a new mailbox can be connected to (with the suggested ad.soyad local part). */
adminMailboxesRouter.get('/staff', superOnly, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 500,
  });
  res.json({
    users: users.map((u) => ({ id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role, suggestedLocalPart: suggestLocalPart(u.firstName, u.lastName) })),
  });
});

const createSchema = z.object({
  localPart: localPartSchema,
  displayName: z.string().trim().max(120).nullable().optional(),
  password: mailboxPassword.optional(),
  quotaMb: quotaMb.optional(),
  aliases: aliasesSchema.optional(),
  /** Connect the new mailbox in this staff member's workspace mail (Poçt). */
  userId: z.string().trim().min(1).max(40).nullable().optional(),
  /** Explicitly allow role addresses such as postmaster@ or no-reply@. */
  allowReserved: z.boolean().optional(),
});

adminMailboxesRouter.post('/', superOnly, passwordLimiter, async (req, res) => {
  const cfg = requireStalwart();
  const body = parse(createSchema, req.body);
  if (body.aliases?.includes(body.localPart)) throw badRequest('ALIAS_SAME_AS_ADDRESS');
  assertNotReserved([body.localPart, ...(body.aliases ?? [])], body.allowReserved);
  // Checked before anything is created on the mail server.
  const user = body.userId
    ? await prisma.user.findFirst({ where: { id: body.userId, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, firstName: true, lastName: true } })
    : null;
  if (body.userId && !user) throw notFound('USER_NOT_FOUND');
  const generated = !body.password;
  const password = body.password ?? generatePassword();
  const m = await viaStalwart(() =>
    createMailbox(cfg, {
      localPart: body.localPart,
      displayName: body.displayName || (user ? `${user.firstName} ${user.lastName}`.trim() || null : null),
      password,
      quotaBytes: body.quotaMb ? body.quotaMb * MB : null,
      aliases: body.aliases ?? [],
    }),
  );
  // A leftover "disabled" row of an earlier mailbox with this address must not disable the new one.
  await prisma.staffMailbox.deleteMany({ where: { address: m.address } });
  const workspaceAccountId = user ? await connectWorkspaceMailbox(user.id, m, password) : null;
  await audit(req, 'MAILBOX_CREATED', m.address, {
    id: m.id,
    quotaMb: body.quotaMb ?? null,
    aliases: m.aliases,
    generatedPassword: generated,
    ...(user ? { forUser: user.id, workspaceConnected: !!workspaceAccountId } : {}),
    ...(body.allowReserved ? { allowReserved: true } : {}),
  });
  const links = await linkedFor([m]);
  // The only time the password leaves the server: the super admin hands it to the mailbox owner.
  res.status(201).json({ mailbox: dto(m, links(m)), password, generated, workspaceConnected: !!workspaceAccountId, settings: clientSettings() });
});

const updateSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  quotaMb: quotaMb.optional(),
  aliases: aliasesSchema.optional(),
  allowReserved: z.boolean().optional(),
});

adminMailboxesRouter.patch('/:id', superOnly, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const { allowReserved, ...body } = parse(updateSchema, req.body);
  if (body.aliases?.includes(m.localPart)) throw badRequest('ALIAS_SAME_AS_ADDRESS');
  // Aliases the mailbox already has stay allowed; only newly added reserved ones need the flag.
  if (body.aliases) assertNotReserved(body.aliases.filter((a) => !m.aliases.includes(`${a}@${stalwartDomain()}`)), allowReserved);
  const updated = await viaStalwart(() =>
    updateMailbox(cfg, m.id, {
      ...(body.displayName !== undefined ? { displayName: body.displayName || null } : {}),
      ...(body.quotaMb !== undefined ? { quotaBytes: body.quotaMb === null ? null : body.quotaMb * MB } : {}),
      ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
    }),
  );
  await audit(req, 'MAILBOX_UPDATED', m.address, { id: m.id, fields: Object.keys(body), ...(body.aliases ? { aliases: updated.aliases } : {}), ...(body.quotaMb !== undefined ? { quotaMb: body.quotaMb } : {}) });
  const links = await linkedFor([updated]);
  res.json({ mailbox: dto(updated, links(updated)) });
});

/** The website sends with this mailbox / the API logs in with it: never lock them out from the UI. */
const assertUnprotected = (m: Mailbox) => {
  const p = protectionOf(m);
  if (p === 'SITE_SENDER') throw conflict('SITE_SENDER_PROTECTED');
  if (p === 'MAIL_ADMIN') throw conflict('MAIL_ADMIN_PROTECTED');
};

adminMailboxesRouter.post('/:id/password', superOnly, passwordLimiter, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(z.object({ password: mailboxPassword.optional() }), req.body ?? {});
  assertUnprotected(m);
  // A new password would silently re-open a disabled mailbox: enabling it is the explicit way.
  if (await isDisabled(m.address)) throw conflict('MAILBOX_DISABLED');
  const generated = !body.password;
  const password = body.password ?? generatePassword();
  await viaStalwart(() => setMailboxPassword(cfg, m.id, password));
  const workspaceAccountsUpdated = await reencryptWorkspaceAccounts(m.address, password);
  await audit(req, 'MAILBOX_PASSWORD_RESET', m.address, { id: m.id, generated, workspaceAccountsUpdated });
  res.json({ password, generated, workspaceAccountsUpdated });
});

/**
 * Disable: Stalwart keeps the account (mail keeps arriving, nothing is lost) but its password is replaced
 * by a random secret that is neither stored nor returned, so no client can log in any more; workspace
 * accounts using it stop syncing. Sessions that are already open end at their next login.
 */
adminMailboxesRouter.post('/:id/disable', superOnly, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  assertUnprotected(m);
  if (await isDisabled(m.address)) throw conflict('MAILBOX_ALREADY_DISABLED');
  await viaStalwart(() => setMailboxPassword(cfg, m.id, lockSecret()));
  const now = new Date();
  await prisma.staffMailbox.upsert({
    where: { address: m.address },
    create: { address: m.address, stalwartId: m.id, disabledAt: now, disabledById: req.user!.id },
    update: { stalwartId: m.id, disabledAt: now, disabledById: req.user!.id },
  });
  const workspaceAccountsPaused = await setWorkspaceSync(m.address, false);
  await audit(req, 'MAILBOX_DISABLED', m.address, { id: m.id, workspaceAccountsPaused });
  res.json({ ok: true, status: 'DISABLED', workspaceAccountsPaused });
});

/** Enable: a new password (generated, or typed by the super admin) is set and shown once. */
adminMailboxesRouter.post('/:id/enable', superOnly, passwordLimiter, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(z.object({ password: mailboxPassword.optional() }), req.body ?? {});
  assertUnprotected(m);
  if (!(await isDisabled(m.address))) throw conflict('MAILBOX_NOT_DISABLED');
  const generated = !body.password;
  const password = body.password ?? generatePassword();
  await viaStalwart(() => setMailboxPassword(cfg, m.id, password));
  await prisma.staffMailbox.deleteMany({ where: { address: m.address } });
  const workspaceAccountsUpdated = await reencryptWorkspaceAccounts(m.address, password);
  await setWorkspaceSync(m.address, true);
  await audit(req, 'MAILBOX_ENABLED', m.address, { id: m.id, generated, workspaceAccountsUpdated });
  res.json({ password, generated, workspaceAccountsUpdated, status: 'ACTIVE' });
});

adminMailboxesRouter.delete('/:id', superOnly, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const { confirmAddress } = parse(z.object({ confirmAddress: z.string().trim().toLowerCase().max(190) }), req.body ?? {});
  assertUnprotected(m);
  if (confirmAddress !== m.address) throw badRequest('CONFIRMATION_MISMATCH');
  await viaStalwart(() => deleteMailbox(cfg, m.id));
  await prisma.staffMailbox.deleteMany({ where: { address: m.address } });
  await audit(req, 'MAILBOX_DELETED', m.address, { id: m.id, usedBytes: m.usedBytes, aliases: m.aliases });
  res.json({ ok: true });
});

adminMailboxesRouter.get('/:id/auto-reply', async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  res.json({ autoReply: await viaStalwart(() => getAutoReply(cfg, m.id)) });
});

adminMailboxesRouter.put('/:id/auto-reply', superOnly, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(autoReplySchema, req.body);
  const autoReply = await viaStalwart(() => setAutoReply(cfg, m.id, body));
  await audit(req, 'MAILBOX_AUTOREPLY_UPDATED', m.address, { id: m.id, enabled: body.enabled, fromDate: body.fromDate, toDate: body.toDate });
  res.json({ autoReply });
});
