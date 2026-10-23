import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma, type ApplicationStatus, type Locale, type User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { badRequest, conflict, HttpError, notFound } from './http.js';
import { FINAL_STATUSES } from './caseFlow.js';
import { pickFreeName } from './drive/names.js';
import { syncCaseFolder } from './drive/caseFolders.js';
import { renderEmail, sendMail } from './mailer.js';
import { markClientsExcelDirty } from './clientsExcel.js';
import { orderedPair, scanUserDuplicates } from './duplicates/detect.js';

/**
 * One-click merge of two CLIENT accounts that belong to the same person (Admin → Dublikatlar).
 *
 * Everything runs in ONE transaction:
 *   1. Every foreign key to User (read from the Prisma schema at start-up, so relations added later are
 *      covered too) is repointed from the secondary to the primary: cases (→ register rows, settlements,
 *      originals, signatures of the case follow), documents, messages, notifications, bookings, reviews,
 *      tasks / assignees, chat, calendar, translations, arrival plans, vault, CV, motivation letters,
 *      surveys, signers, consents, privacy requests, agent referrals / commissions, AI conversations, …
 *      Unique conflicts (both accounts have the same row): join rows (grants, task assignees, chat members,
 *      favourites, reads, votes, attendees) of the secondary are dropped; one-per-user rows (CV, agent
 *      profile, partner login, staff workspace, mail accounts / labels) stay on the closed secondary.
 *   2. Special cases:
 *      - sessions, password-reset / verification / e-mail-OTP tokens of the secondary are deleted (no login);
 *      - audit log entries keep their actor (the secondary row stays as a closed stub, history is not rewritten);
 *      - vacancy applications for the same vacancy are combined: the more advanced status wins, notes are
 *        joined, interviews and the AI profile draft move to the kept application;
 *      - drive client folders (mode MERGE): the files of the secondary's case folders move into the primary's
 *        client folder; folders with the same name are merged, clashing names get " (2)"; emptied folders go
 *        to the recycle bin. Mode KEEP (default when both have active cases): every case keeps its folder,
 *        renamed after the primary client afterwards;
 *      - consent flags (WhatsApp / SMS): the newest explicit consent record of either account decides;
 *        without any record the opt-in is kept only when both accounts had it (never invented);
 *      - other duplicate pairs of the secondary: decisions are carried over to the primary, open ones are
 *        dropped (a fresh scan of the primary runs after the merge).
 *   3. Chosen profile values (A / B per field) are written to the primary.
 *   4. The secondary is closed: anonymised (e-mail merged+<id>@invalid, name "Merged account", contact and
 *      passport data cleared), disabled (isActive=false, random password) and mergedIntoId = primary, so old
 *      links resolve. A UserMerge row keeps the chosen fields, counts and a snapshot of every moved id
 *      (no unmerge: support traces moves manually), AuditLog USER_MERGED records the mapping.
 *
 * Rules: CLIENT accounts only (STAFF / ADMIN / SUPER_ADMIN → CANNOT_MERGE_STAFF, COMPANY → CANNOT_MERGE_COMPANY,
 * AGENT → CANNOT_MERGE_ROLE); never an already merged account (ALREADY_MERGED); both accounts with an active
 * case of the same visa type → 409 TWO_ACTIVE_CASES unless confirmed (the cases stay separate under one client).
 */

// ─── Profile fields the admin chooses per field ────────────────────────

export const MERGE_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'birthDate',
  'passportNumber',
  'passportExpiry',
  'nationality',
  'city',
  'address',
  'profession',
  'experienceYears',
  'germanLevel',
  'education',
  'drivingLicence',
  'about',
  'locale',
  'emailNotifications',
  'pushNotifications',
] as const satisfies readonly (keyof User)[];
export type MergeField = (typeof MERGE_FIELDS)[number];
export type FieldChoice = 'primary' | 'secondary';

/** Consent-backed flags (not chosen by the admin): consent log type per flag. */
const CONSENT_FLAGS = { whatsappOptIn: 'WHATSAPP', smsNotifications: 'SMS' } as const;

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

