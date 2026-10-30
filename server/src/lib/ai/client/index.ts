import { z } from 'zod';
import type { CaseStatus, DocStage, Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../../db.js';
import type { AiTool, AiToolContext, AnyAiTool } from '../types.js';
import { forecastForCase } from '../../journey/forecast.js';
import { calculateSalary, type TaxClass } from './salary/calc.js';
import { askConsultant } from './handover.js';

/**
 * Client tools (scope CLIENT): read-only and always limited to the calling user's own records
 * (every query filters by ctx.user.id). They never return internal staff notes, other people's
 * data or full passport numbers.
 */

type Lang = 'az' | 'de' | 'en' | 'ru';
const langOf = (ctx: AiToolContext): Lang => (['az', 'de', 'en', 'ru'].includes(ctx.user.locale) ? (ctx.user.locale as Lang) : 'az');
/** Reads a CMS { az, de, en, ru } value in the user's language. */
const tr = (v: Prisma.JsonValue | null | undefined, l: Lang): string => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return typeof v === 'string' ? v : '';
  const o = v as Record<string, unknown>;
  return String(o[l] || o.az || o.en || o.de || '');
};
const trList = (v: Prisma.JsonValue | null | undefined, l: Lang): string[] => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  const o = v as Record<string, unknown>;
  const list = o[l] ?? o.az ?? o.en;
  return Array.isArray(list) ? list.map(String) : [];
};
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const when = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null);

const noArgs = { type: 'object', properties: {}, additionalProperties: false } as const;

export const STATUS_TEXT: Record<CaseStatus, { plain: string; step: string; next: string }> = {
  DOCUMENTS_PENDING: { plain: 'Waiting for your first documents', step: 'Documents', next: 'Upload the required documents in your application (section "Documents") and press submit.' },
  DOCUMENTS_REVIEW: { plain: 'Your documents are being checked by the team', step: 'Documents', next: 'Nothing to do right now; you will be notified if something must be fixed.' },
  CONTRACT_SENT: { plain: 'The contract was sent to you for signature', step: 'Contract', next: 'Read and sign the contract in your application or under "Documents to sign".' },
  CONTRACT_SIGNED: { plain: 'Your signed contract is being verified', step: 'Contract', next: 'Nothing to do right now.' },
  EMBASSY_DOCUMENTS: { plain: 'Waiting for your embassy documents', step: 'Embassy', next: 'Upload the embassy documents listed in your application.' },
  EMBASSY_REVIEW: { plain: 'Your embassy documents are being checked', step: 'Embassy', next: 'Nothing to do right now; the team prepares your embassy file.' },
  APPOINTMENT_SCHEDULED: { plain: 'Your embassy appointment is booked', step: 'Appointment', next: 'Prepare for the appointment: bring all originals and practise the interview questions.' },
  DECISION_PENDING: { plain: 'Your application is at the embassy, waiting for the decision', step: 'Decision', next: 'Wait for the decision; the team informs you as soon as it arrives.' },
  APPROVED: { plain: 'Visa approved', step: 'Done', next: 'Plan your arrival (section "Arrival") and follow the onboarding checklist.' },
  REJECTED: { plain: 'The application was rejected', step: 'Done', next: 'Talk to your case manager about the reasons and options.' },
  CANCELLED: { plain: 'The application was cancelled', step: 'Done', next: 'Contact your case manager if you want to start again.' },
};

const CURRENT_STAGE: Partial<Record<CaseStatus, DocStage>> = {
  DOCUMENTS_PENDING: 'INITIAL',
  DOCUMENTS_REVIEW: 'INITIAL',
  EMBASSY_DOCUMENTS: 'EMBASSY',
  EMBASSY_REVIEW: 'EMBASSY',
};

