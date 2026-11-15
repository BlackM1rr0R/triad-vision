import { Prisma, VisaType, type Locale, type RuleChange } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { FINAL_STATUSES } from '../caseFlow.js';
import { conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { segmentWhere } from '../campaigns/segments.js';
import { RULE_CHANGE_TEXT } from './texts.js';

/**
 * Rule-change notices: staff write what changed (law, embassy practice …) with texts per language (az
 * required), the affected visa types, effective date and the official source. Preview = number of affected
 * clients; publishing (ADMIN+) gives every CLIENT with an ACTIVE case of one of those visa types an in-portal
 * notification and an e-mail (notifyUser: e-mail / push follow the client's notification preferences) and
 * lists the change under "Qayda dəyişiklikləri" in the portal. A published change is frozen (history).
 */

const text = (max: number) => z.string().trim().max(max);
const l10n = (max: number) =>
  z.object({ az: text(max).min(1), de: text(max).optional(), en: text(max).optional(), ru: text(max).optional() });

export const ruleChangeInput = z.object({
  title: l10n(200),
  body: l10n(5000),
  visaTypes: z.array(z.nativeEnum(VisaType)).min(1).max(7),
  effectiveDate: z.coerce.date().nullish(),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https:\/\//i.test(u), 'HTTPS_REQUIRED')
    .nullish(),
});
export type RuleChangeInput = z.infer<typeof ruleChangeInput>;

type L10n = Partial<Record<Locale, string>>;
/** The text in `locale`, else Azerbaijani (always present). */
export const localized = (v: Prisma.JsonValue | unknown, locale: Locale) => {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as L10n;
  return (o[locale] && o[locale]!.trim()) || o.az || '';
};

const visaTypesOf = (v: Prisma.JsonValue): VisaType[] => (Array.isArray(v) ? v.filter((x): x is VisaType => typeof x === 'string' && x in VisaType) : []);

/**
 * Recipients: active CLIENT accounts (campaign segment base, lib/campaigns/segments.ts) with an open case of
 * one of the visa types — the visa type and "open" checked on the SAME case.
 */
export const ruleChangeAudience = (visaTypes: VisaType[]): Prisma.UserWhereInput => ({
  AND: [
    segmentWhere({ op: 'AND', groups: [{ op: 'AND', conditions: [{ field: 'role', values: ['CLIENT'] }, { field: 'visaType', values: visaTypes }, { field: 'caseState', value: 'ACTIVE' }] }] }),
    { cases: { some: { visaType: { in: visaTypes }, status: { notIn: FINAL_STATUSES } } } },
  ],
});

export const previewAudience = async (visaTypes: VisaType[]) => {
  const where = ruleChangeAudience(visaTypes);
  const [count, email] = await Promise.all([prisma.user.count({ where }), prisma.user.count({ where: { AND: [where, { emailNotifications: true }] } })]);
  return { count, email };
};

export const ruleChangeDto = (r: RuleChange) => ({
  id: r.id,
  title: r.title as L10n,
  body: r.body as L10n,
  visaTypes: visaTypesOf(r.visaTypes),
  effectiveDate: r.effectiveDate,
  sourceUrl: r.sourceUrl,
  status: r.status,
  createdById: r.createdById,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  publishedAt: r.publishedAt,
  publishedById: r.publishedById,
  recipientCount: r.recipientCount,
  emailCount: r.emailCount,
});

const dataOf = (b: RuleChangeInput) => ({
  title: b.title as Prisma.InputJsonValue,
  body: b.body as Prisma.InputJsonValue,
  visaTypes: b.visaTypes as Prisma.InputJsonValue,
  effectiveDate: b.effectiveDate ?? null,
  sourceUrl: b.sourceUrl || null,
});

export const listRuleChanges = async () => (await prisma.ruleChange.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200 })).map(ruleChangeDto);

export const createRuleChange = async (b: RuleChangeInput, actorId: string) => ruleChangeDto(await prisma.ruleChange.create({ data: { ...dataOf(b), createdById: actorId } }));

const loadDraft = async (id: string) => {
  const r = await prisma.ruleChange.findUnique({ where: { id } });
  if (!r) throw notFound('RULE_CHANGE_NOT_FOUND');
  if (r.status !== 'DRAFT') throw conflict('RULE_CHANGE_PUBLISHED');
  return r;
};

export const updateRuleChange = async (id: string, b: RuleChangeInput) => {
  await loadDraft(id);
  return ruleChangeDto(await prisma.ruleChange.update({ where: { id }, data: dataOf(b) }));
};

export const deleteRuleChange = async (id: string) => {
  await loadDraft(id);
  await prisma.ruleChange.delete({ where: { id } });
};

const fmtDay = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale], { dateStyle: 'long', timeZone: 'Asia/Baku' }).format(d);

/** Publishes a draft once (concurrent publishes: one wins, the other gets 409) and notifies every recipient. */
export const publishRuleChange = async (id: string, actorId: string, now = new Date()) => {
  const draft = await loadDraft(id);
  const claimed = await prisma.ruleChange.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED', publishedAt: now, publishedById: actorId } });
  if (claimed.count !== 1) throw conflict('RULE_CHANGE_PUBLISHED');
  const visaTypes = visaTypesOf(draft.visaTypes);
  const users = await prisma.user.findMany({ where: ruleChangeAudience(visaTypes), select: { id: true, locale: true, emailNotifications: true } });
  if (users.length) await prisma.ruleChangeRecipient.createMany({ data: users.map((u) => ({ ruleChangeId: id, userId: u.id, emailed: u.emailNotifications !== false })), skipDuplicates: true });
  for (const u of users) {
    const t = RULE_CHANGE_TEXT[u.locale] ?? RULE_CHANGE_TEXT.az;
    const title = localized(draft.title, u.locale);
    const parts = [
      localized(draft.body, u.locale),
      draft.effectiveDate ? t.effective(fmtDay(draft.effectiveDate, u.locale)) : '',
      draft.sourceUrl ? t.source(draft.sourceUrl) : '',
    ].filter(Boolean);
    await notifyUser(u.id, { type: 'RULE_CHANGE', title: `${t.prefix}: ${title}`, body: parts.join('\n\n'), link: '/account/rule-changes', ctaLabel: t.cta });
  }
  const emailCount = users.filter((u) => u.emailNotifications !== false).length;
  const row = await prisma.ruleChange.update({ where: { id }, data: { recipientCount: users.length, emailCount } });
  return ruleChangeDto(row);
};

/** The client's "Qayda dəyişiklikləri" list, in their language. */
export const clientRuleChanges = async (userId: string, locale: Locale) => {
  const rec = await prisma.ruleChangeRecipient.findMany({ where: { userId }, select: { ruleChangeId: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 100 });
  if (!rec.length) return [];
  const rows = await prisma.ruleChange.findMany({ where: { id: { in: rec.map((r) => r.ruleChangeId) }, status: 'PUBLISHED' } });
  return rows
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .map((r) => ({
      id: r.id,
      title: localized(r.title, locale),
      body: localized(r.body, locale),
      visaTypes: visaTypesOf(r.visaTypes),
      effectiveDate: r.effectiveDate,
      sourceUrl: r.sourceUrl,
      publishedAt: r.publishedAt,
    }));
};
