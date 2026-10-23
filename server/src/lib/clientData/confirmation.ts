import type { DataConfirmation, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, conflict, notFound } from '../http.js';
import { notifyUser } from '../notifications.js';
import { caseEvent } from '../ai/features/caseAi/runs.js';
import { loadCaseContext } from '../ai/features/caseAi/data.js';
import { mapVidex, SECTION_LABELS, FIELD_DEFS, type Section, type VidexResult } from '../ai/features/caseAi/videx.js';
import type { ContractResult } from '../ai/features/caseAi/contract.js';
import type { L10n } from '../ai/features/caseAi/texts.js';
import { dmy, isoDay, loadTargetContext, normaliseTarget, targetDef, writeTargets, type TargetDef } from './targets.js';
import { CONFIRM_REMINDER, CONFIRM_REQUESTED, STAFF_CONFIRM_SUBMITTED } from './texts.js';

/**
 * "Client confirms their data": before the embassy submission staff ask the client to check every value that
 * goes into the VIDEX form (names as in the passport, birth place, nationality, address, passport, employer,
 * salary, start date, purpose). The client marks each line correct or sends a correction (+ optional photo).
 * The confirmed snapshot is kept with time, IP and user agent as evidence. Accepted corrections are written
 * to the VIDEX sheet (CaseDataValue + latest run) and, where the value has a profile column, to the profile.
 */

export const CONFIRM_FIELDS: { key: string; profile?: string; date?: boolean }[] = [
  { key: 'surname' },
  { key: 'givenNames' },
  { key: 'birthDate', profile: 'profile.birthDate', date: true },
  { key: 'placeOfBirth' },
  { key: 'nationality', profile: 'profile.nationality' },
  { key: 'street', profile: 'profile.address' },
  { key: 'postalCode' },
  { key: 'city', profile: 'profile.city' },
  { key: 'passportNumber', profile: 'profile.passportNumber' },
  { key: 'passportIssueDate', date: true },
  { key: 'passportExpiry', profile: 'profile.passportExpiry', date: true },
  { key: 'employerName' },
  { key: 'employerAddress' },
  { key: 'position' },
  { key: 'salary' },
  { key: 'entryDate', date: true },
  { key: 'purpose' },
];
export const CONFIRM_KEYS = CONFIRM_FIELDS.map((f) => f.key);
const CONFIRM = new Map(CONFIRM_FIELDS.map((f) => [f.key, f]));
const DEFS = new Map(FIELD_DEFS.map((d) => [d.key, d]));

export interface ConfirmField {
  key: string;
  section: Section;
  label: L10n;
  value: string;
}

export interface ConfirmAnswer {
  ok: boolean;
  /** The corrected value (when ok = false). */
  value?: string;
  proofDocumentId?: string | null;
}

export interface ConfirmDecision {
  decision: 'ACCEPTED' | 'REJECTED';
  value: string | null;
  at: string;
  byId: string;
}

/** The values that go to the embassy now: the latest VIDEX run (with staff edits), else the deterministic mapping. */
export const currentConfirmFields = async (caseId: string): Promise<ConfirmField[]> => {
  const run = await prisma.caseAiRun.findFirst({ where: { caseId, kind: 'VIDEX' }, orderBy: { createdAt: 'desc' }, select: { result: true } });
  let values: Map<string, string>;
  if (run) {
    values = new Map((run.result as unknown as VidexResult).fields.map((f) => [f.key, f.value]));
  } else {
    const [ctx, lastContract] = await Promise.all([loadCaseContext(caseId), prisma.caseAiRun.findFirst({ where: { caseId, kind: 'CONTRACT' }, orderBy: { createdAt: 'desc' }, select: { result: true } })]);
    const terms = lastContract ? ((lastContract.result as unknown as ContractResult).terms ?? null) : null;
    values = new Map(mapVidex(ctx, terms).map((f) => [f.key, f.value]));
  }
  return CONFIRM_FIELDS.map((c) => {
    const d = DEFS.get(c.key)!;
    return { key: c.key, section: d.section, label: d.label, value: values.get(c.key) ?? '' };
  });
};

