import type { RecognitionStatus as UserRecognitionStatus } from '../matching.js';

/**
 * Pure rules of the recognition tracker (Anerkennung) and the accelerated skilled-worker procedure
 * (§ 81a AufenthG). No database access here: unit-tested in tests/unit/recognitionRules.test.ts.
 *
 * Domain notes (kept cautious on purpose; see the guides in prisma/seed/guides/anerkennung.ts, blueCard.ts, pflege.ts):
 *  - university degrees: ZAB "Zeugnisbewertung" (statement of comparability), roughly 200 €, usually ~3 months;
 *  - regulated professions (nursing, doctors …): full recognition by the competent state authority
 *    (nursing → Landesamt / Bezirksregierung, doctors → Approbationsbehörde), German level usually B2;
 *  - vocational qualifications: IHK FOSA (industry / commerce) or the Handwerkskammer (crafts);
 *  - a Defizitbescheid lists substantial differences → Ausgleichsmaßnahme (Anpassungslehrgang or
 *    Kenntnisprüfung / Eignungsprüfung); residence for the measure under § 16d AufenthG;
 *  - § 81a: the employer, authorised by the worker (Vollmacht), concludes an agreement with the
 *    Ausländerbehörde, fee 411 €; the authority issues a Vorabzustimmung, the embassy then usually offers an
 *    appointment within 3 weeks and usually decides within 3 weeks of the complete application.
 */

const DAY = 24 * 60 * 60 * 1000;

// ─── Recognition ──────────────────────────────────────────────────────

export const PROCEDURE_TYPES = ['ZAB_STATEMENT', 'FULL_RECOGNITION', 'PARTIAL_RECOGNITION', 'IHK_FOSA', 'HWK'] as const;
export type ProcedureType = (typeof PROCEDURE_TYPES)[number];

export const RECOGNITION_STATUSES = ['PREPARING', 'SUBMITTED', 'IN_REVIEW', 'DEFICIT_NOTICE', 'ADAPTATION', 'RECOGNISED', 'PARTIALLY_RECOGNISED', 'REJECTED', 'WITHDRAWN'] as const;
export type ProcessStatus = (typeof RECOGNITION_STATUSES)[number];
/** No further deadlines / reminders once a process reached one of these. */
export const FINAL_PROCESS_STATUSES: readonly ProcessStatus[] = ['RECOGNISED', 'PARTIALLY_RECOGNISED', 'REJECTED', 'WITHDRAWN'];
/** A decision letter arrived (decisionAt is set the first time). */
export const DECISION_STATUSES: readonly ProcessStatus[] = ['DEFICIT_NOTICE', 'RECOGNISED', 'PARTIALLY_RECOGNISED', 'REJECTED'];

export const ADAPTATION_MEASURES = ['ANPASSUNGSLEHRGANG', 'KENNTNISPRUEFUNG', 'EIGNUNGSPRUEFUNG'] as const;
export type AdaptationMeasure = (typeof ADAPTATION_MEASURES)[number];

export const RECOGNITION_EVENT_TYPES = ['STATUS', 'NOTE', 'DOCUMENT', 'LETTER_IN', 'LETTER_OUT', 'DEADLINE'] as const;
export type RecognitionEventType = (typeof RECOGNITION_EVENT_TYPES)[number];

/** Typical authority per procedure (a suggestion the staff member can overwrite). */
export const DEFAULT_AUTHORITY: Record<ProcedureType, string | null> = {
  ZAB_STATEMENT: 'Zentralstelle für ausländisches Bildungswesen (ZAB)',
  FULL_RECOGNITION: null, // depends on profession and federal state (Landesamt, Bezirksregierung, Approbationsbehörde …)
  PARTIAL_RECOGNITION: null,
  IHK_FOSA: 'IHK FOSA (Foreign Skills Approval), Nürnberg',
  HWK: null, // the Handwerkskammer of the region
};

