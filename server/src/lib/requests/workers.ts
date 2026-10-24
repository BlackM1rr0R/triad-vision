import type { ArrivalStatus, CaseStatus, VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { anonymisedProfile, anonymisedProfileSelect } from '../vacancies.js';
import { buildXlsx, type Cell } from '../xlsx.js';

/**
 * Employer worker tracking panel: every case placed with the company, with its stage, key dates, planned
 * arrival and next interview. Only what employers already see (anonymised name, profession, visa) plus
 * stage and dates — no documents, passport data or contact details.
 */

/** Candidate-portal steps: documents, contract, embassy documents, appointment, decision, result. */
export const STEP: Record<CaseStatus, number> = {
  DOCUMENTS_PENDING: 0,
  DOCUMENTS_REVIEW: 0,
  CONTRACT_SENT: 1,
  CONTRACT_SIGNED: 1,
  EMBASSY_DOCUMENTS: 2,
  EMBASSY_REVIEW: 2,
  APPOINTMENT_SCHEDULED: 3,
  DECISION_PENDING: 4,
  APPROVED: 5,
  REJECTED: 5,
  CANCELLED: -1,
};
export const STEP_COUNT = 6;

export const STAGES = ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION', 'APPROVED', 'ARRIVED', 'REJECTED', 'CANCELLED'] as const;
export type Stage = (typeof STAGES)[number];

const STAGE_OF: Record<CaseStatus, Stage> = {
  DOCUMENTS_PENDING: 'DOCUMENTS',
  DOCUMENTS_REVIEW: 'DOCUMENTS',
  CONTRACT_SENT: 'CONTRACT',
  CONTRACT_SIGNED: 'CONTRACT',
  EMBASSY_DOCUMENTS: 'EMBASSY',
  EMBASSY_REVIEW: 'EMBASSY',
  APPOINTMENT_SCHEDULED: 'APPOINTMENT',
  DECISION_PENDING: 'DECISION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

const arrived = (a: { status: ArrivalStatus; arrivalTime: Date | null; flightDate: Date | null } | null, now: Date) => {
  if (!a) return false;
  if (a.status === 'COMPLETED') return true;
  const when = a.arrivalTime ?? a.flightDate;
  return a.status === 'CONFIRMED' && !!when && when <= now;
};

export interface WorkerRow {
  id: string;
  name: string;
  profession: string;
  visaType: VisaType;
  status: CaseStatus;
  step: number;
  stage: Stage;
  stageSince: Date;
  daysInStage: number;
  startedAt: Date;
  appointmentAt: Date | null;
  decisionAt: Date | null;
  visaValidFrom: Date | null;
  expectedDecision: { from: Date; to: Date } | null;
  arrival: { status: ArrivalStatus; flightDate: Date | null; arrivalTime: Date | null } | null;
  nextInterview: { startsAt: Date; endsAt: Date; status: string } | null;
  timeline: { stage: Stage; at: Date }[];
  vacancy: { id: string; title: unknown } | null;
  visa: { title: unknown; visaLabel: string } | null;
}

export const listWorkers = async (companyId: string, now = new Date()): Promise<WorkerRow[]> => {
  const cases = await prisma.case.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      clientId: true,
      status: true,
      profession: true,
      visaType: true,
      createdAt: true,
      appointmentAt: true,
      decisionAt: true,
      visaValidFrom: true,
      client: { select: anonymisedProfileSelect },
      vacancy: { select: { id: true, title: true } },
      visaCategory: { select: { title: true, visaLabel: true, processingMin: true, processingMax: true } },
      arrivalPlan: { select: { status: true, flightDate: true, arrivalTime: true } },
      events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
    },
  });
  const interviews = cases.length
    ? await prisma.interview.findMany({
        where: { companyId, candidateId: { in: cases.map((c) => c.clientId) }, startsAt: { gte: now }, status: { in: ['PROPOSED', 'CONFIRMED'] } },
        orderBy: { startsAt: 'asc' },
        select: { candidateId: true, startsAt: true, endsAt: true, status: true },
      })
    : [];

  return cases.map((c) => {
    const vc = c.visaCategory;
    const expected =
      vc?.processingMin != null && vc.processingMax != null && !['APPROVED', 'REJECTED', 'CANCELLED'].includes(c.status)
        ? { from: new Date(c.createdAt.getTime() + vc.processingMin * WEEK), to: new Date(c.createdAt.getTime() + vc.processingMax * WEEK) }
        : null;
    const plan = c.arrivalPlan && c.arrivalPlan.status !== 'CANCELLED' ? c.arrivalPlan : null;
    const isArrived = c.status === 'APPROVED' && arrived(plan, now);
    const stage: Stage = isArrived ? 'ARRIVED' : STAGE_OF[c.status];

    // First time the case entered each stage (status events), starting with the documents stage at creation.
    const timeline: { stage: Stage; at: Date }[] = [{ stage: 'DOCUMENTS', at: c.createdAt }];
    let last: Stage = 'DOCUMENTS';
    for (const e of c.events) {
      const s = STAGE_OF[e.toStatus!];
      if (s !== last) {
        // Going back (e.g. documents re-requested) restarts that stage.
        const i = timeline.findIndex((t) => t.stage === s);
        if (i >= 0) timeline.splice(i);
        timeline.push({ stage: s, at: e.createdAt });
        last = s;
      }
    }
    if (timeline[timeline.length - 1].stage !== STAGE_OF[c.status]) timeline.push({ stage: STAGE_OF[c.status], at: c.events.at(-1)?.createdAt ?? c.createdAt });
    if (isArrived) timeline.push({ stage: 'ARRIVED', at: plan!.arrivalTime ?? plan!.flightDate ?? now });
    const stageSince = timeline[timeline.length - 1].at;
    const next = interviews.find((i) => i.candidateId === c.clientId);

    return {
      id: c.id,
      name: anonymisedProfile(c.client).name,
      profession: c.profession,
      visaType: c.visaType,
      status: c.status,
      step: STEP[c.status],
      stage,
      stageSince,
      daysInStage: Math.max(0, Math.floor((now.getTime() - stageSince.getTime()) / DAY)),
      startedAt: c.createdAt,
      appointmentAt: c.appointmentAt,
      decisionAt: c.decisionAt,
      visaValidFrom: c.visaValidFrom,
      expectedDecision: expected,
      arrival: plan ? { status: plan.status, flightDate: plan.flightDate, arrivalTime: plan.arrivalTime } : null,
      nextInterview: next ? { startsAt: next.startsAt, endsAt: next.endsAt, status: next.status } : null,
      timeline,
      vacancy: c.vacancy,
      visa: vc ? { title: vc.title, visaLabel: vc.visaLabel } : null,
    };
  });
};