const asFields = (v: unknown) => (Array.isArray(v) ? (v as ConfirmField[]) : []);
const asAnswers = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, ConfirmAnswer>) : {});
const asDecisions = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, ConfirmDecision>) : {});

export const SECTIONS = SECTION_LABELS;

// ─── Request / client ──────────────────────────────────────────────

export const requestConfirmation = async (caseId: string, actorId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: { id: true, clientId: true, client: { select: { locale: true } } } });
  if (!c) throw notFound('CASE_NOT_FOUND');
  const fields = await currentConfirmFields(c.id);
  await prisma.dataConfirmation.updateMany({ where: { caseId: c.id, status: { in: ['PENDING', 'SUBMITTED'] } }, data: { status: 'CANCELLED' } });
  const conf = await prisma.dataConfirmation.create({ data: { caseId: c.id, fields: fields as unknown as Prisma.InputJsonValue, requestedById: actorId } });
  await notifyUser(c.clientId, { type: 'DATA_CONFIRM_REQUESTED', ...CONFIRM_REQUESTED[c.client.locale], link: `/account/cases/${c.id}/confirm`, caseId: c.id });
  await caseEvent(c.id, 'DATA_CONFIRM_REQUESTED', actorId, `${fields.length} Angaben`);
  return conf;
};

export const latestConfirmation = (caseId: string) => prisma.dataConfirmation.findFirst({ where: { caseId, status: { not: 'CANCELLED' } }, orderBy: { requestedAt: 'desc' } });

export const clientConfirmationDto = (conf: DataConfirmation) => ({
  id: conf.id,
  status: conf.status,
  fields: asFields(conf.fields),
  answers: asAnswers(conf.answers),
  requestedAt: conf.requestedAt,
  submittedAt: conf.submittedAt,
  editable: conf.status === 'PENDING',
});

const answerSchemaCheck = (raw: unknown) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('INVALID_ANSWERS');
  return raw as Record<string, unknown>;
};

export const submitConfirmation = async (conf: DataConfirmation, clientId: string, raw: unknown, meta: { ip: string | null; userAgent: string | null }) => {
  if (conf.status !== 'PENDING') throw conflict('CONFIRMATION_CLOSED');
  const src = answerSchemaCheck(raw);
  const fields = asFields(conf.fields);
  const answers: Record<string, ConfirmAnswer> = {};
  const missing: string[] = [];
  const proofIds = new Set<string>();
  for (const f of fields) {
    const a = src[f.key] as Record<string, unknown> | undefined;
    if (!a || typeof a !== 'object' || typeof a.ok !== 'boolean') {
      missing.push(f.key);
      continue;
    }
    if (a.ok) answers[f.key] = { ok: true };
    else {
      const value = typeof a.value === 'string' ? a.value.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
      if (!value) {
        missing.push(f.key);
        continue;
      }
      const proof = typeof a.proofDocumentId === 'string' && a.proofDocumentId.length <= 40 ? a.proofDocumentId : null;
      if (proof) proofIds.add(proof);
      answers[f.key] = { ok: false, value, proofDocumentId: proof };
    }
  }
  if (missing.length) return { ok: false as const, missing };
  if (proofIds.size) {
    const own = new Set((await prisma.document.findMany({ where: { id: { in: [...proofIds] }, caseId: conf.caseId, uploadedById: clientId }, select: { id: true } })).map((d) => d.id));
    for (const a of Object.values(answers)) if (a.proofDocumentId && !own.has(a.proofDocumentId)) a.proofDocumentId = null;
  }
  const corrections = Object.values(answers).filter((a) => !a.ok).length;
  const now = new Date();
  const updated = await prisma.dataConfirmation.update({
    where: { id: conf.id },
    data: {
      answers: answers as unknown as Prisma.InputJsonValue,
      status: corrections ? 'SUBMITTED' : 'CONFIRMED',
      submittedAt: now,
      submitIp: meta.ip?.slice(0, 64) ?? null,
      submitUserAgent: meta.userAgent?.slice(0, 1000) ?? null,
      snapshot: corrections ? undefined : (fields.map((f) => ({ key: f.key, value: f.value, by: 'client' })) as unknown as Prisma.InputJsonValue),
    },
  });
  const c = await prisma.case.findUniqueOrThrow({ where: { id: conf.caseId }, select: { id: true, number: true, assignedStaffId: true } });
  await caseEvent(c.id, corrections ? 'DATA_CONFIRM_CORRECTIONS' : 'DATA_CONFIRMED', clientId, corrections ? `${corrections} Korrektur(en)` : `${fields.length} Angaben bestätigt`);
  const staffId = c.assignedStaffId ?? conf.requestedById;
  if (staffId) await notifyUser(staffId, { type: 'DATA_CONFIRM_SUBMITTED', ...STAFF_CONFIRM_SUBMITTED(c.number, corrections), link: `/admin/cases/${c.id}#case-data`, caseId: c.id });
  return { ok: true as const, confirmation: updated, corrections };
};

