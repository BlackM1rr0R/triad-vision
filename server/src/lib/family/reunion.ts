import fs from 'node:fs/promises';
import path from 'node:path';
import type { CaseStatus, Document, Locale, Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { copyDocumentToDrive } from '../drive/caseFolders.js';
import { createRequirements } from '../docsIntel/requirementTemplates.js';
import { ensureProfile } from './members.js';
import { reunionTexts } from './reunionTexts.js';
import type { FamilyRelationKey } from './requirements.js';

/**
 * Familiennachzug flow on top of the member sub-cases (lib/family/members.ts):
 *
 * 1. "Start family reunion" on the main case (staff), available once the main case is APPROVED or the main
 *    applicant has arrived (arrival plan COMPLETED). Every member with joinsWhen LATER whose case is not active
 *    yet (still DOCUMENTS_PENDING and never started, or REJECTED / CANCELLED) is (re)opened as a family case:
 *    visa type FAMILY, status DOCUMENTS_PENDING, the relation's requirement list when it has none, a
 *    FAMILY_REUNION_STARTED event (the "started" marker — a second start skips it) and the client is notified.
 * 2. Reusable documents of the main case (marriage / birth certificates, the main applicant's passport,
 *    visa / residence title, employment contract, salary slips, housing proof) are copied into the member
 *    cases: the ACCEPTED Document gets a twin in the member case that points to the same bytes (hard link,
 *    a byte copy only when the file system refuses links), ACCEPTED, in the matching requirement (created
 *    when the member's list has none). The stored name is derived from (member case, source document), so
 *    a copy is never made twice. FamilyMember.docsCopiedAt + a CaseEvent record it. Runs on start, when a
 *    member is added (journey/family.ts addFamilyMember) and from the staff button.
 */

type L10n = { az: string; de: string; en: string; ru: string };

export interface ReusableDoc {
  /** Requirement key in the member case. */
  target: string;
  /** Requirement keys of the main case whose accepted documents are copied. */
  sources: string[];
  /** Also every accepted document of stage VISA (the visa / residence title uploaded by staff). */
  visaStage?: boolean;
  relations: FamilyRelationKey[] | 'all';
  /** Copy every accepted document (salary slips of several months), not only the latest. */
  multi?: boolean;
  title: L10n;
}

export const REUSABLE_DOCS: ReusableDoc[] = [
  { target: 'MARRIAGE_CERT', sources: ['MARRIAGE_CERT'], relations: ['spouse'], title: { az: 'Nikah şəhadətnaməsi (apostil + tərcümə)', de: 'Heiratsurkunde (mit Apostille und Übersetzung)', en: 'Marriage certificate (apostille + translation)', ru: 'Свидетельство о браке (апостиль + перевод)' } },
  { target: 'BIRTH_CERT', sources: ['CHILD_BIRTH_CERT', 'CHILDREN_BIRTH_CERTS'], relations: ['child'], multi: true, title: { az: 'Doğum şəhadətnaməsi (apostil + tərcümə)', de: 'Geburtsurkunde (mit Apostille und Übersetzung)', en: 'Birth certificate (apostille + translation)', ru: 'Свидетельство о рождении (апостиль + перевод)' } },
  // A parent joining: the main applicant's own birth certificate proves the relationship.
  { target: 'RELATIONSHIP_PROOF', sources: ['BIRTH_CERT'], relations: ['parent'], title: { az: 'Qohumluq sübutu (apostil + tərcümə)', de: 'Nachweis des Verwandtschaftsverhältnisses (Apostille + Übersetzung)', en: 'Proof of relationship (apostille + translation)', ru: 'Подтверждение родства (апостиль + перевод)' } },
  { target: 'SPONSOR_PASSPORT', sources: ['PASSPORT'], relations: 'all', title: { az: 'Əsas müraciətçinin pasportu (surət)', de: 'Reisepass der Bezugsperson (Kopie)', en: "Main applicant's passport (copy)", ru: 'Паспорт основного заявителя (копия)' } },
  { target: 'SPONSOR_RESIDENCE_TITLE', sources: ['RESIDENCE_TITLE', 'VISA'], visaStage: true, relations: 'all', title: { az: 'Əsas müraciətçinin vizası / yaşayış icazəsi', de: 'Visum / Aufenthaltstitel der Bezugsperson', en: "Main applicant's visa / residence permit", ru: 'Виза / вид на жительство основного заявителя' } },
  { target: 'SPONSOR_CONTRACT', sources: ['SIGNED_CONTRACT', 'EMPLOYMENT_CONTRACT'], relations: 'all', title: { az: 'Əsas müraciətçinin əmək müqaviləsi', de: 'Arbeitsvertrag der Bezugsperson', en: "Main applicant's employment contract", ru: 'Трудовой договор основного заявителя' } },
  { target: 'SPONSOR_SALARY', sources: ['SALARY_SLIPS', 'PAYSLIPS', 'SALARY'], relations: 'all', multi: true, title: { az: 'Əsas müraciətçinin maaş arayışları', de: 'Gehaltsabrechnungen der Bezugsperson', en: "Main applicant's salary slips", ru: 'Расчётные листы основного заявителя' } },
  { target: 'ACCOMMODATION', sources: ['ACCOMMODATION', 'RENTAL_CONTRACT', 'HOUSING'], relations: 'all', title: { az: 'Kifayət qədər yaşayış sahəsi sübutu', de: 'Nachweis über ausreichenden Wohnraum', en: 'Proof of sufficient housing', ru: 'Подтверждение жилья' } },
];

export const REUNION_EVENT = 'FAMILY_REUNION_STARTED';
const COPY_EVENT = 'FAMILY_DOCS_COPIED';
/** Member cases in these statuses are not active and may be (re)started. */
const STARTABLE: CaseStatus[] = ['DOCUMENTS_PENDING', 'REJECTED', 'CANCELLED'];

const relationKey = (r: string | null | undefined): FamilyRelationKey => (r === 'child' || r === 'parent' || r === 'other' ? r : 'spouse');
const copyName = (memberCaseId: string, source: Pick<Document, 'id' | 'storedName'>) => `fam-${memberCaseId}-${source.id}${path.extname(source.storedName).toLowerCase().slice(0, 8)}`;
const filePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));