// ─── Relations to User, from the schema ────────────────────────────────

interface Rel {
  model: string;
  delegate: string;
  fk: string;
  /** Unique tuples that contain the foreign key (incl. a composite primary key). */
  uniques: string[][];
  /** How a row is addressed: ["id"] or the composite primary key. */
  key: string[];
}

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Relations handled by dedicated code (or deliberately left alone). */
const SPECIAL = new Set([
  'Session.userId', // deleted
  'PasswordResetToken.userId', // deleted
  'EmailVerificationToken.userId', // deleted
  'EmailOtpCode.userId', // deleted
  'AuditLog.actorId', // history keeps its actor
  'VacancyApplication.userId', // combined per vacancy
  'DuplicatePair.userAId', // carried over / dropped
  'DuplicatePair.userBId',
]);
const DELETE_WITH_SECONDARY = ['Session', 'PasswordResetToken', 'EmailVerificationToken', 'EmailOtpCode'] as const;
/** On a unique conflict these rows stay on the closed secondary instead of being dropped. */
const KEEP_ON_CONFLICT = new Set(['MailAccount', 'MailLabel', 'ConsultationSlot']);
/** User ids stored without a foreign key that still mean "this person". */
const SOFT_REFS: { model: string; fk: string }[] = [{ model: 'DocumentInsight', fk: 'uploadedById' }];

const buildRelations = (): Rel[] => {
  const models = Prisma.dmmf.datamodel.models;
  const out: Rel[] = [];
  const add = (m: (typeof models)[number], fk: string) => {
    const key = m.fields.some((f) => f.name === 'id') ? ['id'] : [...(m.primaryKey?.fields ?? [])];
    const uniques = [
      ...m.uniqueFields.map((u) => [...u]),
      ...(m.primaryKey ? [[...m.primaryKey.fields]] : []),
      ...m.fields.filter((f) => f.isUnique && f.name === fk).map((f) => [f.name]),
    ].filter((u) => u.includes(fk));
    out.push({ model: m.name, delegate: lcFirst(m.name), fk, uniques, key });
  };
  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || f.type !== 'User' || !f.relationFromFields?.length) continue;
      const fk = f.relationFromFields[0];
      if (SPECIAL.has(`${m.name}.${fk}`)) continue;
      add(m, fk);
    }
  }
  for (const s of SOFT_REFS) {
    const m = models.find((x) => x.name === s.model);
    if (m?.fields.some((f) => f.name === s.fk)) add(m, s.fk);
  }
  return out;
};

let relationsCache: Rel[] | null = null;
/** Every relation the generic repointing walks (exported for the tests and the admin "what moves" list). */
export const mergeRelations = () => (relationsCache ??= buildRelations());

type AnyDelegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  count: (args: unknown) => Promise<number>;
};
const delegateOf = (tx: Prisma.TransactionClient, name: string) => (tx as unknown as Record<string, AnyDelegate>)[name];

// ─── Loading and checks ────────────────────────────────────────────────

const STAFF_ROLES = new Set(['STAFF', 'ADMIN', 'SUPER_ADMIN']);

export const checkMergeable = (u: Pick<User, 'id' | 'role' | 'mergedIntoId'>) => {
  if (STAFF_ROLES.has(u.role)) throw badRequest('CANNOT_MERGE_STAFF');
  if (u.role === 'COMPANY') throw badRequest('CANNOT_MERGE_COMPANY');
  if (u.role !== 'CLIENT') throw badRequest('CANNOT_MERGE_ROLE');
  if (u.mergedIntoId) throw conflict('ALREADY_MERGED');
};

const loadPair = async (primaryId: string, secondaryId: string) => {
  if (primaryId === secondaryId) throw badRequest('SAME_ACCOUNT');
  const [p, s] = await Promise.all([prisma.user.findUnique({ where: { id: primaryId } }), prisma.user.findUnique({ where: { id: secondaryId } })]);
  if (!p || !s) throw notFound('USER_NOT_FOUND');
  checkMergeable(p);
  checkMergeable(s);
  return { p, s };
};