// ─── Staff ─────────────────────────────────────────────────────────

/** Rows for staff: the value sent to the client, the client's answer and the decision on corrections. */
export const staffConfirmationDto = async (conf: DataConfirmation) => {
  const answers = asAnswers(conf.answers);
  const decisions = asDecisions(conf.decisions);
  const proofIds = Object.values(answers).map((a) => a.proofDocumentId).filter((x): x is string => !!x);
  const docs = proofIds.length ? await prisma.document.findMany({ where: { id: { in: proofIds } }, select: { id: true, originalName: true, mimeType: true } }) : [];
  const docMap = new Map(docs.map((d) => [d.id, d]));
  return {
    id: conf.id,
    status: conf.status,
    requestedAt: conf.requestedAt,
    requestedById: conf.requestedById,
    submittedAt: conf.submittedAt,
    submitIp: conf.submitIp,
    submitUserAgent: conf.submitUserAgent,
    reviewedAt: conf.reviewedAt,
    reviewedById: conf.reviewedById,
    remindedAt: conf.remindedAt,
    items: asFields(conf.fields).map((f) => {
      const a = answers[f.key];
      const d = decisions[f.key];
      const proof = a?.proofDocumentId ? docMap.get(a.proofDocumentId) : undefined;
      return {
        key: f.key,
        section: f.section,
        label: f.label,
        value: f.value,
        answer: a ? (a.ok ? { ok: true } : { ok: false, correction: { key: f.key, value: a.value ?? '' }, proof: proof ? { id: proof.id, name: proof.originalName, mimeType: proof.mimeType } : null }) : null,
        decision: d ? { decision: d.decision, at: d.at, byId: d.byId, applied: d.value !== null ? { key: f.key, value: d.value } : null } : null,
        profileTarget: CONFIRM.get(f.key)?.profile ?? null,
      };
    }),
  };
};

/** VIDEX wording of a corrected value (dates DD.MM.YYYY). */
const videxValue = (key: string, value: string) => {
  if (CONFIRM.get(key)?.date) {
    const iso = isoDay(value);
    return iso ? dmy(iso) : null;
  }
  const v = value.replace(/\s+/g, ' ').trim().slice(0, 300);
  return v || null;
};