const ownCases = (userId: string) =>
  prisma.case.findMany({
    where: { clientId: userId },
    orderBy: [{ closedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    take: 10,
    select: {
      id: true,
      number: true,
      status: true,
      visaType: true,
      profession: true,
      staffNote: true,
      appointmentAt: true,
      appointmentPlace: true,
      decisionAt: true,
      visaValidFrom: true,
      visaValidTo: true,
      createdAt: true,
      closedAt: true,
      visaCategory: { select: { title: true, visaLabel: true, slug: true } },
      assignedStaff: { select: { firstName: true } },
    },
  });

/** A case id given by the model must belong to the caller; otherwise the newest open case. */
const pickOwnCase = async (userId: string, caseId?: string) => {
  if (caseId) {
    const c = await prisma.case.findFirst({ where: { id: caseId, clientId: userId }, select: { id: true } });
    return c?.id ?? null;
  }
  const c =
    (await prisma.case.findFirst({ where: { clientId: userId, closedAt: null }, orderBy: [{ parentCaseId: 'asc' }, { createdAt: 'desc' }], select: { id: true } })) ??
    (await prisma.case.findFirst({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true } }));
  return c?.id ?? null;
};

const myCases: AiTool<Record<string, never>> = {
  name: 'my_cases',
  scope: 'CLIENT',
  description: "The user's own visa applications: status in plain words, journey step, next action, visa type and category, appointment date/place, assigned manager's first name, note from the team, estimated decision window.",
  schema: z.object({}).strict(),
  parameters: noArgs,
  label: { az: 'Müraciətinizə baxıram…', de: 'Ich sehe mir Ihren Antrag an…', en: 'Checking your application…', ru: 'Смотрю вашу заявку…' },
  run: async (_args, ctx) => {
    const l = langOf(ctx);
    const cases = await ownCases(ctx.user.id);
    if (!cases.length) return { cases: [], hint: 'The user has no application yet. They can start one from the account dashboard (/account#start) or book a consultation (/booking).' };
    return {
      cases: await Promise.all(
        cases.map(async (c) => {
          let estimatedDecision: { from: string | null; to: string | null } | null = null;
          if (!c.closedAt) {
            try {
              const f = await forecastForCase(c.id);
              estimatedDecision = f.estimatedDecision ? { from: day(f.estimatedDecision.from), to: day(f.estimatedDecision.to) } : null;
            } catch {
              estimatedDecision = null;
            }
          }
          const s = STATUS_TEXT[c.status];
          return {
            caseId: c.id,
            number: c.number,
            status: c.status,
            statusPlain: s.plain,
            journeyStep: s.step,
            nextAction: s.next,
            visaType: c.visaType,
            category: c.visaCategory ? `${tr(c.visaCategory.title, l)} (${c.visaCategory.visaLabel})` : null,
            profession: c.profession,
            noteFromTeam: c.staffNote || null,
            appointment: c.appointmentAt ? { at: when(c.appointmentAt), place: c.appointmentPlace } : null,
            decisionAt: day(c.decisionAt),
            visaValid: c.visaValidFrom || c.visaValidTo ? { from: day(c.visaValidFrom), to: day(c.visaValidTo) } : null,
            estimatedDecision,
            caseManager: c.assignedStaff?.firstName ?? null,
            startedAt: day(c.createdAt),
            link: `/account/cases/${c.id}`,
          };
        }),
      ),
    };
  },
};

const requiredDocs: AiTool<{ caseId?: string }> = {
  name: 'my_required_documents',
  scope: 'CLIENT',
  description: "Documents required for the user's application (newest open one unless caseId is given): status of each (missing / waiting for review / accepted / rejected with the reason) and what to upload next.",
  schema: z.object({ caseId: z.string().max(40).optional() }).strict(),
  parameters: { type: 'object', properties: { caseId: { type: 'string', description: 'Optional case id from my_cases' } }, additionalProperties: false },
  label: { az: 'Sənədlərinizə baxıram…', de: 'Ich prüfe Ihre Dokumente…', en: 'Checking your documents…', ru: 'Проверяю ваши документы…' },
  run: async ({ caseId }, ctx) => {
    const l = langOf(ctx);
    const id = await pickOwnCase(ctx.user.id, caseId);
    if (!id) return { error: caseId ? 'case_not_found' : 'no_case' };
    const c = await prisma.case.findFirstOrThrow({
      where: { id, clientId: ctx.user.id },
      select: {
        id: true,
        number: true,
        status: true,
        requirements: {
          orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
          select: {
            stage: true,
            title: true,
            description: true,
            required: true,
            documents: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true, reviewNote: true, createdAt: true, originalName: true } },
          },
        },
      },
    });
    const current = CURRENT_STAGE[c.status];
    const docs = c.requirements.map((r) => {
      const d = r.documents[0];
      const state = !d ? 'missing' : d.status === 'PENDING' ? 'waiting_for_review' : d.status === 'ACCEPTED' ? 'accepted' : 'rejected';
      return {
        stage: r.stage,
        title: tr(r.title, l),
        hint: tr(r.description, l) || null,
        required: r.required,
        state,
        rejectionReason: state === 'rejected' ? d?.reviewNote || null : null,
        lastUpload: d ? { file: d.originalName, at: day(d.createdAt) } : null,
      };
    });
    const uploadNext = docs.filter((d) => (d.state === 'missing' || d.state === 'rejected') && d.required && (!current || d.stage === current)).map((d) => d.title);
    return {
      case: { caseId: c.id, number: c.number, status: c.status, currentDocumentStage: current ?? null },
      documents: docs,
      uploadNext,
      link: `/account/cases/${c.id}${current ? `#docs-${current.toLowerCase()}` : ''}`,
    };
  },
};