const activeCaseSelect = { id: true, number: true, visaType: true, status: true } as const;
/** Visa types in which both accounts have an active (not decided / cancelled) case. */
export const activeCaseClashes = async (aId: string, bId: string) => {
  const where = (clientId: string) => ({ clientId, status: { notIn: FINAL_STATUSES } });
  const [a, b] = await Promise.all([
    prisma.case.findMany({ where: where(aId), select: activeCaseSelect }),
    prisma.case.findMany({ where: where(bId), select: activeCaseSelect }),
  ]);
  const types = new Set(a.map((c) => c.visaType));
  return [...new Set(b.filter((c) => types.has(c.visaType)).map((c) => c.visaType))].map((visaType) => ({
    visaType,
    cases: [...a, ...b].filter((c) => c.visaType === visaType).map((c) => ({ id: c.id, number: c.number, status: c.status })),
  }));
};

// ─── Comparison (review screen) ────────────────────────────────────────

const profileSelect = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  createdAt: true,
  mergedIntoId: true,
  whatsappOptIn: true,
  smsNotifications: true,
  ...Object.fromEntries(MERGE_FIELDS.map((f) => [f, true])),
} as Prisma.UserSelect;

/** Profile, cases and activity of one account, for the side-by-side comparison. */
export const accountSummary = async (id: string) => {
  const user = (await prisma.user.findUnique({ where: { id }, select: profileSelect })) as (Pick<User, MergeField> & Pick<User, 'id' | 'role' | 'isActive' | 'emailVerifiedAt' | 'createdAt' | 'mergedIntoId' | 'whatsappOptIn' | 'smsNotifications'>) | null;
  if (!user) throw notFound('USER_NOT_FOUND');
  const [cases, documents, messages, applications, bookings, sessions] = await Promise.all([
    prisma.case.findMany({
      where: { clientId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, visaType: true, createdAt: true, parentCaseId: true, _count: { select: { documents: true } } },
    }),
    prisma.document.count({ where: { OR: [{ case: { clientId: id } }, { uploadedById: id }] } }),
    prisma.caseMessage.count({ where: { authorId: id } }),
    prisma.vacancyApplication.count({ where: { userId: id } }),
    prisma.booking.count({ where: { userId: id } }),
    prisma.session.aggregate({ where: { userId: id }, _max: { createdAt: true, lastSeenAt: true } }),
  ]);
  return {
    profile: user,
    cases: cases.map((c) => ({ id: c.id, number: c.number, status: c.status, visaType: c.visaType, createdAt: c.createdAt, family: !!c.parentCaseId, documents: c._count.documents, active: !FINAL_STATUSES.includes(c.status) })),
    counts: { cases: cases.length, activeCases: cases.filter((c) => !FINAL_STATUSES.includes(c.status)).length, documents, messages, applications, bookings },
    lastLoginAt: sessions._max.createdAt,
    lastSeenAt: sessions._max.lastSeenAt,
  };
};
type Summary = Awaited<ReturnType<typeof accountSummary>>;

/** Default primary: an active case first, then more activity, a verified e-mail, the recent login, the older account. */
export const activityScore = (s: Summary) =>
  s.counts.activeCases * 10_000 + s.counts.cases * 1_000 + s.counts.documents * 10 + s.counts.messages * 3 + s.counts.applications * 5 + s.counts.bookings * 5 + (s.profile.emailVerifiedAt ? 500 : 0) + (s.lastLoginAt ? 50 : 0);

export const suggestPrimary = (a: Summary, b: Summary) => {
  const sa = activityScore(a);
  const sb = activityScore(b);
  if (sa !== sb) return sa > sb ? a.profile.id : b.profile.id;
  return a.profile.createdAt <= b.profile.createdAt ? a.profile.id : b.profile.id;
};

/** Default choice per field: the primary's value unless it is empty and the secondary has one. */
export const defaultChoice = (p: Record<string, unknown>, s: Record<string, unknown>, f: MergeField): FieldChoice => (isEmpty(p[f]) && !isEmpty(s[f]) ? 'secondary' : 'primary');

