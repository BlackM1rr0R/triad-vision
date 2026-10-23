/**
 * THE status vocabulary. Every domain status in the app maps to one of a handful of tones here, and
 * every badge / pill / bar / dot colour comes from these tones, so "pending" is the same amber on the
 * portal, in admin and in the workspace, in light and in dark mode.
 *
 *   success  green   done, accepted, approved, paid, signed, active, confirmed, delivered
 *   warning  amber   waiting / pending, needs someone's action, due soon, expired (recoverable)
 *   danger   red     rejected, declined, cancelled, failed, overdue, urgent / high severity
 *   info     blue    moving along: new, sent, submitted, in review, in progress, viewed
 *   neutral  grey    draft, not started, queued, skipped, archived, closed, low priority
 *   accent   violet  a booked milestone: appointment / interview scheduled, proposed, at apostille
 *
 * `brand` exists as a badge tone for non-status labels (roles, categories) and is never a status.
 *
 * Feature modules keep their exported `*_TONE` maps for compatibility, but build them with
 * `toneClasses(STATUS_TONES.<domain>)` so the colour decision lives only here.
 */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';
/** Badge tones: the status tones plus `brand` for non-status labels. */
export type BadgeTone = Tone | 'brand';

/** Tint background + readable text (badges, pills, chips). */
export const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'bg-success-bg text-success-fg',
  warning: 'bg-warning-bg text-warning-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
  neutral: 'bg-neutral-bg text-neutral-fg',
  accent: 'bg-accent-bg text-accent-fg',
  brand: 'bg-brand-100 text-brand-700',
};

/** Text colour only (inline status words, icons on a neutral surface). */
export const TONE_TEXT: Record<BadgeTone, string> = {
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  info: 'text-info-fg',
  neutral: 'text-neutral-fg',
  accent: 'text-accent-fg',
  brand: 'text-brand-700',
};

/** Solid fill (status bars, progress segments, dots). */
export const TONE_SOLID: Record<BadgeTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
  accent: 'bg-accent',
  brand: 'bg-brand-500',
};

/** Border colour (outlined callouts, cards with a status edge). */
export const TONE_BORDER: Record<BadgeTone, string> = {
  success: 'border-success-border',
  warning: 'border-warning-border',
  danger: 'border-danger-border',
  info: 'border-info-border',
  neutral: 'border-neutral-border',
  accent: 'border-accent-border',
  brand: 'border-brand-400',
};

export const toneClass = (tone: BadgeTone) => TONE_CLASS[tone];
export const toneText = (tone: BadgeTone) => TONE_TEXT[tone];
export const toneSolid = (tone: BadgeTone) => TONE_SOLID[tone];
export const toneBorder = (tone: BadgeTone) => TONE_BORDER[tone];

type ToneMap = Readonly<Record<string, Tone>>;
const mapValues = <K extends string>(m: Readonly<Record<K, BadgeTone>>, table: Record<BadgeTone, string>) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, table[v as BadgeTone]])) as Record<K, string>;

/** Domain map → tint class map (drop-in for the legacy `*_TONE: Record<Status, string>` maps). */
export const toneClasses = <K extends string>(m: Readonly<Record<K, BadgeTone>>) => mapValues(m, TONE_CLASS);
/** Domain map → text colour map. */
export const toneTexts = <K extends string>(m: Readonly<Record<K, BadgeTone>>) => mapValues(m, TONE_TEXT);
/** Domain map → solid fill map. */
export const toneSolids = <K extends string>(m: Readonly<Record<K, BadgeTone>>) => mapValues(m, TONE_SOLID);

// ─── Domain vocabularies ────────────────────────────────────────────────