export const decideCorrections = async (conf: DataConfirmation, decisions: { key: string; decision: 'ACCEPT' | 'REJECT'; value?: string }[], actorId: string) => {
  if (conf.status !== 'SUBMITTED') throw conflict('NOTHING_TO_REVIEW');
  const answers = asAnswers(conf.answers);
  const done = asDecisions(conf.decisions);
  const ctx = await loadTargetContext(conf.caseId);
  const writes: { def: TargetDef; value: string }[] = [];
  const now = new Date().toISOString();
  for (const d of decisions) {
    const a = answers[d.key];
    if (!a || a.ok) throw badRequest('NO_CORRECTION');
    if (d.decision === 'REJECT') {
      done[d.key] = { decision: 'REJECTED', value: null, at: now, byId: actorId };
      continue;
    }
    const v = videxValue(d.key, d.value ?? a.value ?? '');
    if (!v) throw badRequest('INVALID_VALUE');
    writes.push({ def: targetDef(`videx.${d.key}`)!, value: v });
    const profile = targetDef(CONFIRM.get(d.key)?.profile);
    if (profile) {
      const pv = normaliseTarget(profile, profile.kind === 'date' ? isoDay(v) : v);
      if (pv) writes.push({ def: profile, value: pv });
    }
    done[d.key] = { decision: 'ACCEPTED', value: v, at: now, byId: actorId };
  }
  await writeTargets(ctx, writes, { actorId, source: 'confirmation', sourceId: conf.id });
  const open = Object.entries(answers).filter(([k, a]) => !a.ok && !done[k]);
  const fields = asFields(conf.fields);
  const complete = open.length === 0;
  const updated = await prisma.dataConfirmation.update({
    where: { id: conf.id },
    data: {
      decisions: done as unknown as Prisma.InputJsonValue,
      ...(complete
        ? {
            status: 'CONFIRMED',
            reviewedAt: new Date(),
            reviewedById: actorId,
            snapshot: fields.map((f) => {
              const a = answers[f.key];
              const dec = done[f.key];
              return dec?.decision === 'ACCEPTED' ? { key: f.key, value: dec.value, by: 'correction' } : { key: f.key, value: f.value, by: a?.ok ? 'client' : 'rejected' };
            }) as unknown as Prisma.InputJsonValue,
          }
        : {}),
    },
  });
  await caseEvent(conf.caseId, 'DATA_CONFIRM_REVIEWED', actorId, decisions.map((d) => `${d.key}: ${d.decision === 'ACCEPT' ? 'übernommen' : 'abgelehnt'}`).join(', ').slice(0, 1900));
  return updated;
};

export const remindConfirmation = async (conf: DataConfirmation) => {
  if (conf.status !== 'PENDING') throw conflict('CONFIRMATION_CLOSED');
  const c = await prisma.case.findUniqueOrThrow({ where: { id: conf.caseId }, select: { id: true, clientId: true, client: { select: { locale: true } } } });
  await notifyUser(c.clientId, { type: 'DATA_CONFIRM_REMINDER', ...CONFIRM_REMINDER[c.client.locale], link: `/account/cases/${c.id}/confirm`, caseId: c.id });
  return prisma.dataConfirmation.update({ where: { id: conf.id }, data: { remindedAt: new Date(), reminders: { increment: 1 } } });
};

// ─── State (header chip, next step, embassy package warning) ────────

export type ConfirmState = 'NONE' | 'PENDING' | 'REVIEW' | 'CONFIRMED' | 'STALE';

export interface ConfirmationState {
  state: ConfirmState;
  confirmationId: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  /** Latest change of the confirmed data after the confirmation (STALE). */
  changedAt: string | null;
  changedKeys: string[];
  corrections: number;
}

const PROFILE_FIELDS = ['firstName', 'lastName', 'birthDate', 'nationality', 'city', 'address', 'passportNumber', 'passportExpiry'];
const CASE_FIELDS = ['companyId', 'vacancyId', 'visaType', 'visaCategoryId', 'profession'];

/**
 * Confirmation state of several cases with a fixed number of queries. A confirmation is STALE when, after it
 * was confirmed (client submit, or staff review of the corrections), a profile / case field it depends on
 * changed (field history), a VIDEX value was set from another source, or the latest VIDEX sheet now shows a
 * different value than the confirmed snapshot.
 */