export const mergePreview = async (aId: string, bId: string) => {
  if (aId === bId) throw badRequest('SAME_ACCOUNT');
  const [a, b] = await Promise.all([accountSummary(aId), accountSummary(bId)]);
  const suggestedPrimaryId = suggestPrimary(a, b);
  const conflicts = MERGE_FIELDS.filter((f) => !isEmpty(a.profile[f]) && !isEmpty(b.profile[f]) && !same(a.profile[f], b.profile[f]));
  let blocker: string | null = null;
  try {
    checkMergeable(a.profile);
    checkMergeable(b.profile);
  } catch (err) {
    blocker = err instanceof HttpError ? err.code : 'NOT_MERGEABLE';
  }
  const [x, y] = orderedPair(aId, bId);
  const pair = await prisma.duplicatePair.findUnique({ where: { userAId_userBId: { userAId: x, userBId: y } }, select: { id: true, score: true, reasons: true, status: true } });
  return { a, b, suggestedPrimaryId, conflicts, fields: MERGE_FIELDS, activeCaseClashes: await activeCaseClashes(aId, bId), blocker, pair };
};

// ─── Merge ─────────────────────────────────────────────────────────────

export interface MergeOptions {
  primaryId: string;
  secondaryId: string;
  fields?: Partial<Record<MergeField, FieldChoice>>;
  allowTwoActiveCases?: boolean;
  /** MERGE: secondary case folders' files into the primary's client folder; KEEP: every case keeps its folder. */
  driveFolders?: 'MERGE' | 'KEEP';
  informClient?: boolean;
  clientMessage?: string | null;
}

interface RelSnapshot {
  moved: string[];
  dropped: string[];
  kept: string[];
}

const APP_RANK: Record<ApplicationStatus, number> = { WITHDRAWN: 0, REJECTED: 0, NEW: 1, SHORTLISTED: 2, PROPOSED: 3, INTERVIEW: 4, ACCEPTED: 5 };
const joinNotes = (a: string | null, b: string | null) => {
  if (isEmpty(b) || a?.trim() === b?.trim()) return a;
  if (isEmpty(a)) return b;
  return `${a}\n---\n${b}`;
};

const lower = (s: string) => s.toLocaleLowerCase('en');

interface DriveLog {
  mode: 'MERGE' | 'KEEP';
  targetFolderId: string | null;
  moved: string[];
  renamed: { id: string; from: string; to: string }[];
  mergedFolders: string[];
  trashed: string[];
  keptCases: string[];
}

/** Moves the live content of `srcId` into `dstId`: same-named folders are merged, clashing names get " (2)". */
const mergeFolderInto = async (tx: Prisma.TransactionClient, srcId: string, dstId: string, actorId: string, at: Date, log: DriveLog) => {
  const [children, dstChildren] = await Promise.all([
    tx.driveNode.findMany({ where: { parentId: srcId, deletedAt: null }, select: { id: true, name: true, kind: true }, orderBy: { createdAt: 'asc' } }),
    tx.driveNode.findMany({ where: { parentId: dstId, deletedAt: null }, select: { id: true, name: true, kind: true } }),
  ]);
  const taken = new Set(dstChildren.map((n) => lower(n.name)));
  const folders = new Map(dstChildren.filter((n) => n.kind === 'FOLDER').map((n) => [lower(n.name), n.id]));
  for (const ch of children) {
    const sameFolder = ch.kind === 'FOLDER' ? folders.get(lower(ch.name)) : undefined;
    if (sameFolder) {
      await mergeFolderInto(tx, ch.id, sameFolder, actorId, at, log);
      await tx.driveNode.update({ where: { id: ch.id }, data: { deletedAt: at, deletedById: actorId } });
      log.mergedFolders.push(ch.id);
      log.trashed.push(ch.id);
      continue;
    }
    const name = pickFreeName(taken, ch.name, ch.kind === 'FILE');
    await tx.driveNode.update({ where: { id: ch.id }, data: { parentId: dstId, ...(name !== ch.name ? { name } : {}) } });
    log.moved.push(ch.id);
    if (name !== ch.name) log.renamed.push({ id: ch.id, from: ch.name, to: name });
  }
};

