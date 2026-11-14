import { Router, type Request } from 'express';
import { z } from 'zod';
import type { MailTemplate, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { badRequest, forbidden, notFound, parse } from '../../lib/http.js';
import { hasMinRole } from '../../middleware/auth.js';
import { LOCALES, VARIABLES, bodyOf, contextVars, fillVars, isLocale, normalizeShortcut, pickVariants, textToHtml } from '../../lib/cannedReplies.js';

/**
 * Canned replies ("/" picker in every staff composer) — mounted at /api/admin/canned-replies (STAFF+ via the admin router).
 * They are the mail templates (MailTemplate) with a plain-text body, shortcut and language, so the mail composer's
 * template menu and this picker share one list.
 *
 *   GET    /                          every reply I may use (mine + team), all language variants, for the manager
 *   GET    /picker?caseId|userId|inquiryId|liveChatId   best language variant per reply, variables filled
 *   POST   /                          { name, text, shortcut?, lang?, shared? }   team replies (shared) need ADMIN+
 *   PATCH  /:id                       personal: the author; team: ADMIN+
 *   DELETE /:id                       same rule
 */
export const adminCannedRepliesRouter = Router();

const uid = (req: Request) => req.user!.id;
const isAdmin = (req: Request) => hasMinRole(req.user!.role, 'ADMIN');

type Row = MailTemplate & { user: { firstName: string; lastName: string } | null };

const dto = (t: Row, req: Request) => ({
  id: t.id,
  name: t.name,
  shortcut: t.shortcut,
  lang: t.lang,
  shared: t.shared,
  body: bodyOf(t),
  /** Written in the mail settings (HTML template, no reply text of its own). */
  fromMail: t.text == null,
  mine: t.userId === uid(req),
  canEdit: t.shared ? isAdmin(req) : t.userId === uid(req),
  author: t.user ? `${t.user.firstName} ${t.user.lastName}`.trim() : null,
  updatedAt: t.updatedAt,
});

const visibleWhere = (req: Request): Prisma.MailTemplateWhereInput => ({ OR: [{ userId: uid(req) }, { shared: true }] });
const include = { user: { select: { firstName: true, lastName: true } } } as const;

adminCannedRepliesRouter.get('/', async (req, res) => {
  const rows = await prisma.mailTemplate.findMany({ where: visibleWhere(req), include, orderBy: [{ shared: 'desc' }, { shortcut: 'asc' }, { name: 'asc' }] });
  res.json({ replies: rows.map((r) => dto(r, req)), variables: VARIABLES, languages: LOCALES, canManageTeam: isAdmin(req) });
});

const ctxSchema = z.object({
  caseId: z.string().trim().min(1).max(40).optional(),
  userId: z.string().trim().min(1).max(40).optional(),
  inquiryId: z.string().trim().min(1).max(40).optional(),
  liveChatId: z.string().trim().min(1).max(40).optional(),
  lang: z.enum(['az', 'de', 'en', 'ru']).optional(),
});

adminCannedRepliesRouter.get('/picker', async (req, res) => {
  const q = parse(ctxSchema, req.query);
  const staff = req.user!;
  const { lang, vars } = await contextVars(q, { firstName: staff.firstName, lastName: staff.lastName, locale: isLocale(staff.locale) ? staff.locale : 'az' });
  const want = q.lang ?? lang;
  const rows = await prisma.mailTemplate.findMany({ where: visibleWhere(req), include, orderBy: [{ shared: 'asc' }, { name: 'asc' }] });
  const replies = pickVariants(rows, want).map((r) => {
    const body = bodyOf(r);
    return { id: r.id, name: r.name, shortcut: r.shortcut, lang: r.lang, shared: r.shared, mine: r.userId === uid(req), body, filled: fillVars(body, vars) };
  });
  // Mine first, then the team's; by shortcut / name inside each.
  replies.sort((a, b) => Number(b.mine) - Number(a.mine) || (a.shortcut ?? a.name).localeCompare(b.shortcut ?? b.name));
  res.json({ lang: want, vars, replies });
});

const inputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  text: z.string().trim().min(1).max(4000),
  shortcut: z.string().trim().max(60).nullable().optional(),
  lang: z.enum(['az', 'de', 'en', 'ru']).nullable().optional(),
  shared: z.boolean().optional(),
});

const shortcutOf = (v: string | null | undefined) => {
  if (v === undefined) return undefined;
  if (v === null || !v.trim()) return null;
  const s = normalizeShortcut(v);
  if (!s) throw badRequest('INVALID_SHORTCUT');
  return s;
};

/** One variant per (owner or team, shortcut, language): a second "/salam" in Azerbaijani would never be picked. */
const assertUniqueVariant = async (req: Request, v: { shortcut: string | null; lang: string | null; shared: boolean }, exceptId?: string) => {
  if (!v.shortcut) return;
  const clash = await prisma.mailTemplate.findFirst({
    where: { shortcut: v.shortcut, lang: v.lang, ...(v.shared ? { shared: true } : { shared: false, userId: uid(req) }), ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw badRequest('SHORTCUT_TAKEN');
};

adminCannedRepliesRouter.post('/', async (req, res) => {
  const body = parse(inputSchema, req.body);
  const shared = body.shared ?? false;
  if (shared && !isAdmin(req)) throw forbidden('TEAM_REPLIES_ADMIN_ONLY');
  const shortcut = shortcutOf(body.shortcut) ?? null;
  const lang = body.lang ?? null;
  await assertUniqueVariant(req, { shortcut, lang, shared });
  const t = await prisma.mailTemplate.create({ data: { userId: uid(req), name: body.name, text: body.text, html: textToHtml(body.text), shortcut, lang, shared }, include });
  if (shared) await audit(req, 'CANNED_REPLY_CREATED', t.id, { shortcut, lang });
  res.status(201).json({ reply: dto(t, req) });
});

const loadEditable = async (req: Request) => {
  const t = await prisma.mailTemplate.findUnique({ where: { id: String(req.params.id) }, include });
  if (!t || (!t.shared && t.userId !== uid(req))) throw notFound('CANNED_REPLY_NOT_FOUND');
  if (t.shared ? !isAdmin(req) : t.userId !== uid(req)) throw forbidden();
  return t;
};

adminCannedRepliesRouter.patch('/:id', async (req, res) => {
  const t = await loadEditable(req);
  const body = parse(inputSchema.partial(), req.body);
  if (body.shared !== undefined && body.shared !== t.shared && !isAdmin(req)) throw forbidden('TEAM_REPLIES_ADMIN_ONLY');
  const shortcut = shortcutOf(body.shortcut);
  const next = { shortcut: shortcut === undefined ? t.shortcut : shortcut, lang: body.lang === undefined ? t.lang : body.lang, shared: body.shared ?? t.shared };
  await assertUniqueVariant(req, next, t.id);
  const updated = await prisma.mailTemplate.update({
    where: { id: t.id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.text !== undefined ? { text: body.text, html: textToHtml(body.text) } : {}),
      shortcut: next.shortcut,
      lang: next.lang,
      shared: next.shared,
    },
    include,
  });
  if (t.shared || updated.shared) await audit(req, 'CANNED_REPLY_UPDATED', t.id, { fields: Object.keys(body) });
  res.json({ reply: dto(updated, req) });
});

adminCannedRepliesRouter.delete('/:id', async (req, res) => {
  const t = await loadEditable(req);
  await prisma.mailTemplate.delete({ where: { id: t.id } });
  if (t.shared) await audit(req, 'CANNED_REPLY_DELETED', t.id, { shortcut: t.shortcut });
  res.json({ ok: true });
});
