import { prisma } from '../../db.js';
import { buildPanel, type NextAction, type PanelRow } from '../employerWorkers/panel.js';
import { plannedArrival } from '../requests/workers.js';
import { FINAL_PROCESS_STATUSES } from '../recognition/rules.js';
import {
  PIPELINE_STAGES,
  TYPICAL_STAGE_DAYS,
  arrivalStrip,
  daysBetween,
  expectedArrival,
  expectedFirstDay,
  resolveStage,
  type DateSource,
  type PipelineStage,
} from './stages.js';

/**
 * Employer candidate pipeline (company portal → /company/pipeline): every worker of the company's vacancies /
 * requests as a card moving through contract → recognition → embassy documents → visa decision → flight →
 * arrived → first work day.
 *
 * Built on the "My workers" panel (lib/employerWorkers/panel.buildPanel), so it is scoped to the company's own
 * cases and carries exactly what the panel already shows (anonymised name "Ali M.", position, profession, visa
 * label, stage, dates, the employer's own open items, the case manager). It adds only facts derived from them:
 * the pipeline column, days in it, the expected arrival / first work day (actual, from the arrival plan / the
 * employer's checklist / the contract, else an estimate from typical stage durations) and, as blocker, the count
 * of open items of the employer's own arrival checklist. Recognition contributes only "a procedure is open" —
 * never authority, deficits, letters or notes.
 */

const DAY = 24 * 60 * 60 * 1000;

export type BlockerCode = 'CONTRACT_UNSIGNED' | 'SIGN_DOCUMENT' | 'COMPLETE_FORM' | 'ACCELERATED_STEP' | 'ANSWER_CHECKIN' | 'ARRIVAL_CHECKLIST';

export interface Blocker {
  code: BlockerCode;
  /** Signature / form title (German, as in the panel); empty for the checklist. */
  title: string;
  link: string | null;
  since: Date | null;
  /** ACCELERATED_STEP: SIGN_AGREEMENT | PAY_FEE; ARRIVAL_CHECKLIST: open / total items. */
  params?: Record<string, string | number>;
}

export interface PipelineCard {
  id: string;
  name: string;
  position: string;
  profession: string;
  visaType: PanelRow['visaType'];
  visaLabel: string | null;
  stage: PipelineStage;
  stageSince: Date;
  daysInStage: number;
  /** Typical length of the stage (null for FIRST_DAY); `slow` when the card is in it for longer. */
  typicalDays: number | null;
  slow: boolean;
  /** The case includes a recognition procedure (the column is part of this worker's path). */
  hasRecognition: boolean;
  expectedArrival: { at: Date; source: DateSource } | null;
  firstWorkDay: { at: Date; source: DateSource } | null;
  blockers: Blocker[];
  nextAction: NextAction;
  manager: { name: string; email: string } | null;
}

/** First work day of the arrival checklist only counts when the employer set it there. */
const ARRIVAL_STAGES: PipelineStage[] = ['FLIGHT', 'ARRIVED'];