const deadlines: AiTool<Record<string, never>> = {
  name: 'my_appointments_and_deadlines',
  scope: 'CLIENT',
  description: "The user's upcoming dates: embassy appointments, interviews, documents waiting for their signature, translation orders with due dates, and their arrival plan (flight, pickup, housing).",
  schema: z.object({}).strict(),
  parameters: noArgs,
  label: { az: 'Tarixlərinizə baxıram…', de: 'Ich sehe mir Ihre Termine an…', en: 'Checking your dates…', ru: 'Смотрю ваши сроки…' },
  run: async (_args, ctx) => {
    const uid = ctx.user.id;
    const now = new Date();
    const [cases, interviews, signers, translations, arrival] = await Promise.all([
      prisma.case.findMany({ where: { clientId: uid, appointmentAt: { not: null } }, select: { id: true, number: true, status: true, appointmentAt: true, appointmentPlace: true } }),
      prisma.interview.findMany({
        where: { candidateId: uid, startsAt: { gte: new Date(now.getTime() - 86_400_000) }, status: { in: ['PROPOSED', 'CONFIRMED'] } },
        orderBy: { startsAt: 'asc' },
        take: 10,
        select: { startsAt: true, endsAt: true, status: true, meetingUrl: true, company: { select: { name: true } } },
      }),
      prisma.signatureSigner.findMany({
        where: { userId: uid, status: { in: ['PENDING', 'VIEWED'] }, request: { status: 'SENT' } },
        take: 10,
        select: { id: true, invitedAt: true, request: { select: { title: true, expiresAt: true } } },
      }),
      prisma.translationOrder.findMany({
        where: { clientId: uid, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { number: true, status: true, dueAt: true, service: true, targetLang: true, priceCents: true, currency: true },
      }),
      prisma.arrivalPlan.findFirst({
        where: { clientId: uid, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        select: { status: true, flightDate: true, flightNumber: true, arrivalAirport: true, arrivalTime: true, pickupRequested: true, pickupConfirmed: true, pickupDetails: true, housingStatus: true, housingCity: true, housingDetails: true, housingFrom: true },
      }),
    ]);
    return {
      embassyAppointments: cases
        .filter((c) => c.appointmentAt && (c.appointmentAt >= new Date(now.getTime() - 86_400_000) || c.status === 'APPOINTMENT_SCHEDULED'))
        .map((c) => ({ caseNumber: c.number, at: when(c.appointmentAt), place: c.appointmentPlace, link: `/account/cases/${c.id}` })),
      interviews: interviews.map((i) => ({ at: when(i.startsAt), until: when(i.endsAt), status: i.status, employer: i.company?.name ?? null, online: !!i.meetingUrl, link: '/account/interviews' })),
      waitingForSignature: signers.map((s) => ({ title: s.request.title, sentAt: day(s.invitedAt), expiresAt: day(s.request.expiresAt), link: `/account/signatures/${s.id}` })),
      translations: translations.map((t) => ({
        order: `TR-${String(t.number).padStart(4, '0')}`,
        status: t.status,
        service: t.service,
        targetLanguage: t.targetLang,
        dueAt: day(t.dueAt),
        price: t.priceCents !== null ? `${(t.priceCents / 100).toFixed(2)} ${t.currency}` : null,
        link: '/account/translations',
      })),
      arrival: arrival
        ? {
            status: arrival.status,
            flight: arrival.flightDate ? { date: day(arrival.flightDate), number: arrival.flightNumber, airport: arrival.arrivalAirport, arrivalTime: when(arrival.arrivalTime) } : null,
            pickup: arrival.pickupRequested ? { confirmed: arrival.pickupConfirmed, details: arrival.pickupDetails } : null,
            housing: arrival.housingStatus !== 'NONE' ? { status: arrival.housingStatus, city: arrival.housingCity, from: day(arrival.housingFrom), details: arrival.housingDetails } : null,
            link: '/account/arrival',
          }
        : null,
    };
  },
};

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;

const prepQuestions: AiTool<{ kind?: 'EMBASSY' | 'EMPLOYER'; category?: string; limit?: number }> = {
  name: 'interview_prep_questions',
  scope: 'CLIENT',
  description: "Interview practice questions (embassy visa interview or employer job interview) for the user's visa type, each with a German model answer and tips. Use when the user wants to prepare for an interview.",
  schema: z.object({ kind: z.enum(['EMBASSY', 'EMPLOYER']).optional(), category: z.string().max(40).optional(), limit: z.number().int().min(1).max(15).optional() }).strict(),
  parameters: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['EMBASSY', 'EMPLOYER'], description: 'Default EMBASSY' },
      category: { type: 'string', description: 'Optional: personal, motivation, job, germany, family, finances, language' },
      limit: { type: 'integer', minimum: 1, maximum: 15 },
    },
    additionalProperties: false,
  },
  label: { az: 'Müsahibə suallarını hazırlayıram…', de: 'Ich suche Interviewfragen heraus…', en: 'Picking interview questions…', ru: 'Подбираю вопросы для собеседования…' },
  run: async ({ kind = 'EMBASSY', category, limit = 8 }, ctx) => {
    const l = langOf(ctx);
    const c =
      (await prisma.case.findFirst({ where: { clientId: ctx.user.id, closedAt: null }, orderBy: { createdAt: 'desc' }, select: { visaType: true } })) ??
      (await prisma.case.findFirst({ where: { clientId: ctx.user.id }, orderBy: { createdAt: 'desc' }, select: { visaType: true } }));
    const visaType: VisaType | null = c?.visaType ?? null;
    const rows = await prisma.interviewPrepQuestion.findMany({
      where: { published: true, kind, ...(category ? { category } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      select: { category: true, question: true, answerDe: true, tips: true, visaTypes: true },
    });
    const fits = (v: Prisma.JsonValue | null) => !visaType || !Array.isArray(v) || v.length === 0 || v.includes(visaType);
    const items = rows.filter((r) => fits(r.visaTypes)).slice(0, limit);
    return {
      visaType,
      kind,
      questions: items.map((q) => ({ category: q.category, question: tr(q.question, l), questionDe: tr(q.question, 'de'), modelAnswerDe: q.answerDe, tips: tr(q.tips, l) || null })),
      practiceLink: '/account/interview-prep',
      visaTypes: VISA_TYPES,
    };
  },
};

/** Plain text of markdown / CMS bodies for excerpts. */
const plain = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/[#*_`>|[\]()-]+/g, ' ').replace(/\s+/g, ' ').trim();
const excerptOf = (text: string, terms: string[], len = 220) => {
  const p = plain(text);
  const low = p.toLowerCase();
  const at = terms.map((t) => low.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 60);
  return `${start > 0 ? '…' : ''}${p.slice(start, start + len)}${start + len < p.length ? '…' : ''}`;
};
const scoreOf = (text: string, terms: string[]) => {
  const low = text.toLowerCase();
  return terms.reduce((a, t) => a + (low.includes(t) ? 1 : 0), 0);
};

const knowledge: AiTool<{ query: string }> = {
  name: 'knowledge_search',
  scope: 'CLIENT',
  description: "Searches Triad Vision's published help content: FAQs, visa category pages (requirements, documents, salary, processing time), news/guide articles and public help articles. Returns short excerpts with links. Use for general questions about visas, documents and life in Germany.",
  schema: z.object({ query: z.string().min(2).max(200) }).strict(),
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search words (any language)' } }, required: ['query'], additionalProperties: false },
  label: { az: 'Məlumat bazasında axtarıram…', de: 'Ich durchsuche die Wissensdatenbank…', en: 'Searching the knowledge base…', ru: 'Ищу в базе знаний…' },
  run: async ({ query }, ctx) => {
    const l = langOf(ctx);
    const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}§]+/u).filter((t) => t.length >= 3))].slice(0, 8);
    if (!terms.length) return { results: [] };
    const [faqs, visas, posts, kb] = await Promise.all([
      prisma.faq.findMany({ where: { published: true, audience: { in: ['all', 'candidate'] } }, take: 300 }),
      prisma.visaCategory.findMany({ where: { published: true }, select: { slug: true, title: true, summary: true, body: true, visaLabel: true, requirements: true, documents: true, germanLevel: true, salaryMin: true, salaryMax: true, processingMin: true, processingMax: true }, take: 100 }),
      prisma.post.findMany({ where: { published: true }, orderBy: { publishedAt: 'desc' }, select: { slug: true, title: true, excerpt: true, body: true }, take: 200 }),
      // The knowledge base is internal (staff how-tos); only articles tagged "public" or "client" are client-facing.
      prisma.kbArticle.findMany({ where: { published: true }, select: { id: true, title: true, body: true, tags: true }, take: 300 }),
    ]);
    type Hit = { type: string; title: string; excerpt: string; link: string; score: number; facts?: Record<string, unknown> };
    const hits: Hit[] = [];
    for (const f of faqs) {
      const all = [f.question, f.answer].map((v) => Object.values((v ?? {}) as Record<string, string>).join(' ')).join(' ');
      const s = scoreOf(all, terms);
      if (s) hits.push({ type: 'faq', title: tr(f.question, l), excerpt: excerptOf(tr(f.answer, l), terms), link: '/faq', score: s + 0.5 });
    }
    for (const v of visas) {
      const all = [v.title, v.summary, v.body].map((x) => Object.values((x ?? {}) as Record<string, string>).join(' ')).join(' ') + ` ${v.visaLabel} ${v.slug}`;
      const s = scoreOf(all, terms);
      if (s)
        hits.push({
          type: 'visa_category',
          title: `${tr(v.title, l)} (${v.visaLabel})`,
          excerpt: excerptOf(`${tr(v.summary, l)} ${tr(v.body, l)}`, terms),
          link: `/visas/${v.slug}`,
          score: s + 0.3,
          facts: {
            germanLevel: v.germanLevel,
            salaryEurPerMonth: v.salaryMin || v.salaryMax ? [v.salaryMin, v.salaryMax] : null,
            processingWeeks: v.processingMin || v.processingMax ? [v.processingMin, v.processingMax] : null,
            requirements: trList(v.requirements, l).slice(0, 8),
            documents: trList(v.documents, l).slice(0, 10),
          },
        });
    }
    for (const p of posts) {
      const all = [p.title, p.excerpt, p.body].map((x) => Object.values((x ?? {}) as Record<string, string>).join(' ')).join(' ');
      const s = scoreOf(all, terms);
      if (s) hits.push({ type: 'article', title: tr(p.title, l), excerpt: excerptOf(`${tr(p.excerpt, l)} ${tr(p.body, l)}`, terms), link: `/news/${p.slug}`, score: s });
    }
    for (const a of kb) {
      const tags = Array.isArray(a.tags) ? a.tags.map((t) => String(t).toLowerCase()) : [];
      if (!tags.includes('public') && !tags.includes('client')) continue;
      const s = scoreOf(`${a.title} ${a.body}`, terms);
      if (s) hits.push({ type: 'help_article', title: a.title, excerpt: excerptOf(a.body, terms), link: '/faq', score: s });
    }
    hits.sort((a, b) => b.score - a.score);
    return { results: hits.slice(0, 6).map(({ score: _s, ...h }) => h) };
  },
};

