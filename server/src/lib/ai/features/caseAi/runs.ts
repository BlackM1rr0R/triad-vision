import crypto from 'node:crypto';
import type { CaseAiFindingStatus, CaseAiKind, Prisma } from '@prisma/client';
import { prisma } from '../../../../db.js';
import { getAiSettings, resolveApiKey } from '../../settings.js';
import { checkLimits, type LimitReason } from '../../limits.js';
import { getCaseAiSettings } from './config.js';
import type { L10n } from './texts.js';

/** Shared shapes and storage of the case AI runs (CaseAiRun) and staff decisions on findings (CaseAiFindingState). */

export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';
export const SEVERITY_ORDER: Record<Severity, number> = { BLOCKER: 0, WARNING: 1, INFO: 2 };

export interface Evidence {
  documentId: string | null;
  documentName: string;
  value: string;
}

export type FixKind = 'PROFILE_FIELD' | 'REQUEST_DOCUMENT' | 'TASK';

export interface SuggestedFix {
  kind: FixKind;
  /** PROFILE_FIELD: the profile / case field to write. */
  field?: string;
  value?: string;
  /** REQUEST_DOCUMENT: an existing requirement (reminder) or a new one (requirementKey + title). */
  requirementId?: string;
  requirementKey?: string;
  title?: L10n;
}

export interface Finding {
  key: string;
  source: 'rule' | 'ai';
  code: string;
  severity: Severity;
  field: string;
  message: L10n;
  evidence: Evidence[];
  suggestedFix?: SuggestedFix;
}

export interface AiMeta {
  status: 'done' | 'skipped';
  reason?: string;
  model?: string;
  costUsd?: number;
}

export const shortHash = (...parts: string[]) => crypto.createHash('sha1').update(parts.join('\u0001')).digest('hex').slice(0, 12);

export const sortFindings = <T extends { severity: Severity }>(list: T[]) => [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

export const saveRun = (data: { caseId: string; kind: CaseAiKind; result: unknown; model?: string | null; costUsd?: number; createdById: string; subjectId?: string | null }) =>
  prisma.caseAiRun.create({
    data: {
      caseId: data.caseId,
      kind: data.kind,
      result: data.result as Prisma.InputJsonValue,
      model: data.model ?? null,
      costMicros: Math.round((data.costUsd ?? 0) * 1e6),
      createdById: data.createdById,
      subjectId: data.subjectId ?? null,
    },
  });

export const runDto = (r: { id: string; kind: CaseAiKind; result: unknown; model: string | null; costMicros: number; createdAt: Date; updatedAt: Date; subjectId: string | null; createdById: string | null }) => ({
  id: r.id,
  kind: r.kind,
  result: r.result,
  model: r.model,
  costUsd: r.costMicros / 1e6,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  subjectId: r.subjectId,
  createdById: r.createdById,
});

export const loadRun = async (caseId: string, runId: string, kind?: CaseAiKind) => {
  const r = await prisma.caseAiRun.findUnique({ where: { id: runId } });
  if (!r || r.caseId !== caseId || (kind && r.kind !== kind)) return null;
  return r;
};

export const latestRuns = async (caseId: string) => {
  const kinds: CaseAiKind[] = ['CONSISTENCY', 'CONTRACT', 'VIDEX'];
  const rows = await Promise.all(kinds.map((kind) => prisma.caseAiRun.findFirst({ where: { caseId, kind }, orderBy: { createdAt: 'desc' } })));
  return Object.fromEntries(kinds.map((k, i) => [k, rows[i] ? runDto(rows[i]!) : null])) as Record<CaseAiKind, ReturnType<typeof runDto> | null>;
};

export const findingStates = async (caseId: string) => {
  const rows = await prisma.caseAiFindingState.findMany({ where: { caseId }, orderBy: { at: 'desc' } });
  return rows.map((r) => ({ kind: r.kind, key: r.key, status: r.status, note: r.note, byId: r.byId, at: r.at }));
};

export const setFindingState = async (caseId: string, kind: CaseAiKind, key: string, status: CaseAiFindingStatus | null, byId: string, note?: string | null) => {
  if (!status) {
    await prisma.caseAiFindingState.deleteMany({ where: { caseId, kind, key } });
    return null;
  }
  return prisma.caseAiFindingState.upsert({
    where: { caseId_kind_key: { caseId, kind, key } },
    create: { caseId, kind, key, status, byId, note: note ?? null },
    update: { status, byId, note: note ?? null, at: new Date() },
  });
};

/** Whether the model can be asked now (own toggle, key, budget and the staff member's daily cap). */
export const aiAvailability = async (userId: string): Promise<{ available: boolean; reason: LimitReason | 'CASE_AI_DISABLED' | null }> => {
  const own = await getCaseAiSettings();
  if (!own.enabled) return { available: false, reason: 'CASE_AI_DISABLED' };
  const s = await getAiSettings();
  const key = resolveApiKey(s);
  if (!key) return { available: false, reason: 'NO_API_KEY' };
  const limit = await Promise.race([checkLimits({ id: userId }, 'ADMIN', s, key), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  return { available: !limit, reason: limit };
};

/** Timeline entry (internal) of an AI case action. */
export const caseEvent = (caseId: string, type: string, actorId: string, note: string) =>
  prisma.caseEvent.create({ data: { caseId, type, actorId, note: note.slice(0, 2000), visibleToClient: false } });