/** Planned arrival moment (landing time, else flight date). */
export const plannedArrival = (w: Pick<WorkerRow, 'arrival'>) => w.arrival?.arrivalTime ?? w.arrival?.flightDate ?? null;

export const workerSummary = (items: WorkerRow[], now = new Date()) => {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    inProcess: items.filter((w) => ['DOCUMENTS', 'CONTRACT', 'EMBASSY', 'APPOINTMENT', 'DECISION'].includes(w.stage)).length,
    approved: items.filter((w) => w.stage === 'APPROVED').length,
    arrivingThisMonth: items.filter((w) => {
      const a = plannedArrival(w);
      return w.stage === 'APPROVED' && !!a && a >= monthStart && a < monthEnd;
    }).length,
    arrived: items.filter((w) => w.stage === 'ARRIVED').length,
  };
};

// ─── Excel export ───────────────────────────────────────────────────────

type Loc = 'az' | 'de' | 'en' | 'ru';

const HEADERS: Record<Loc, string[]> = {
  de: ['Name', 'Beruf', 'Stelle', 'Visumart', 'Visum', 'Phase', 'Tage in Phase', 'Beginn', 'Botschaftstermin', 'Entscheidung', 'Visum gültig ab', 'Geplante Ankunft', 'Ankunftsstatus', 'Nächstes Interview'],
  en: ['Name', 'Profession', 'Vacancy', 'Visa type', 'Visa', 'Stage', 'Days in stage', 'Started', 'Embassy appointment', 'Decision', 'Visa valid from', 'Planned arrival', 'Arrival status', 'Next interview'],
  az: ['Ad', 'Peşə', 'Vakansiya', 'Viza növü', 'Viza', 'Mərhələ', 'Mərhələdə gün', 'Başlama', 'Səfirlik görüşü', 'Qərar', 'Viza etibarlıdır', 'Planlanan gəliş', 'Gəliş statusu', 'Növbəti müsahibə'],
  ru: ['Имя', 'Профессия', 'Вакансия', 'Тип визы', 'Виза', 'Этап', 'Дней на этапе', 'Начало', 'Запись в посольство', 'Решение', 'Виза с', 'Плановый приезд', 'Статус приезда', 'Следующее интервью'],
};