/** Typical fee in cents (only the ZAB fee is fixed enough to prefill). */
export const DEFAULT_FEE_CENTS: Partial<Record<ProcedureType, number>> = { ZAB_STATEMENT: 20000 };

export const CHECK_KEYS = [
  'DIPLOMA',
  'TRANSCRIPT',
  'TRANSLATIONS',
  'PASSPORT',
  'CV',
  'WORK_CERTIFICATES',
  'GERMAN_CERT',
  'GOOD_STANDING',
  'APPLICATION_FORM',
  'FEE',
] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

export interface ChecklistItem {
  key: CheckKey;
  done: boolean;
  /** Case document that covers the item (Document.id). */
  documentId: string | null;
  /** Not always asked for (depends on the authority). */
  optional: boolean;
  /** The client has to provide it (feeds the portal's next step). */
  client: boolean;
}

/** Case requirement keys (lib/docsIntel/requirementTemplates) whose documents cover a checklist item. */
export const CHECK_REQUIREMENT_KEYS: Partial<Record<CheckKey, string[]>> = {
  DIPLOMA: ['DIPLOMA', 'ANERKENNUNG'],
  PASSPORT: ['PASSPORT'],
  CV: ['CV'],
  WORK_CERTIFICATES: ['EMPLOYMENT_REF'],
  GERMAN_CERT: ['GERMAN_CERT', 'LANGUAGE_CERT'],
};

/** Items the client provides (the agency handles the form and the fee). */
const CLIENT_ITEMS: readonly CheckKey[] = ['DIPLOMA', 'TRANSCRIPT', 'TRANSLATIONS', 'PASSPORT', 'CV', 'WORK_CERTIFICATES', 'GERMAN_CERT', 'GOOD_STANDING'];

type TemplateRow = [CheckKey, { optional?: boolean }?];

const TEMPLATES: Record<ProcedureType, TemplateRow[]> = {
  // ZAB: copies of the degree and transcript (translations only for some languages), ID, online form, fee.
  ZAB_STATEMENT: [['DIPLOMA'], ['TRANSCRIPT'], ['TRANSLATIONS', { optional: true }], ['PASSPORT'], ['APPLICATION_FORM'], ['FEE']],
  FULL_RECOGNITION: [
    ['DIPLOMA'],
    ['TRANSCRIPT'],
    ['TRANSLATIONS'],
    ['PASSPORT'],
    ['CV'],
    ['WORK_CERTIFICATES'],
    ['GERMAN_CERT'],
    ['GOOD_STANDING', { optional: true }],
    ['APPLICATION_FORM'],
    ['FEE'],
  ],
  PARTIAL_RECOGNITION: [['DIPLOMA'], ['TRANSCRIPT'], ['TRANSLATIONS'], ['PASSPORT'], ['CV'], ['WORK_CERTIFICATES'], ['GERMAN_CERT', { optional: true }], ['APPLICATION_FORM'], ['FEE']],
  IHK_FOSA: [['DIPLOMA'], ['TRANSCRIPT'], ['TRANSLATIONS'], ['PASSPORT'], ['CV'], ['WORK_CERTIFICATES'], ['APPLICATION_FORM'], ['FEE']],
  HWK: [['DIPLOMA'], ['TRANSCRIPT'], ['TRANSLATIONS'], ['PASSPORT'], ['CV'], ['WORK_CERTIFICATES'], ['APPLICATION_FORM'], ['FEE']],
};

/**
 * Checklist of a procedure. For regulated professions the German certificate is required (usually B2 for
 * nursing / medicine); for unregulated vocational procedures it is not part of the application.
 */
