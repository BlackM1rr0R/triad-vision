import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireMinRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, forbidden, limiter, parse } from '../lib/http.js';
import { changeOwnPassword, getAutoReply, listMailboxes, setAutoReply, type Mailbox } from '../lib/stalwart/client.js';
import { clientSettings, stalwartConfig, stalwartDomain } from '../lib/stalwart/config.js';
import { autoReplySchema, mailboxPassword, ownMailboxAddresses, protectionOf, reencryptWorkspaceAccounts, requireStalwart, viaStalwart } from '../lib/stalwart/service.js';

/**
 * /api/mailbox (STAFF+): self-service for the staff member's own @domain mailboxes — the one that is
 * their login email, or one they connected in workspace mail. Change the mailbox password (the
 * current one is required and checked by the mail server itself) and edit the auto-reply.
 */
export const mailboxRouter = Router();
mailboxRouter.use(requireMinRole('STAFF'));

const userKey = (req: Request) => `u:${req.user?.id ?? req.ip}`;
// Every wrong current password is a failed login on the mail server, which bans IPs after too many.
const passwordLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 5, keyGenerator: userKey });

const address = z.string().trim().toLowerCase().email().max(190);

const mine = async (req: Request): Promise<{ list: Mailbox[]; addresses: string[] }> => {
  const cfg = requireStalwart();
  const addresses = await ownMailboxAddresses(req.user!.id, req.user!.email);
  if (!addresses.length) return { list: [], addresses };
  const all = await viaStalwart(() => listMailboxes(cfg));
  return { list: all.filter((m) => addresses.includes(m.address)), addresses };
};

const ownOne = async (req: Request, addr: string) => {
  const { list } = await mine(req);
  const m = list.find((x) => x.address === addr);
  if (!m) throw forbidden('NOT_YOUR_MAILBOX');
  return m;
};

mailboxRouter.get('/me', async (req, res) => {
  const base = { domain: stalwartDomain(), ...clientSettings() };
  if (!stalwartConfig()) {
    res.json({ configured: false, ...base, mailboxes: [] });
    return;
  }
  const { list } = await mine(req);
  res.json({
    configured: true,
    ...base,
    mailboxes: list.map((m) => ({ id: m.id, address: m.address, displayName: m.displayName, usedBytes: m.usedBytes, quotaBytes: m.quotaBytes, canChangePassword: protectionOf(m) !== 'SITE_SENDER' })),
  });
});

const changeSchema = z.object({
  address,
  currentPassword: z.string().min(1).max(256),
  newPassword: mailboxPassword,
});

mailboxRouter.post('/me/password', passwordLimiter, async (req, res) => {
  const cfg = requireStalwart();
  const body = parse(changeSchema, req.body);
  if (body.newPassword === body.currentPassword) throw badRequest('PASSWORD_UNCHANGED');
  const m = await ownOne(req, body.address);
  if (protectionOf(m) === 'SITE_SENDER') throw conflict('SITE_SENDER_PROTECTED');
  try {
    await viaStalwart(() => changeOwnPassword(cfg, m.address, body.currentPassword, body.newPassword));
  } catch (err) {
    if ((err as { code?: string }).code === 'MAILBOX_PASSWORD_WRONG') await audit(req, 'MAILBOX_PASSWORD_CHANGE_FAILED', m.address, { reason: 'WRONG_CURRENT_PASSWORD' });
    throw err;
  }
  const workspaceAccountsUpdated = await reencryptWorkspaceAccounts(m.address, body.newPassword);
  await audit(req, 'MAILBOX_PASSWORD_CHANGED', m.address, { id: m.id, self: true, workspaceAccountsUpdated });
  res.json({ ok: true, workspaceAccountsUpdated });
});

mailboxRouter.get('/me/auto-reply', async (req, res) => {
  const cfg = requireStalwart();
  const m = await ownOne(req, parse(z.object({ address }), req.query).address);
  res.json({ autoReply: await viaStalwart(() => getAutoReply(cfg, m.id)) });
});

mailboxRouter.put('/me/auto-reply', async (req, res) => {
  const cfg = requireStalwart();
  const { address: addr, ...rest } = parse(z.object({ address }).passthrough(), req.body);
  const body = parse(autoReplySchema, rest);
  const m = await ownOne(req, addr);
  const autoReply = await viaStalwart(() => setAutoReply(cfg, m.id, body));
  await audit(req, 'MAILBOX_AUTOREPLY_UPDATED', m.address, { id: m.id, self: true, enabled: body.enabled, fromDate: body.fromDate, toDate: body.toDate });
  res.json({ autoReply });
});