export const STAGE_TEXT: Record<Loc, Record<Stage, string>> = {
  de: { DOCUMENTS: 'Dokumente', CONTRACT: 'Vertrag', EMBASSY: 'Botschaftsunterlagen', APPOINTMENT: 'Botschaftstermin', DECISION: 'Entscheidung', APPROVED: 'Visum erteilt', ARRIVED: 'Angekommen', REJECTED: 'Abgelehnt', CANCELLED: 'Abgebrochen' },
  en: { DOCUMENTS: 'Documents', CONTRACT: 'Contract', EMBASSY: 'Embassy documents', APPOINTMENT: 'Embassy appointment', DECISION: 'Decision', APPROVED: 'Visa approved', ARRIVED: 'Arrived', REJECTED: 'Rejected', CANCELLED: 'Cancelled' },
  az: { DOCUMENTS: 'Sənədlər', CONTRACT: 'Müqavilə', EMBASSY: 'Səfirlik sənədləri', APPOINTMENT: 'Səfirlik görüşü', DECISION: 'Qərar', APPROVED: 'Viza verildi', ARRIVED: 'Gəldi', REJECTED: 'Rədd edildi', CANCELLED: 'Ləğv edildi' },
  ru: { DOCUMENTS: 'Документы', CONTRACT: 'Договор', EMBASSY: 'Документы для посольства', APPOINTMENT: 'Запись в посольство', DECISION: 'Решение', APPROVED: 'Виза выдана', ARRIVED: 'Прибыл', REJECTED: 'Отказ', CANCELLED: 'Отменено' },
};

const VISA_TYPE_TEXT: Record<Loc, Record<VisaType, string>> = {
  de: { WORK: 'Arbeit', AUSBILDUNG: 'Ausbildung', WEITERBILDUNG: 'Weiterbildung', JOB_SEEKER: 'Chancenkarte', STUDY: 'Studium', FAMILY: 'Familiennachzug', TOURIST: 'Besuch' },
  en: { WORK: 'Work', AUSBILDUNG: 'Vocational training', WEITERBILDUNG: 'Further training', JOB_SEEKER: 'Job seeker', STUDY: 'Study', FAMILY: 'Family reunion', TOURIST: 'Visitor' },
  az: { WORK: 'İş', AUSBILDUNG: 'Peşə təhsili', WEITERBILDUNG: 'İxtisasartırma', JOB_SEEKER: 'İş axtarışı', STUDY: 'Təhsil', FAMILY: 'Ailə birləşməsi', TOURIST: 'Turist' },
  ru: { WORK: 'Работа', AUSBILDUNG: 'Профобучение', WEITERBILDUNG: 'Повышение квалификации', JOB_SEEKER: 'Поиск работы', STUDY: 'Учёба', FAMILY: 'Воссоединение семьи', TOURIST: 'Гостевая' },
};

const ARRIVAL_TEXT: Record<Loc, Record<ArrivalStatus, string>> = {
  de: { DRAFT: 'In Planung', SUBMITTED: 'Gemeldet', CONFIRMED: 'Bestätigt', COMPLETED: 'Angekommen', CANCELLED: 'Storniert' },
  en: { DRAFT: 'Planning', SUBMITTED: 'Submitted', CONFIRMED: 'Confirmed', COMPLETED: 'Arrived', CANCELLED: 'Cancelled' },
  az: { DRAFT: 'Planlaşdırılır', SUBMITTED: 'Göndərilib', CONFIRMED: 'Təsdiqlənib', COMPLETED: 'Gəldi', CANCELLED: 'Ləğv edilib' },
  ru: { DRAFT: 'Планируется', SUBMITTED: 'Отправлен', CONFIRMED: 'Подтверждён', COMPLETED: 'Прибыл', CANCELLED: 'Отменён' },
};

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const dateTime = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '');
const pick = (v: unknown, l: Loc) => {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, string>;
  return o[l] || o.de || o.en || o.az || '';
};

export const workersXlsx = (items: WorkerRow[], locale: Loc) => {
  const rows: Cell[][] = items.map((w) => [
    w.name,
    w.profession,
    w.vacancy ? pick(w.vacancy.title, locale) : '',
    VISA_TYPE_TEXT[locale][w.visaType],
    w.visa?.visaLabel ?? '',
    STAGE_TEXT[locale][w.stage],
    w.daysInStage,
    day(w.startedAt),
    dateTime(w.appointmentAt),
    day(w.decisionAt),
    day(w.visaValidFrom),
    dateTime(plannedArrival(w)),
    w.arrival ? ARRIVAL_TEXT[locale][w.arrival.status] : '',
    dateTime(w.nextInterview?.startsAt),
  ]);
  const sheet = { de: 'Mitarbeiter', en: 'Workers', az: 'İşçilər', ru: 'Сотрудники' }[locale];
  return buildXlsx(sheet, HEADERS[locale], rows, [22, 22, 26, 18, 12, 22, 12, 12, 18, 12, 14, 18, 16, 18]);
};