const liveFolderWhere = { deletedAt: null, kind: 'FOLDER', archivedAt: null } as const;

const MERGED_TEXT: Record<Locale, { subject: string; title: string; body: (email: string) => string }> = {
  az: {
    subject: 'Hesablarınız birləşdirildi',
    title: 'Hesablarınız birləşdirildi',
    body: (e) => `Triad Vision-dakı iki hesabınızı bir hesabda birləşdirdik. Bütün müraciətləriniz, sənədləriniz və mesajlarınız indi bu hesabdadır.\n\nBundan sonra ${e} ünvanı ilə daxil olun.`,
  },
  de: {
    subject: 'Ihre Konten wurden zusammengeführt',
    title: 'Ihre Konten wurden zusammengeführt',
    body: (e) => `Wir haben Ihre beiden Konten bei Triad Vision zu einem Konto zusammengeführt. Alle Ihre Anträge, Dokumente und Nachrichten finden Sie jetzt in diesem Konto.\n\nBitte melden Sie sich künftig mit ${e} an.`,
  },
  en: {
    subject: 'Your accounts have been combined',
    title: 'Your accounts have been combined',
    body: (e) => `We combined your two Triad Vision accounts into one. All your applications, documents and messages are now in this account.\n\nPlease sign in with ${e} from now on.`,
  },
  ru: {
    subject: 'Ваши аккаунты объединены',
    title: 'Ваши аккаунты объединены',
    body: (e) => `Мы объединили ваши два аккаунта в Triad Vision в один. Все ваши заявки, документы и сообщения теперь находятся в этом аккаунте.\n\nПожалуйста, входите в дальнейшем с адресом ${e}.`,
  },
};
export const mergeNoticeText = (locale: Locale, email: string) => {
  const t = MERGED_TEXT[locale] ?? MERGED_TEXT.az;
  return { subject: t.subject, title: t.title, body: t.body(email) };
};