/** Same bytes under a second name: a hard link where possible, else a copy. */
const linkOrCopy = async (from: string, to: string) => {
  try {
    await fs.link(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return;
    await fs.copyFile(from, to);
  }
};

// ─── Copying ──────────────────────────────────────────────────────────

/** Copies the reusable documents of the main case into one member case (idempotent). */
export const copyReusableDocs = async (mainCaseId: string, memberCaseId: string, actorId: string | null) => {
  const [main, member] = await Promise.all([
    prisma.case.findUnique({ where: { id: mainCaseId }, select: { id: true, number: true, client: { select: { locale: true } } } }),
    prisma.case.findUnique({ where: { id: memberCaseId }, select: { id: true, parentCaseId: true, relation: true, documentsPurgedAt: true, requirements: { select: { id: true, key: true, stage: true, sortOrder: true } } } }),
  ]);
  if (!main || !member || member.parentCaseId !== main.id || member.documentsPurgedAt) return { copied: 0, items: [] as string[] };
  const relation = relationKey(member.relation);
  const accepted = await prisma.document.findMany({
    where: { caseId: main.id, status: 'ACCEPTED' },
    orderBy: { createdAt: 'desc' },
    include: { requirement: { select: { key: true } } },
  });
  const copiedItems: string[] = [];
  let maxSort = Math.max(0, ...member.requirements.map((r) => r.sortOrder));
  for (const def of REUSABLE_DOCS) {
    if (def.relations !== 'all' && !def.relations.includes(relation)) continue;
    const matching = accepted.filter((d) => (d.requirement?.key && def.sources.includes(d.requirement.key)) || (def.visaStage && d.stage === 'VISA'));
    const sources = def.multi ? matching : matching.slice(0, 1);
    if (!sources.length) continue;
    let target = member.requirements.find((r) => r.key === def.target) ?? null;
    for (const src of sources) {
      const storedName = copyName(member.id, src);
      if (await prisma.document.findUnique({ where: { storedName }, select: { id: true } })) continue;
      const from = filePath(src.storedName);
      if (!(await fs.stat(from).catch(() => null))) continue; // file gone (retention): nothing to copy
      if (!target) {
        const created = await prisma.documentRequirement.create({
          data: { caseId: member.id, stage: 'INITIAL', key: def.target, title: def.title as Prisma.InputJsonValue, required: false, sortOrder: ++maxSort },
          select: { id: true, key: true, stage: true, sortOrder: true },
        });
        member.requirements.push(created);
        target = created;
      }
      await fs.mkdir(config.uploads.privateDir, { recursive: true });
      await linkOrCopy(from, filePath(storedName));
      let doc;
      try {
        doc = await prisma.document.create({
          data: {
            caseId: member.id,
            requirementId: target.id,
            stage: target.stage,
            originalName: src.originalName,
            storedName,
            mimeType: src.mimeType,
            size: src.size,
            status: 'ACCEPTED',
            expiresAt: src.expiresAt,
            uploadedById: actorId ?? src.uploadedById,
          },
        });
      } catch (err) {
        if ((err as { code?: string }).code === 'P2002') continue; // a parallel run copied it
        await fs.unlink(filePath(storedName)).catch(() => undefined);
        throw err;
      }
      void copyDocumentToDrive(doc.id);
      copiedItems.push(def.title.de);
    }
  }
  if (copiedItems.length) {
    const profile = await ensureProfile(member.id);
    if (profile) await prisma.familyMember.update({ where: { id: profile.id }, data: { docsCopiedAt: new Date() } });
    const tx = reunionTexts(main.client.locale);
    await prisma.caseEvent.create({
      data: { caseId: member.id, type: COPY_EVENT, note: tx.copiedEvent({ firstName: '', names: '', number: main.number, copied: copiedItems.length, docs: [...new Set(copiedItems)].join(', ') }).slice(0, 2000), actorId, visibleToClient: false },
    });
  }
  return { copied: copiedItems.length, items: copiedItems };
};

/** Copies into every member case of a main case. */
export const copyForAllMembers = async (mainCaseId: string, actorId: string | null) => {
  const members = await prisma.case.findMany({ where: { parentCaseId: mainCaseId }, select: { id: true, number: true } });
  const out: { caseId: string; number: string; copied: number }[] = [];
  for (const m of members) out.push({ caseId: m.id, number: m.number, copied: (await copyReusableDocs(mainCaseId, m.id, actorId)).copied });
  return out;
};

// ─── Start ────────────────────────────────────────────────────────────

const loadMain = async (caseId: string) => {
  const main = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, number: true, status: true, parentCaseId: true, clientId: true, client: { select: { firstName: true, locale: true } } } });
  if (!main) throw notFound('CASE_NOT_FOUND');
  if (main.parentCaseId) throw badRequest('NOT_A_MAIN_CASE');
  return main;
};