const salary: AiTool<{ grossMonthlyEur?: number; taxClass?: number; children?: number; church?: boolean }> = {
  name: 'salary_and_costs_info',
  scope: 'CLIENT',
  description: "Estimates the German net salary for a monthly gross (2026 rules, statutory insurance; tax class 1 by default) and shows the salary range of the user's visa category. Indicative only.",
  schema: z
    .object({
      grossMonthlyEur: z.number().min(100).max(50_000).optional(),
      taxClass: z.number().int().min(1).max(6).optional(),
      children: z.number().int().min(0).max(10).optional(),
      church: z.boolean().optional(),
    })
    .strict(),
  parameters: {
    type: 'object',
    properties: {
      grossMonthlyEur: { type: 'number', description: 'Gross salary per month in EUR; omitted = middle of the visa category range' },
      taxClass: { type: 'integer', minimum: 1, maximum: 6 },
      children: { type: 'integer', minimum: 0, maximum: 10 },
      church: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  label: { az: 'Maaşı hesablayıram…', de: 'Ich rechne das Gehalt aus…', en: 'Calculating the salary…', ru: 'Считаю зарплату…' },
  run: async ({ grossMonthlyEur, taxClass = 1, children = 0, church = false }, ctx) => {
    const l = langOf(ctx);
    const c = await prisma.case.findFirst({
      where: { clientId: ctx.user.id },
      orderBy: [{ closedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      select: { visaCategory: { select: { title: true, salaryMin: true, salaryMax: true } } },
    });
    const cat = c?.visaCategory;
    const range = cat && (cat.salaryMin || cat.salaryMax) ? { minEur: cat.salaryMin, maxEur: cat.salaryMax } : null;
    const gross = grossMonthlyEur ?? (range ? Math.round(((range.minEur ?? range.maxEur ?? 0) + (range.maxEur ?? range.minEur ?? 0)) / 2) : null);
    if (!gross) return { error: 'gross_needed', message: 'Ask the user for the gross monthly salary.', calculatorLink: '/salary-calculator' };
    const r = calculateSalary({ gross, period: 'month', taxClass: taxClass as TaxClass, children, church });
    return {
      grossMonthlyEur: gross,
      taxClass,
      netMonthlyEur: r.monthly.net,
      deductionsMonthlyEur: { incomeTax: r.monthly.incomeTax, soli: r.monthly.soli, churchTax: r.monthly.churchTax, pension: r.monthly.pension, unemployment: r.monthly.unemployment, health: r.monthly.health, care: r.monthly.care },
      visaCategory: cat ? { title: tr(cat.title, l), salaryRange: range } : null,
      note: 'Estimate for 2026 (Berlin, statutory health insurance, average Zusatzbeitrag). Real payslips can differ.',
      calculatorLink: `/salary-calculator?gross=${gross}`,
    };
  },
};

const contactManager: AiTool<{ caseId?: string }> = {
  name: 'contact_my_manager',
  scope: 'CLIENT',
  description: "How the user can reach their case manager (messages in the application) and the office contacts. It does NOT send anything; tell the user where to write (or offer ask_my_consultant to forward the question).",
  schema: z.object({ caseId: z.string().max(40).optional() }).strict(),
  parameters: { type: 'object', properties: { caseId: { type: 'string' } }, additionalProperties: false },
  label: { az: 'Əlaqə məlumatlarını tapıram…', de: 'Ich suche die Kontaktdaten…', en: 'Finding contact details…', ru: 'Ищу контакты…' },
  run: async ({ caseId }, ctx) => {
    const l = langOf(ctx);
    const id = await pickOwnCase(ctx.user.id, caseId);
    const c = id ? await prisma.case.findFirst({ where: { id, clientId: ctx.user.id }, select: { id: true, number: true, assignedStaff: { select: { firstName: true } } } }) : null;
    const contactRow = await prisma.setting.findUnique({ where: { key: 'contact' } });
    const contact = (contactRow?.value ?? {}) as { phone?: string; whatsapp?: string; email?: string; hours?: Prisma.JsonValue };
    return {
      caseManager: c ? { firstName: c.assignedStaff?.firstName ?? null, caseNumber: c.number, writeHere: `/account/cases/${c.id}#messages` } : null,
      office: { phone: contact.phone ?? null, whatsapp: contact.whatsapp ?? null, email: contact.email ?? null, hours: tr(contact.hours ?? null, l) || null },
      bookConsultation: '/booking',
      note: 'Nothing was sent. The user writes the message themselves, or you offer to forward the question with ask_my_consultant.',
    };
  },
};

export const clientTools: AnyAiTool[] = [myCases, requiredDocs, deadlines, prepQuestions, knowledge, salary, contactManager, askConsultant];