/** Merges the secondary account into the primary one. See the header comment for every decision. */
export const mergeUsers = async (actorId: string, opts: MergeOptions, ip?: string | null) => {
  const { p, s } = await loadPair(opts.primaryId, opts.secondaryId);
  const clashes = await activeCaseClashes(p.id, s.id);
  if (clashes.length && !opts.allowTwoActiveCases) throw conflict('TWO_ACTIVE_CASES', clashes.map((c) => c.visaType).join(','));
  const driveMode = opts.driveFolders ?? (clashes.length ? 'KEEP' : 'MERGE');
  const P = p.id;
  const S = s.id;
  const at = new Date();
  const lockedPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 4);

  // Field choices → data for the primary.
  const pRec = p as unknown as Record<string, unknown>;
  const sRec = s as unknown as Record<string, unknown>;
  const fieldLog: Record<string, { kept: FieldChoice | 'consent'; before: unknown; after: unknown }> = {};
  const pData: Record<string, unknown> = {};
  for (const f of MERGE_FIELDS) {
    const choice = opts.fields?.[f] ?? defaultChoice(pRec, sRec, f);
    const value = choice === 'secondary' ? sRec[f] : pRec[f];
    if (f === 'firstName' || f === 'lastName' || f === 'email' || f === 'locale') {
      if (isEmpty(value)) continue; // required columns never become empty
    }
    fieldLog[f] = { kept: choice, before: pRec[f], after: value };
    if (!same(value, pRec[f])) pData[f] = value;
  }
  if (pData.email !== undefined) pData.emailVerifiedAt = s.emailVerifiedAt; // the verification follows the address
  if (!p.referredByAgentId && s.referredByAgentId) {
    pData.referredByAgentId = s.referredByAgentId;
    pData.referredAt = s.referredAt;
  }
  if (!p.companyId && s.companyId) pData.companyId = s.companyId;

  // Primary's own case folders, picked before the secondary's cases arrive (target of MERGE).
  const pCaseFolders = await prisma.case.findMany({
    where: { clientId: P, parentCaseId: null, driveFolderId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, driveFolderId: true },
  });

  const result = await prisma.$transaction(
    async (tx) => {
      const snapshot: Record<string, RelSnapshot> = {};
      const counts: Record<string, number> = {};
      const note = (rel: string, kind: keyof RelSnapshot, key: string) => {
        (snapshot[rel] ??= { moved: [], dropped: [], kept: [] })[kind].push(key);
        const c = kind === 'moved' ? rel : `${rel}:${kind}`;
        counts[c] = (counts[c] ?? 0) + 1;
      };

      // 1. Login artefacts of the secondary go away.
      for (const m of DELETE_WITH_SECONDARY) {
        const n = (await delegateOf(tx, lcFirst(m)).deleteMany({ where: { userId: S } })).count;
        if (n) counts[`${m}.userId:deleted`] = n;
      }

      // 2. Vacancy applications: one per vacancy and person.
      const apps = await tx.vacancyApplication.findMany({ where: { userId: S } });
      for (const a of apps) {
        const keep = await tx.vacancyApplication.findUnique({ where: { vacancyId_userId: { vacancyId: a.vacancyId, userId: P } } });
        if (!keep) {
          await tx.vacancyApplication.update({ where: { id: a.id }, data: { userId: P } });
          note('VacancyApplication.userId', 'moved', a.id);
          continue;
        }
        await tx.vacancyApplication.update({
          where: { id: keep.id },
          data: {
            status: APP_RANK[a.status] > APP_RANK[keep.status] ? a.status : keep.status,
            matchScore: Math.max(keep.matchScore ?? -1, a.matchScore ?? -1) >= 0 ? Math.max(keep.matchScore ?? 0, a.matchScore ?? 0) : null,
            message: joinNotes(keep.message, a.message),
            staffNote: joinNotes(keep.staffNote, a.staffNote),
            companyNote: joinNotes(keep.companyNote, a.companyNote),
          },
        });
        await tx.interview.updateMany({ where: { applicationId: a.id }, data: { applicationId: keep.id } });
        if (!(await tx.candidateProfileDraft.findUnique({ where: { applicationId: keep.id }, select: { id: true } }))) {
          await tx.candidateProfileDraft.updateMany({ where: { applicationId: a.id }, data: { applicationId: keep.id } });
        }
        await tx.vacancyApplication.delete({ where: { id: a.id } });
        note('VacancyApplication.userId', 'dropped', `${a.id}>${keep.id}`);
      }

      // 3. Every other relation: repoint, resolving unique conflicts.
      for (const rel of mergeRelations()) {
        const name = `${rel.model}.${rel.fk}`;
        const d = delegateOf(tx, rel.delegate);
        const fields = [...new Set([...rel.key, ...rel.uniques.flat()])];
        const rows = await d.findMany({ where: { [rel.fk]: S }, select: Object.fromEntries(fields.map((f) => [f, true])) });
        if (!rows.length) continue;
        const keyOf = (r: Record<string, unknown>) => rel.key.map((k) => String(r[k])).join(':');
        const whereOf = (r: Record<string, unknown>) => Object.fromEntries(rel.key.map((k) => [k, r[k]]));
        if (!rel.uniques.length) {
          await d.updateMany({ where: { [rel.fk]: S }, data: { [rel.fk]: P } });
          for (const r of rows) note(name, 'moved', keyOf(r));
          continue;
        }
        for (const r of rows) {
          let clash = false;
          for (const u of rel.uniques) {
            const where = Object.fromEntries(u.map((f) => [f, f === rel.fk ? P : r[f]]));
            if (Object.values(where).some((v) => v === null || v === undefined)) continue; // NULLs never clash
            if (await d.findFirst({ where, select: Object.fromEntries(rel.key.map((k) => [k, true])) })) {
              clash = true;
              break;
            }
          }
          if (!clash) {
            await d.updateMany({ where: whereOf(r), data: { [rel.fk]: P } });
            note(name, 'moved', keyOf(r));
          } else if (KEEP_ON_CONFLICT.has(rel.model) || rel.uniques.some((u) => u.length === 1)) {
            note(name, 'kept', keyOf(r)); // one per user: the primary's row wins, the secondary keeps its own
          } else {
            await d.deleteMany({ where: whereOf(r) });
            note(name, 'dropped', keyOf(r)); // the same join row exists on the primary
          }
        }
      }

      // 4. Drive client folders.
      const drive: DriveLog = { mode: driveMode, targetFolderId: null, moved: [], renamed: [], mergedFolders: [], trashed: [], keptCases: [] };
      const movedCases = (snapshot['Case.clientId']?.moved ?? []).filter(Boolean);
      const sCases = movedCases.length
        ? await tx.case.findMany({ where: { id: { in: movedCases } }, select: { id: true, parentCaseId: true, driveFolderId: true, _count: { select: { familyMembers: true } } } })
        : [];
      if (driveMode === 'MERGE' && sCases.length) {
        const candidates = pCaseFolders.map((c) => c.driveFolderId!);
        const live = new Set(
          (await tx.driveNode.findMany({ where: { id: { in: candidates }, ...liveFolderWhere }, select: { id: true } })).map((n) => n.id),
        );
        const target =
          pCaseFolders.find((c) => !FINAL_STATUSES.includes(c.status) && live.has(c.driveFolderId!)) ?? pCaseFolders.find((c) => live.has(c.driveFolderId!));
        drive.targetFolderId = target?.driveFolderId ?? null;
        for (const c of sCases) {
          // Family-member folders live inside the main applicant's folder; a main case with members keeps its folder.
          const folder = c.driveFolderId ? await tx.driveNode.findFirst({ where: { id: c.driveFolderId, ...liveFolderWhere }, select: { id: true } }) : null;
          if (!drive.targetFolderId || c.parentCaseId || c._count.familyMembers > 0 || !folder || folder.id === drive.targetFolderId) {
            drive.keptCases.push(c.id);
            continue;
          }
          await mergeFolderInto(tx, folder.id, drive.targetFolderId, actorId, at, drive);
          await tx.driveNode.update({ where: { id: folder.id }, data: { deletedAt: at, deletedById: actorId } });
          drive.trashed.push(folder.id);
          // The case gets a fresh folder the next time a document is copied (ensureCaseFolder).
          await tx.case.update({ where: { id: c.id }, data: { driveFolderId: null } });
        }
      } else {
        drive.keptCases.push(...sCases.map((c) => c.id));
      }

      // 5. Consent-backed flags: the newest explicit record decides; no record → opt-in only if both had it.
      for (const [flag, type] of Object.entries(CONSENT_FLAGS) as [keyof typeof CONSENT_FLAGS, string][]) {
        const latest = await tx.consentRecord.findFirst({ where: { userId: P, type }, orderBy: { createdAt: 'desc' }, select: { granted: true } });
        const value = latest ? latest.granted : p[flag] && s[flag];
        if (value !== p[flag]) pData[flag] = value;
        fieldLog[flag] = { kept: 'consent', before: p[flag], after: value };
      }

      // 6. Duplicate pairs: this one becomes MERGED; decisions of the secondary's other pairs move to the primary.
      const [x, y] = orderedPair(P, S);
      const pair = await tx.duplicatePair.upsert({
        where: { userAId_userBId: { userAId: x, userBId: y } },
        update: { status: 'MERGED', decidedById: actorId, decidedAt: at },
        create: { userAId: x, userBId: y, score: 0, reasons: [], status: 'MERGED', decidedById: actorId, decidedAt: at },
      });
      const others = await tx.duplicatePair.findMany({ where: { OR: [{ userAId: S }, { userBId: S }], id: { not: pair.id } } });
      for (const o of others) {
        const other = o.userAId === S ? o.userBId : o.userAId;
        const [na, nb] = orderedPair(P, other);
        const exists = other !== P && (await tx.duplicatePair.findUnique({ where: { userAId_userBId: { userAId: na, userBId: nb } }, select: { id: true } }));
        if (o.status === 'OPEN' || other === P || exists) await tx.duplicatePair.delete({ where: { id: o.id } });
        else await tx.duplicatePair.update({ where: { id: o.id }, data: { userAId: na, userBId: nb } });
      }

      // 7. Close the secondary (first: its e-mail may move to the primary), then write the primary.
      const before = {
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        birthDate: s.birthDate,
        passportNumber: s.passportNumber,
        city: s.city,
        createdAt: s.createdAt,
      };
      await tx.user.update({
        where: { id: S },
        data: {
          email: `merged+${S}@invalid`,
          passwordHash: lockedPassword,
          firstName: 'Merged',
          lastName: 'account',
          phone: null,
          birthDate: null,
          passportNumber: null,
          passportExpiry: null,
          nationality: null,
          city: null,
          address: null,
          profession: null,
          experienceYears: null,
          germanLevel: null,
          education: null,
          drivingLicence: null,
          about: null,
          isActive: false,
          emailVerifiedAt: null,
          totpSecret: null,
          totpEnabledAt: null,
          recoveryCodes: Prisma.DbNull,
          emailOtpEnabledAt: null,
          calendarToken: null,
          emailNotifications: false,
          pushNotifications: false,
          whatsappOptIn: false,
          smsNotifications: false,
          referredByAgentId: null,
          companyId: null,
          statusText: null,
          statusEmoji: null,
          mergedIntoId: P,
          mergedAt: at,
        },
      });
      if (Object.keys(pData).length) await tx.user.update({ where: { id: P }, data: pData as Prisma.UserUncheckedUpdateInput });

      const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
      const merge = await tx.userMerge.create({
        data: {
          primaryId: P,
          secondaryId: S,
          actorId,
          pairId: pair.id,
          fields: json(fieldLog),
          counts: json(counts),
          snapshot: json({ relations: snapshot, drive }),
          secondary: json(before),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'USER_MERGED',
          target: `user:${P}`,
          details: json({
            mergeId: merge.id,
            primaryId: P,
            secondaryId: S,
            secondaryEmail: s.email,
            counts,
            fields: Object.fromEntries(Object.entries(fieldLog).map(([k, v]) => [k, v.kept])),
            drive: { mode: drive.mode, moved: drive.moved.length, renamed: drive.renamed.length, trashed: drive.trashed.length },
            twoActiveCases: clashes.map((c) => c.visaType),
          }),
          ip: ip ?? null,
        },
      });
      return { mergeId: merge.id, counts, fields: fieldLog, drive };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  // After commit (never fail the merge): field history, folder names, re-scan, Excel, optional notice.
  const history = (prisma as unknown as { fieldChange?: { create: (a: unknown) => Promise<unknown> } }).fieldChange;
  if (history?.create) {
    await history
      .create({ data: { entity: 'USER', entityId: P, field: 'mergedFrom', oldValue: Prisma.JsonNull, newValue: { secondaryId: S, mergeId: result.mergeId }, actorId, source: 'admin' } })
      .catch((err) => console.error('[merge] field history not written', err));
  }
  for (const caseId of result.drive.keptCases) await syncCaseFolder(caseId);
  await scanUserDuplicates(P);
  markClientsExcelDirty();
  let informed = false;
  if (opts.informClient) {
    const u = await prisma.user.findUnique({ where: { id: P }, select: { email: true, locale: true } });
    if (u) {
      const t = mergeNoticeText(u.locale, u.email);
      const body = opts.clientMessage?.trim() || t.body;
      await sendMail(u.email, t.subject, renderEmail(t.title, body, { label: 'Triad Vision', url: `${config.clientUrl}/login` }));
      informed = true;
    }
  }
  return { ...result, primaryId: P, secondaryId: S, informed };
};

/** Follows mergedIntoId to the account that is alive now (old links of merged clients). */
export const resolveMergedUser = async (id: string) => {
  let current = id;
  for (let i = 0; i < 10; i++) {
    const u = await prisma.user.findUnique({ where: { id: current }, select: { mergedIntoId: true } });
    if (!u) return i === 0 ? null : current;
    if (!u.mergedIntoId) return current;
    current = u.mergedIntoId;
  }
  return current;
};