export const STATUS_TONES = {
  /** Visa case (lib/types CaseStatus). The client's move = warning, ours = info. */
  case: {
    DOCUMENTS_PENDING: 'warning',
    DOCUMENTS_REVIEW: 'info',
    CONTRACT_SENT: 'warning',
    CONTRACT_SIGNED: 'info',
    EMBASSY_DOCUMENTS: 'warning',
    EMBASSY_REVIEW: 'info',
    APPOINTMENT_SCHEDULED: 'accent',
    DECISION_PENDING: 'info',
    APPROVED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'danger',
  },
  /** Uploaded document review (DocStatus). */
  document: { PENDING: 'warning', ACCEPTED: 'success', REJECTED: 'danger' },
  /** Portal checklist item state (lowercase). */
  docItem: { missing: 'neutral', pending: 'warning', accepted: 'success', rejected: 'danger', ready: 'success' },
  /** Team tasks (tasks/, drive comments). */
  task: { TODO: 'neutral', IN_PROGRESS: 'info', REVIEW: 'warning', DONE: 'success', CANCELLED: 'danger' },
  taskPriority: { LOW: 'neutral', NORMAL: 'info', HIGH: 'warning', URGENT: 'danger' },
  taskDue: { overdue: 'danger', today: 'warning', soon: 'info', later: 'neutral', done: 'neutral' },
  /** Client process tasks (clientProcess TaskState). */
  clientTask: { open: 'neutral', due_soon: 'warning', overdue: 'danger', done: 'success', cancelled: 'danger' },
  /** Family member checklist. */
  checklist: { accepted: 'success', pending: 'warning', rejected: 'danger', missing: 'neutral' },
  invoice: { DRAFT: 'neutral', SENT: 'info', OVERDUE: 'danger', PAID: 'success', CANCELLED: 'danger' },
  quote: { DRAFT: 'neutral', SENT: 'info', VIEWED: 'info', ACCEPTED: 'success', DECLINED: 'danger', EXPIRED: 'warning', CONVERTED: 'success' },
  booking: { BOOKED: 'accent', DONE: 'success', NO_SHOW: 'warning', CANCELLED: 'danger' },
  officeVisit: { BOOKED: 'accent', DONE: 'success', NO_SHOW: 'danger', CANCELLED: 'danger' },
  interview: { PROPOSED: 'warning', CONFIRMED: 'accent', DONE: 'success', NO_SHOW: 'danger', CANCELLED: 'danger' },
  /** e-signature request / signer. */
  signature: { DRAFT: 'neutral', SENT: 'info', COMPLETED: 'success', DECLINED: 'danger', CANCELLED: 'danger', EXPIRED: 'warning' },
  signer: { PENDING: 'warning', VIEWED: 'info', SIGNED: 'success', DECLINED: 'danger' },
  /** Job applications / vacancies / employer accounts. */
  application: { NEW: 'info', SHORTLISTED: 'info', PROPOSED: 'accent', INTERVIEW: 'accent', ACCEPTED: 'success', REJECTED: 'danger', WITHDRAWN: 'neutral' },
  vacancy: { DRAFT: 'neutral', PENDING: 'warning', OPEN: 'success', CLOSED: 'neutral' },
  company: { PENDING: 'warning', ACTIVE: 'success', SUSPENDED: 'danger' },
  /** Worker requests from employers. */
  request: { OPEN: 'info', IN_PROGRESS: 'info', FILLED: 'success', CANCELLED: 'danger' },
  inquiry: { NEW: 'info', IN_PROGRESS: 'warning', DONE: 'success', ARCHIVED: 'neutral' },
  /** Agent / partner commissions. */
  commission: { PENDING: 'warning', APPROVED: 'info', PAID: 'success', CANCELLED: 'danger' },
  /** Alert / risk severities (upper and lower case variants exist). */
  severity: { HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral', high: 'danger', medium: 'warning', low: 'neutral' },
  urgency: { URGENT: 'danger', NORMAL: 'neutral', LOW: 'neutral', high: 'danger', medium: 'warning', low: 'success' },
  /** AI checks: ok / warn / fail style verdicts. */
  check: { ok: 'success', warn: 'warning', fail: 'danger', wrong_document: 'danger', unreadable: 'danger', skipped: 'neutral', none: 'neutral', muted: 'neutral', danger: 'danger' },
  campaign: { DRAFT: 'neutral', SCHEDULED: 'accent', SENDING: 'info', PAUSED: 'warning', COMPLETED: 'success', CANCELLED: 'danger' },
  recipient: { QUEUED: 'neutral', SENDING: 'info', SENT: 'success', FAILED: 'danger', SKIPPED: 'neutral', BOUNCED: 'danger' },
  /** Outbound messages (SMS / WhatsApp / e-mail). */
  outbound: { QUEUED: 'neutral', SENT: 'success', FAILED: 'danger', CONSOLE: 'warning' },
  call: {
    COMPLETED: 'success',
    IN_PROGRESS: 'info',
    RINGING: 'info',
    RINGING_STAFF: 'info',
    NO_ANSWER: 'warning',
    BUSY: 'warning',
    FAILED: 'danger',
    CANCELED: 'neutral',
    QUEUED: 'neutral',
  },
  liveChat: { WAITING: 'warning', ACTIVE: 'success', CLOSED: 'neutral', MISSED: 'danger' },
  automationRun: { RUNNING: 'info', WAITING: 'warning', SUCCEEDED: 'success', PARTIAL: 'warning', SKIPPED: 'neutral', FAILED: 'danger', PENDING: 'warning' },
  arrival: { DRAFT: 'neutral', SUBMITTED: 'info', CONFIRMED: 'success', COMPLETED: 'success', CANCELLED: 'danger' },
  housing: { NONE: 'neutral', REQUESTED: 'warning', SEARCHING: 'info', OFFERED: 'accent', ARRANGED: 'success' },
  translation: { NEW: 'info', QUOTED: 'warning', ACCEPTED: 'info', IN_PROGRESS: 'info', READY: 'success', DELIVERED: 'success', CANCELLED: 'danger' },
  privacy: { OPEN: 'info', IN_PROGRESS: 'warning', COMPLETED: 'success', REJECTED: 'danger', CANCELLED: 'danger' },
  review: { REQUESTED: 'neutral', PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger' },
  problemReport: { NEW: 'warning', IN_PROGRESS: 'info', DONE: 'success', WONT_FIX: 'neutral' },
  leave: { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' },
  publication: { DRAFT: 'neutral', PUBLISHED: 'success', CANCELLED: 'danger' },
  reward: { PENDING: 'warning', EARNED: 'success', PAID: 'success', USED: 'info', CANCELLED: 'danger' },
  /** Client-data confirmation and forms. */
  confirmation: { NONE: 'neutral', PENDING: 'info', REVIEW: 'warning', CONFIRMED: 'success', STALE: 'warning' },
  form: { DRAFT: 'neutral', SENT: 'info', SUBMITTED: 'warning', APPLIED: 'success', CANCELLED: 'danger' },
  shareLink: { active: 'success', expired: 'neutral', revoked: 'danger', exhausted: 'warning' },
  expiry: { ok: 'success', soon: 'warning', urgent: 'danger', expired: 'danger' },
  driveStage: { INCOMING: 'neutral', REVIEW: 'warning', TRANSLATION: 'info', APOSTILLE: 'accent', READY: 'success', SENT_TO_EMBASSY: 'info' },
  original: { IN_OFFICE: 'success', GIVEN_OUT: 'warning', AT_APOSTILLE: 'accent', IN_TRANSIT: 'info', DELIVERED: 'success', RETURNED_TO_CLIENT: 'neutral' },
  agentStage: { REGISTERED: 'neutral', DOCUMENTS: 'warning', CONTRACT: 'info', EMBASSY: 'info', APPROVED: 'success', CLOSED: 'neutral' },
  /** Aging receivables buckets. */
  aging: { '0-30': 'success', '31-60': 'warning', '61-90': 'warning', '90+': 'danger' },
  attendee: { NEEDS_ACTION: 'neutral', ACCEPTED: 'success', DECLINED: 'danger', TENTATIVE: 'warning' },
  /** Generic result flags. */
  result: { passed: 'success', failed: 'danger', pending: 'neutral' },
  /** Case "next step" callouts (caseNext). */
  nextStep: { urgent: 'danger', action: 'warning', info: 'info' },
  /** Whose move it is on a case (clientProcess ball-in-court). */
  ballSide: { CLIENT: 'warning', TEAM: 'info', EMBASSY: 'accent', NONE: 'neutral' },
  /** Employer view of a worker's pipeline stage (company/CompanyWorkers). */
  workerStage: {
    DOCUMENTS: 'warning',
    CONTRACT: 'info',
    EMBASSY: 'info',
    APPOINTMENT: 'accent',
    DECISION: 'info',
    APPROVED: 'success',
    ARRIVED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'danger',
  },
  /** Office visit assignment (automation/AssignmentPanel). */
  assignment: { ACTIVE: 'warning', RETURNED: 'success', KEPT: 'neutral' },
  /** Upload checklist readiness (drive/org/Readiness). */
  readiness: { missing: 'neutral', rejected: 'danger', pending: 'warning', ready: 'success' },
  /** German certificate state (portal German page). */
  certificate: { accepted: 'success', pending: 'warning', rejected: 'danger', missing: 'neutral' },
} as const satisfies Record<string, ToneMap>;

export type StatusDomain = keyof typeof STATUS_TONES;

/** Tone of a domain status; unknown values fall back to neutral (so new server statuses never crash). */
export const statusTone = (domain: StatusDomain, status: string | null | undefined): Tone =>
  (status != null ? (STATUS_TONES[domain] as ToneMap)[status] : undefined) ?? 'neutral';

/** Score thresholds used by match / NPS style numbers: high = success, middle = warning, low = danger. */
export const scoreTone = (score: number, good = 80, ok = 55): Tone => (score >= good ? 'success' : score >= ok ? 'warning' : 'danger');