/** Visa approved or the main applicant arrived. */
const mainReady = async (main: { id: string; status: CaseStatus }) =>
  main.status === 'APPROVED' || (main.status !== 'CANCELLED' && main.status !== 'REJECTED' && (await prisma.arrivalPlan.count({ where: { caseId: main.id, status: 'COMPLETED' } })) > 0);

const memberRows = async (mainCaseId: string) => {
  const cases = await prisma.case.findMany({ where: { parentCaseId: mainCaseId }, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, status: true, relation: true, events: { where: { type: REUNION_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } });
  const profiles = await Promise.all(cases.map((c) => ensureProfile(c.id)));
  return cases.map((c, i) => ({ ...c, profile: profiles[i], startedAt: c.events[0]?.createdAt ?? null }));
};

const startable = (m: Awaited<ReturnType<typeof memberRows>>[number]) => m.profile?.joinsWhen === 'LATER' && !(m.startedAt && m.status === 'DOCUMENTS_PENDING') && STARTABLE.includes(m.status);

/** State shown in the family panel (staff button) and the client's family section. */
export const reunionSummary = async (mainCaseId: string) => {
  const main = await prisma.case.findUnique({ where: { id: mainCaseId }, select: { id: true, status: true, parentCaseId: true, events: { where: { type: REUNION_EVENT }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } } });
  if (!main || main.parentCaseId) return null;
  const members = await memberRows(main.id);
  const later = members.filter((m) => m.profile?.joinsWhen === 'LATER');
  return {
    ready: await mainReady(main),
    startedAt: main.events[0]?.createdAt.toISOString() ?? null,
    laterCount: later.length,
    startable: members.filter(startable).map((m) => m.id),
    members: members.map((m) => ({ caseId: m.id, joinsWhen: m.profile?.joinsWhen ?? 'WITH_MAIN', startedAt: m.startedAt?.toISOString() ?? null, docsCopiedAt: m.profile?.docsCopiedAt?.toISOString() ?? null })),
  };
};

/** "Start family reunion" (staff): opens / advances every LATER member's case and copies the documents. */
export const startReunion = async (mainCaseId: string, actorId: string) => {
  const main = await loadMain(mainCaseId);
  if (!(await mainReady(main))) throw conflict('MAIN_CASE_NOT_READY', 'The main case must be approved (or the main applicant arrived) first.');
  const members = (await memberRows(main.id)).filter(startable);
  if (!members.length) throw conflict('NOTHING_TO_START');
  const now = new Date();
  const started: { caseId: string; number: string; name: string; copied: number; reopened: boolean }[] = [];
  for (const m of members) {
    const reopened = m.status !== 'DOCUMENTS_PENDING';
    await prisma.$transaction(async (tx) => {
      const res = await tx.case.updateMany({
        where: { id: m.id, status: m.status },
        data: { status: 'DOCUMENTS_PENDING', visaType: 'FAMILY', closedAt: null, decisionAt: null, decisionReason: null, cancelReason: null, staffNote: null },
      });
      if (!res.count) throw conflict('INVALID_TRANSITION');
      if (!(await tx.documentRequirement.count({ where: { caseId: m.id, stage: 'INITIAL' } }))) {
        const visaCategoryId = (await tx.case.findUniqueOrThrow({ where: { id: m.id }, select: { visaCategoryId: true } })).visaCategoryId;
        await createRequirements(tx, m.id, 'INITIAL', visaCategoryId);
      }
      await tx.caseEvent.create({
        data: { caseId: m.id, type: REUNION_EVENT, fromStatus: m.status, toStatus: 'DOCUMENTS_PENDING', note: reunionTexts(main.client.locale).memberEvent({ firstName: '', names: '', number: main.number, copied: 0 }), actorId, visibleToClient: true },
      });
    });
    const { copied } = await copyReusableDocs(main.id, m.id, actorId);
    const name = m.profile ? `${m.profile.firstName} ${m.profile.lastName}`.trim() : m.number;
    started.push({ caseId: m.id, number: m.number, name, copied, reopened });
  }
  const names = started.map((s) => s.name).join(', ');
  const copied = started.reduce((a, s) => a + s.copied, 0);
  const locale: Locale = main.client.locale;
  const tx = reunionTexts(locale);
  await prisma.caseEvent.create({ data: { caseId: main.id, type: REUNION_EVENT, note: tx.mainEvent({ firstName: '', names, number: main.number, copied }), actorId, visibleToClient: true, createdAt: now } });
  await notifyUser(main.clientId, { type: 'FAMILY_REUNION_STARTED', title: tx.title, body: tx.body({ firstName: main.client.firstName, names, number: main.number, copied }), link: `/account/cases/${main.id}#family`, caseId: main.id, ctaLabel: tx.cta }).catch(() => undefined);
  return { started };
};
