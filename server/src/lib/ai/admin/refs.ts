import { prisma } from '../../../db.js';
import { HttpError, badRequest, notFound } from '../../http.js';
import { nameScore } from '../../settlement/parse.js';
import type { AiToolContext } from '../types.js';
import { foldName, looksLikeId, pathsOf, resolveNodeRef } from './paths.js';

/** Resolving what the model names (ids, paths, case numbers, partner / staff names) to rows. */

/** Node ref → id; a missing ref falls back to the selected node / current folder of the chat. */
export const nodeIdOf = async (ref: string | null | undefined, ctx: AiToolContext, fallback: 'node' | 'folder' | 'nodeOrFolder' = 'nodeOrFolder') => {
  if (ref && ref.trim()) return resolveNodeRef(ref, ctx);
  const c = ctx.context ?? {};
  const id = fallback === 'node' ? c.nodeId : fallback === 'folder' ? c.folderId : (c.nodeId ?? c.folderId);
  if (!id) throw badRequest('NODE_REQUIRED');
  return id;
};

export const nodeIdsOf = async (refs: string[], ctx: AiToolContext) => {
  const out: string[] = [];
  for (const r of refs) out.push(await resolveNodeRef(r, ctx));
  return [...new Set(out)];
};

/** Best-effort labels of node refs for confirm cards ("Partner/İlqar/x.pdf"); unknown refs stay as typed. */
export const labelRefs = async (refs: (string | null | undefined)[], ctx: AiToolContext) => {
  const ids: (string | null)[] = [];
  for (const r of refs) {
    try {
      ids.push(r ? await resolveNodeRef(r, ctx) : null);
    } catch {
      ids.push(null);
    }
  }
  const paths = await pathsOf(ids.filter((x): x is string => !!x));
  return refs.map((r, i) => {
    const p = ids[i] ? paths.get(ids[i]!) : null;
    return p ? p.replace(/^Gemeinsame Dokumente\/?/, '') || 'Gemeinsame Dokumente' : (r ?? '?');
  });
};

/** Case by id, number ("TV-2026-0012") or a unique client name / passport number. */
export const caseIdOf = async (ref: string | null | undefined, ctx?: AiToolContext) => {
  const r = (ref ?? '').trim() || ctx?.context?.caseId || '';
  if (!r) throw badRequest('CASE_REQUIRED');
  if (looksLikeId(r)) {
    const c = await prisma.case.findUnique({ where: { id: r }, select: { id: true } });
    if (c) return c.id;
  }
  const byNumber = await prisma.case.findFirst({ where: { number: r }, select: { id: true } });
  if (byNumber) return byNumber.id;
  const hits = await findCases(r, 5);
  if (hits.length === 1) return hits[0].id;
  if (!hits.length) throw notFound('CASE_NOT_FOUND');
  throw new HttpError(409, 'AMBIGUOUS_CASE', `AMBIGUOUS_CASE: ${hits.map((h) => `${h.number} ${h.client}`).join(' | ')}`);
};

/** Cases matching a client name (accent-insensitive, any word order), passport or case number. */
export const findCases = async (q: string, limit = 20) => {
  const text = q.trim();
  const words = text.split(/\s+/).filter((w) => w.length >= 2).slice(0, 4);
  const direct = await prisma.case.findMany({
    where: {
      OR: [
        { number: { contains: text } },
        { client: { passportNumber: { contains: text } } },
        { client: { email: { contains: text } } },
        ...(words.length ? [{ AND: words.map((w) => ({ OR: [{ client: { firstName: { contains: w } } }, { client: { lastName: { contains: w } } }] })) }] : []),
      ],
    },
    select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  let rows = direct;
  if (!rows.length && words.length) {
    // MySQL collation ignores most accents but not ə / ı: fold both sides in memory.
    const fw = words.map(foldName);
    const all = await prisma.case.findMany({ select: { id: true, number: true, client: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 5000 });
    rows = all.filter((c) => {
      const name = foldName(`${c.client.firstName} ${c.client.lastName}`);
      return fw.every((w) => name.includes(w));
    }).slice(0, limit);
  }
  return rows.map((c) => ({ id: c.id, number: c.number, client: `${c.client.firstName} ${c.client.lastName}`.trim() }));
};

/** Partner by id or name (accent-insensitive, unique prefix allowed). */
export const partnerIdOf = async (ref: string) => {
  const r = ref.trim();
  if (!r) throw badRequest('PARTNER_REQUIRED');
  const partners = await prisma.referralPartner.findMany({ select: { id: true, name: true } });
  const byId = partners.find((p) => p.id === r);
  if (byId) return byId;
  const f = foldName(r);
  const exact = partners.filter((p) => foldName(p.name) === f);
  if (exact.length === 1) return exact[0];
  const pre = partners.filter((p) => foldName(p.name).startsWith(f) || foldName(p.name).split(' ').some((w) => w === f));
  if (pre.length === 1) return pre[0];
  if (!pre.length && !exact.length) {
    // Latin transliteration ("Envar" for "Ənvər", "Ilgar" for "İlqar").
    const t = partners.filter((p) => nameScore(r, p.name) >= 0.8);
    if (t.length === 1) return t[0];
    if (t.length > 1) throw new HttpError(409, 'AMBIGUOUS_PARTNER', `AMBIGUOUS_PARTNER: ${t.map((p) => p.name).join(' | ')}`);
    throw notFound('PARTNER_NOT_FOUND');
  }
  throw new HttpError(409, 'AMBIGUOUS_PARTNER', `AMBIGUOUS_PARTNER: ${[...exact, ...pre].map((p) => p.name).join(' | ')}`);
};

/** Staff member by id, e-mail or name. */
export const staffIdOf = async (ref: string) => {
  const r = ref.trim();
  const staff = await prisma.user.findMany({ where: { role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true, firstName: true, lastName: true, email: true } });
  const hit = staff.find((s) => s.id === r || s.email.toLowerCase() === r.toLowerCase());
  if (hit) return hit;
  const f = foldName(r);
  const m = staff.filter((s) => foldName(`${s.firstName} ${s.lastName}`) === f || foldName(s.firstName) === f);
  if (m.length === 1) return m[0];
  if (!m.length) throw notFound('STAFF_NOT_FOUND');
  throw new HttpError(409, 'AMBIGUOUS_STAFF', `AMBIGUOUS_STAFF: ${m.map((s) => `${s.firstName} ${s.lastName}`).join(' | ')}`);
};
