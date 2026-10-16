import { Router, type Request } from 'express';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict, limiter, notFound, parse } from '../../lib/http.js';
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
  generatePassword,
  linkedUsers,
  localPartSchema,
  mailboxPassword,
  protectionOf,
  reencryptWorkspaceAccounts,
  requireStalwart,
  viaStalwart,
} from '../../lib/stalwart/service.js';

/**
 * /api/admin/mailboxes (ADMIN+): our own @domain mailboxes on the Stalwart mail server.
 * Passwords are returned exactly once (in the create / reset response) and never stored or logged
 * here; workspace mail accounts that use the mailbox get the new password re-encrypted.
 */
export const adminMailboxesRouter = Router();

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

const linkedFor = async (list: Mailbox[]) => {
  const { byEmail, workspace } = await linkedUsers(list.map((m) => m.address));
  return (m: Mailbox) => {
    const u = byEmail.get(m.address);
    const ws = workspace.get(m.address) ?? [];
    const dto = (x: { id: string; email: string; firstName: string; lastName: string; role: string }) => ({ id: x.id, email: x.email, name: `${x.firstName} ${x.lastName}`.trim(), role: x.role });
    return { linkedUser: u ? dto(u) : null, workspaceUsers: ws.map(dto) };
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
    ...extra,
  };
};

const load = async (id: string) => {
  const cfg = requireStalwart();
  const m = await viaStalwart(() => getMailbox(cfg, id));
  if (!m) throw notFound('MAILBOX_NOT_FOUND');
  return { cfg, m };
};

adminMailboxesRouter.get('/', async (_req, res) => {
  const settings = { domain: stalwartDomain(), ...clientSettings() };
  const cfg = stalwartConfig();
  if (!cfg) {
    res.json({ configured: false, ...settings, mailboxes: [] });
    return;
  }
  const list = await viaStalwart(() => listMailboxes(cfg));
  const links = await linkedFor(list);
  res.json({ configured: true, ...settings, mailboxes: list.map((m) => dto(m, links(m))) });
});

const createSchema = z.object({
  localPart: localPartSchema,
  displayName: z.string().trim().max(120).nullable().optional(),
  password: mailboxPassword.optional(),
  quotaMb: quotaMb.optional(),
  aliases: aliasesSchema.optional(),
});

adminMailboxesRouter.post('/', passwordLimiter, async (req, res) => {
  const cfg = requireStalwart();
  const body = parse(createSchema, req.body);
  if (body.aliases?.includes(body.localPart)) throw badRequest('ALIAS_SAME_AS_ADDRESS');
  const generated = !body.password;
  const password = body.password ?? generatePassword();
  const m = await viaStalwart(() =>
    createMailbox(cfg, {
      localPart: body.localPart,
      displayName: body.displayName || null,
      password,
      quotaBytes: body.quotaMb ? body.quotaMb * MB : null,
      aliases: body.aliases ?? [],
    }),
  );
  await audit(req, 'MAILBOX_CREATED', m.address, { id: m.id, quotaMb: body.quotaMb ?? null, aliases: m.aliases, generatedPassword: generated });
  const links = await linkedFor([m]);
  // The only time the password leaves the server: the admin hands it to the mailbox owner.
  res.status(201).json({ mailbox: dto(m, links(m)), password, generated, settings: clientSettings() });
});

const updateSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  quotaMb: quotaMb.optional(),
  aliases: aliasesSchema.optional(),
});

adminMailboxesRouter.patch('/:id', async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(updateSchema, req.body);
  if (body.aliases?.includes(m.localPart)) throw badRequest('ALIAS_SAME_AS_ADDRESS');
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

adminMailboxesRouter.post('/:id/password', passwordLimiter, async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(z.object({ password: mailboxPassword.optional() }), req.body ?? {});
  const p = protectionOf(m);
  // The website sends with this mailbox: a new password would silently stop all outgoing mail.
  if (p === 'SITE_SENDER') throw conflict('SITE_SENDER_PROTECTED');
  if (p === 'MAIL_ADMIN') throw conflict('MAIL_ADMIN_PROTECTED');
  const generated = !body.password;
  const password = body.password ?? generatePassword();
  await viaStalwart(() => setMailboxPassword(cfg, m.id, password));
  const workspaceAccountsUpdated = await reencryptWorkspaceAccounts(m.address, password);
  await audit(req, 'MAILBOX_PASSWORD_RESET', m.address, { id: m.id, generated, workspaceAccountsUpdated });
  res.json({ password, generated, workspaceAccountsUpdated });
});

adminMailboxesRouter.delete('/:id', async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const { confirmAddress } = parse(z.object({ confirmAddress: z.string().trim().toLowerCase().max(190) }), req.body ?? {});
  const p = protectionOf(m);
  if (p === 'SITE_SENDER') throw conflict('SITE_SENDER_PROTECTED');
  if (p === 'MAIL_ADMIN') throw conflict('MAIL_ADMIN_PROTECTED');
  if (confirmAddress !== m.address) throw badRequest('CONFIRMATION_MISMATCH');
  await viaStalwart(() => deleteMailbox(cfg, m.id));
  await audit(req, 'MAILBOX_DELETED', m.address, { id: m.id, usedBytes: m.usedBytes, aliases: m.aliases });
  res.json({ ok: true });
});

adminMailboxesRouter.get('/:id/auto-reply', async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  res.json({ autoReply: await viaStalwart(() => getAutoReply(cfg, m.id)) });
});

adminMailboxesRouter.put('/:id/auto-reply', async (req, res) => {
  const { cfg, m } = await load(parse(idParam, req.params.id));
  const body = parse(autoReplySchema, req.body);
  const autoReply = await viaStalwart(() => setAutoReply(cfg, m.id, body));
  await audit(req, 'MAILBOX_AUTOREPLY_UPDATED', m.address, { id: m.id, enabled: body.enabled, fromDate: body.fromDate, toDate: body.toDate });
  res.json({ autoReply });
});