export const checklistTemplate = (type: ProcedureType, regulated: boolean): ChecklistItem[] => {
  const rows = [...TEMPLATES[type]];
  if (regulated && !rows.some(([k]) => k === 'GERMAN_CERT')) rows.splice(rows.length - 2, 0, ['GERMAN_CERT']);
  return rows.map(([key, o]) => ({
    key,
    done: false,
    documentId: null,
    optional: key === 'GERMAN_CERT' && regulated ? false : !!o?.optional,
    client: CLIENT_ITEMS.includes(key),
  }));
};

/** Reads a stored checklist defensively (unknown keys dropped, missing flags defaulted). */
export const readChecklist = (raw: unknown): ChecklistItem[] => {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!(CHECK_KEYS as readonly string[]).includes(String(o.key))) continue;
    if (out.some((x) => x.key === o.key)) continue;
    out.push({
      key: o.key as CheckKey,
      done: o.done === true,
      documentId: typeof o.documentId === 'string' && o.documentId ? o.documentId : null,
      optional: o.optional === true,
      client: o.client === true || (o.client === undefined && CLIENT_ITEMS.includes(o.key as CheckKey)),
    });
  }
  return out;
};

export const checklistProgress = (items: ChecklistItem[]) => {
  const required = items.filter((i) => !i.optional);
  return { done: required.filter((i) => i.done).length, total: required.length };
};

/** Open items the client has to provide (required ones first). */
export const clientOpenItems = (items: ChecklistItem[]) => items.filter((i) => i.client && !i.done).sort((a, b) => Number(a.optional) - Number(b.optional));

/** User.recognitionStatus (match score) for one process status. */
export const userStatusFor = (s: ProcessStatus): UserRecognitionStatus => {
  switch (s) {
    case 'RECOGNISED':
      return 'RECOGNISED';
    case 'DEFICIT_NOTICE':
    case 'ADAPTATION':
    case 'PARTIALLY_RECOGNISED':
      return 'PARTIAL';
    case 'REJECTED':
    case 'WITHDRAWN':
      return 'NONE';
    default:
      return 'IN_PROGRESS';
  }
};

const USER_RANK: Record<UserRecognitionStatus, number> = { NONE: 0, IN_PROGRESS: 1, PARTIAL: 2, NOT_REQUIRED: 3, RECOGNISED: 4 };

/**
 * The client's overall recognition status from all of their processes: the best one wins (a running
 * full recognition does not undo a positive ZAB statement). null = no processes (leave the field as it is).
 */
export const aggregateUserStatus = (statuses: string[]): UserRecognitionStatus | null => {
  const known = statuses.filter((s): s is ProcessStatus => (RECOGNITION_STATUSES as readonly string[]).includes(s));
  if (!known.length) return null;
  return known.map(userStatusFor).reduce((best, s) => (USER_RANK[s] > USER_RANK[best] ? s : best), 'NONE' as UserRecognitionStatus);
};

/** The deadline the reminders watch: the next deadline, else the end of the adaptation measure while it runs. */
export const effectiveDeadline = (p: { status: string; nextDeadline: Date | null; adaptationUntil: Date | null }): { at: Date; kind: 'NEXT' | 'ADAPTATION' } | null => {
  if ((FINAL_PROCESS_STATUSES as readonly string[]).includes(p.status)) return null;
  if (p.nextDeadline) return { at: p.nextDeadline, kind: 'NEXT' };
  if (p.status === 'ADAPTATION' && p.adaptationUntil) return { at: p.adaptationUntil, kind: 'ADAPTATION' };
  return null;
};

// ─── § 81a accelerated procedure ──────────────────────────────────────

export const ACCEL_STATUSES = [
  'PREPARING',
  'POWER_OF_ATTORNEY',
  'AGREEMENT_SIGNED',
  'SUBMITTED',
  'FEE_REQUESTED',
  'FEE_PAID',
  'IN_REVIEW',
  'PRE_APPROVAL',
  'SENT_TO_EMBASSY',
  'APPOINTMENT_BOOKED',
  'VISA_DECIDED',
  'REJECTED',
  'CANCELLED',
] as const;
export type AccelStatus = (typeof ACCEL_STATUSES)[number];
/** The linear path (REJECTED / CANCELLED end it from any step). */
export const ACCEL_PATH: readonly AccelStatus[] = ACCEL_STATUSES.slice(0, 11);
export const ACCEL_FINAL: readonly AccelStatus[] = ['VISA_DECIDED', 'REJECTED', 'CANCELLED'];