export const confirmationStates = async (caseIds: string[]): Promise<Map<string, ConfirmationState>> => {
  const ids = [...new Set(caseIds)];
  const out = new Map<string, ConfirmationState>();
  if (!ids.length) return out;
  const confs = await prisma.dataConfirmation.findMany({ where: { caseId: { in: ids }, status: { not: 'CANCELLED' } }, orderBy: { requestedAt: 'desc' } });
  const latest = new Map<string, DataConfirmation>();
  for (const c of confs) if (!latest.has(c.caseId)) latest.set(c.caseId, c);
  const confirmed = [...latest.values()].filter((c) => c.status === 'CONFIRMED');
  const effective = (c: DataConfirmation) => c.reviewedAt ?? c.submittedAt ?? c.requestedAt;
  const changes = new Map<string, { at: Date; keys: Set<string> }>();
  const note = (caseId: string, at: Date, key: string) => {
    const cur = changes.get(caseId) ?? { at, keys: new Set<string>() };
    if (at > cur.at) cur.at = at;
    cur.keys.add(key);
    changes.set(caseId, cur);
  };
  if (confirmed.length) {
    const cIds = confirmed.map((c) => c.caseId);
    const minAt = new Date(Math.min(...confirmed.map((c) => effective(c).getTime())));
    const cases = await prisma.case.findMany({ where: { id: { in: cIds } }, select: { id: true, clientId: true } });
    const clientOf = new Map(cases.map((c) => [c.id, c.clientId]));
    const [fc, values, runs] = await Promise.all([
      prisma.fieldChange.findMany({
        where: {
          createdAt: { gt: minAt },
          OR: [
            { entity: 'USER', entityId: { in: cases.map((c) => c.clientId) }, field: { in: PROFILE_FIELDS } },
            { entity: 'CASE', entityId: { in: cIds }, field: { in: CASE_FIELDS } },
          ],
        },
        select: { entity: true, entityId: true, field: true, createdAt: true },
        take: 2000,
      }),
      prisma.caseDataValue.findMany({ where: { caseId: { in: cIds }, key: { in: CONFIRM_KEYS }, updatedAt: { gt: minAt } }, select: { caseId: true, key: true, source: true, sourceId: true, updatedAt: true } }),
      prisma.caseAiRun.findMany({ where: { caseId: { in: cIds }, kind: 'VIDEX', updatedAt: { gt: minAt } }, orderBy: { createdAt: 'desc' }, select: { caseId: true, result: true, updatedAt: true } }),
    ]);
    for (const conf of confirmed) {
      const at = effective(conf);
      const clientId = clientOf.get(conf.caseId);
      for (const f of fc) {
        if (f.createdAt <= at) continue;
        if ((f.entity === 'USER' && f.entityId === clientId) || (f.entity === 'CASE' && f.entityId === conf.caseId)) note(conf.caseId, f.createdAt, f.field);
      }
      for (const v of values) if (v.caseId === conf.caseId && v.updatedAt > at && !(v.source === 'confirmation' && v.sourceId === conf.id)) note(conf.caseId, v.updatedAt, v.key);
      const run = runs.find((r) => r.caseId === conf.caseId);
      if (run && run.updatedAt > at) {
        const snap = new Map(((conf.snapshot as { key: string; value: string | null }[] | null) ?? []).map((s) => [s.key, s.value ?? '']));
        for (const f of (run.result as unknown as VidexResult).fields) if (snap.has(f.key) && (snap.get(f.key) ?? '') !== (f.value ?? '')) note(conf.caseId, run.updatedAt, f.key);
      }
    }
  }
  for (const id of ids) {
    const c = latest.get(id);
    if (!c) {
      out.set(id, { state: 'NONE', confirmationId: null, requestedAt: null, confirmedAt: null, changedAt: null, changedKeys: [], corrections: 0 });
      continue;
    }
    const corrections = Object.values(asAnswers(c.answers)).filter((a) => !a.ok).length;
    const ch = changes.get(id);
    const state: ConfirmState = c.status === 'PENDING' ? 'PENDING' : c.status === 'SUBMITTED' ? 'REVIEW' : ch ? 'STALE' : 'CONFIRMED';
    out.set(id, {
      state,
      confirmationId: c.id,
      requestedAt: c.requestedAt.toISOString(),
      confirmedAt: c.status === 'CONFIRMED' ? effective(c).toISOString() : null,
      changedAt: ch ? ch.at.toISOString() : null,
      changedKeys: ch ? [...ch.keys] : [],
      corrections,
    });
  }
  return out;
};

export const confirmationState = async (caseId: string) => (await confirmationStates([caseId])).get(caseId)!;