export const buildPipeline = async (companyId: string, now = new Date(), viewerId?: string) => {
  const rows = await buildPanel(companyId, now, viewerId);
  const ids = rows.map((r) => r.id);
  const signatureIds = rows.flatMap((r) => r.openItems.filter((i) => i.kind === 'SIGNATURE').map((i) => i.id));
  const [lastStatus, recognitions, checklist, contracts] = ids.length
    ? await Promise.all([
        prisma.caseEvent.groupBy({ by: ['caseId'], where: { caseId: { in: ids }, toStatus: { not: null } }, _max: { createdAt: true } }),
        prisma.recognitionProcess.findMany({ where: { caseId: { in: ids } }, select: { caseId: true, status: true, createdAt: true } }),
        prisma.employerArrivalItem.findMany({ where: { caseId: { in: ids }, companyId }, select: { caseId: true, key: true, done: true, dueDate: true } }),
        signatureIds.length ? prisma.signatureRequest.findMany({ where: { id: { in: signatureIds }, isCaseContract: true }, select: { id: true } }) : Promise.resolve([]),
      ])
    : [[], [], [], []];
  const statusSince = new Map(lastStatus.map((g) => [g.caseId, g._max.createdAt]));
  const contractSignatures = new Set(contracts.map((c) => c.id));

  const cards: PipelineCard[] = [];
  for (const r of rows) {
    const recs = recognitions.filter((p) => p.caseId === r.id);
    const open = recs.filter((p) => !(FINAL_PROCESS_STATUSES as readonly string[]).includes(p.status)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    const items = checklist.filter((i) => i.caseId === r.id);
    const checklistFirstDay = items.find((i) => i.key === 'FIRST_DAY')?.dueDate ?? null;
    const firstWorkDayDate = checklistFirstDay ?? r.contractStart;

    const resolved = resolveStage({
      stage: r.stage,
      phase: r.phase,
      status: r.status,
      startedAt: r.startedAt,
      timeline: r.timeline,
      statusSince: statusSince.get(r.id) ?? r.startedAt,
      recognition: open ? { since: open.createdAt } : null,
      arrivedAt: r.arrivedAt,
      firstWorkDay: firstWorkDayDate,
      now,
    });
    if (!resolved) continue;

    const decisionTo = r.next?.code === 'DECISION' && r.next.to ? r.next.to : (r.expectedDecision?.to ?? null);
    const arrival = expectedArrival({ stage: resolved.stage, since: resolved.since, now, arrivedAt: r.arrivedAt, flightAt: plannedArrival(r), openRecognition: !!open, decisionTo });
    const firstDay = expectedFirstDay(firstWorkDayDate, arrival);

    const blockers: Blocker[] = [];
    for (const i of r.openItems) {
      if (i.kind === 'SIGNATURE') blockers.push({ code: contractSignatures.has(i.id) ? 'CONTRACT_UNSIGNED' : 'SIGN_DOCUMENT', title: i.title, link: i.link, since: i.since });
      else if (i.kind === 'FORM') blockers.push({ code: 'COMPLETE_FORM', title: i.title, link: i.link, since: i.since });
      else if (i.kind === 'ACCELERATED') blockers.push({ code: 'ACCELERATED_STEP', title: i.title, link: null, since: i.since, params: { step: i.id.split(':')[1] ?? '' } });
      else if (i.kind === 'CHECKIN') blockers.push({ code: 'ANSWER_CHECKIN', title: i.title, link: i.link, since: i.since });
    }
    const openChecklist = items.filter((i) => !i.done).length;
    if (ARRIVAL_STAGES.includes(resolved.stage) && openChecklist > 0) {
      blockers.push({ code: 'ARRIVAL_CHECKLIST', title: '', link: `/company/workers?worker=${r.id}`, since: null, params: { open: openChecklist, total: items.length } });
    }

    const daysInStage = daysBetween(resolved.since, now);
    const typicalDays = resolved.stage === 'FIRST_DAY' ? null : TYPICAL_STAGE_DAYS[resolved.stage];
    cards.push({
      id: r.id,
      name: r.name,
      position: r.position,
      profession: r.profession,
      visaType: r.visaType,
      visaLabel: r.visa?.visaLabel ?? null,
      stage: resolved.stage,
      stageSince: resolved.since,
      daysInStage,
      typicalDays,
      slow: typicalDays !== null && daysInStage > typicalDays,
      hasRecognition: recs.length > 0,
      expectedArrival: arrival,
      firstWorkDay: firstDay,
      blockers,
      nextAction: r.nextAction,
      manager: r.manager,
    });
  }

  const order = new Map(PIPELINE_STAGES.map((s, i) => [s, i]));
  cards.sort((a, b) => order.get(a.stage)! - order.get(b.stage)! || b.blockers.length - a.blockers.length || b.daysInStage - a.daysInStage || a.name.localeCompare(b.name));

  const in30 = now.getTime() + 30 * DAY;
  const byStage = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, cards.filter((c) => c.stage === s).length])) as Record<PipelineStage, number>;
  const upcoming = (c: PipelineCard) => !!c.expectedArrival && c.expectedArrival.source !== 'ACTUAL' && c.expectedArrival.at.getTime() >= now.getTime() && c.expectedArrival.at.getTime() <= in30;
  return {
    stages: PIPELINE_STAGES,
    typicalDays: TYPICAL_STAGE_DAYS,
    cards,
    strip: arrivalStrip(cards, now),
    summary: {
      total: cards.length,
      byStage,
      withBlockers: cards.filter((c) => c.blockers.length > 0).length,
      blockers: cards.reduce((a, c) => a + c.blockers.length, 0),
      arrivingNext30: cards.filter(upcoming).length,
      slow: cards.filter((c) => c.slow).length,
    },
    generatedAt: now,
  };
};

export type Pipeline = Awaited<ReturnType<typeof buildPipeline>>;