export const ACCEL_CHANNELS = ['EMAIL', 'LETTER', 'PORTAL', 'PHONE', 'FAX'] as const;
export type AccelChannel = (typeof ACCEL_CHANNELS)[number];

/** § 81a fee (Gebühr der Ausländerbehörde) in cents. */
export const ACCEL_FEE_CENTS = 41100;
/** Embassy appointment usually within 3 weeks of the Vorabzustimmung, decision usually within 3 weeks of the complete application. */
export const APPOINTMENT_WITHIN_DAYS = 21;
export const DECISION_WITHIN_DAYS = 21;

export const pathIndex = (s: string) => ACCEL_PATH.indexOf(s as AccelStatus);

/** Moves forward only: the later of the current and the target step (final states stay). */
export const advanceTo = (current: string, target: AccelStatus): AccelStatus => {
  if ((ACCEL_FINAL as readonly string[]).includes(current)) return current as AccelStatus;
  if (target === 'REJECTED' || target === 'CANCELLED') return target;
  return pathIndex(target) > pathIndex(current) ? target : (current as AccelStatus);
};

export const appointmentDeadlineFrom = (preApprovalAt: Date) => new Date(preApprovalAt.getTime() + APPOINTMENT_WITHIN_DAYS * DAY);
export const decisionDeadlineFrom = (appointmentAt: Date) => new Date(appointmentAt.getTime() + DECISION_WITHIN_DAYS * DAY);

export type EmployerTodo = 'SIGN_AGREEMENT' | 'PAY_FEE';

/** What the employer still has to do (shown in the company portal's worker drawer). */
export const employerTodos = (p: { status: string; agreementSignedAt: Date | null; feeRequestedAt: Date | null; feePaidAt: Date | null }): EmployerTodo[] => {
  if ((ACCEL_FINAL as readonly string[]).includes(p.status)) return [];
  const out: EmployerTodo[] = [];
  if (!p.agreementSignedAt && pathIndex(p.status) < pathIndex('AGREEMENT_SIGNED')) out.push('SIGN_AGREEMENT');
  if (p.feeRequestedAt && !p.feePaidAt) out.push('PAY_FEE');
  return out;
};

export interface AccelDeadline {
  kind: 'APPOINTMENT' | 'DECISION' | 'REPLY' | 'FEE';
  at: Date;
}

/**
 * Deadlines of a running procedure: embassy appointment (until booked), embassy decision (until decided),
 * the fee (2 weeks after it was requested, until paid) and the earliest open reply date of an incoming letter.
 */
export const accelDeadlines = (
  p: { status: string; appointmentDeadline: Date | null; appointmentAt: Date | null; decisionDeadline: Date | null; decidedAt: Date | null; feeRequestedAt: Date | null; feePaidAt: Date | null },
  replyDue: Date | null,
): AccelDeadline[] => {
  if ((ACCEL_FINAL as readonly string[]).includes(p.status)) return [];
  const out: AccelDeadline[] = [];
  if (p.appointmentDeadline && !p.appointmentAt) out.push({ kind: 'APPOINTMENT', at: p.appointmentDeadline });
  if (p.decisionDeadline && !p.decidedAt) out.push({ kind: 'DECISION', at: p.decisionDeadline });
  if (p.feeRequestedAt && !p.feePaidAt) out.push({ kind: 'FEE', at: new Date(p.feeRequestedAt.getTime() + 14 * DAY) });
  if (replyDue) out.push({ kind: 'REPLY', at: replyDue });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
};
