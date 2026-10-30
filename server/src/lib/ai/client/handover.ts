import { z } from 'zod';
import { prisma } from '../../../db.js';
import { createCaseMessage } from '../../messaging/caseMessages.js';
import type { AiTool, AiToolContext } from '../types.js';

/**
 * "Ask your consultant": the one thing the client assistant may do. The model proposes it (confirm tool →
 * AiAction + confirmation card); only when the client presses Confirm is the question posted as the
 * client's own message in the case chat (createCaseMessage: staff notification + realtime), so the
 * responsible case manager answers it there. Capped per day so a looping model cannot spam the team.
 */

export const HANDOVER_TOOL = 'ask_my_consultant';
export const HANDOVERS_PER_DAY = 5;

type Lang = 'az' | 'de' | 'en' | 'ru';
const langOf = (ctx: AiToolContext): Lang => (['az', 'de', 'en', 'ru'].includes(ctx.user.locale) ? (ctx.user.locale as Lang) : 'az');

/** Marker under the forwarded question, in the client's language (staff see where it came from). */
export const VIA_AI: Record<Lang, string> = {
  az: '(AI köməkçi vasitəsilə göndərildi)',
  de: '(über den KI-Assistenten gesendet)',
  en: '(sent via the AI assistant)',
  ru: '(отправлено через AI-помощника)',
};

const SUMMARY: Record<Lang, (q: string, n: string | null) => string> = {
  az: (q, n) => `Sualı menecerinizə göndərmək${n ? ` (müraciət ${n})` : ''}: «${q}»`,
  de: (q, n) => `Die Frage an Ihren Betreuer senden${n ? ` (Antrag ${n})` : ''}: „${q}“`,
  en: (q, n) => `Send this question to your case manager${n ? ` (application ${n})` : ''}: “${q}”`,
  ru: (q, n) => `Отправить вопрос вашему менеджеру${n ? ` (заявка ${n})` : ''}: «${q}»`,
};

/** A case id from the model must be the caller's own; else the open main case, else the newest one. */
const ownCase = async (userId: string, caseId?: string) => {
  if (caseId) return prisma.case.findFirst({ where: { id: caseId, clientId: userId }, select: { id: true, number: true } });
  return (
    (await prisma.case.findFirst({ where: { clientId: userId, closedAt: null }, orderBy: [{ parentCaseId: 'asc' }, { createdAt: 'desc' }], select: { id: true, number: true } })) ??
    (await prisma.case.findFirst({ where: { clientId: userId }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true } }))
  );
};

const startOfUtcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const askConsultant: AiTool<{ question: string; caseId?: string }> = {
  name: HANDOVER_TOOL,
  scope: 'CLIENT',
  description:
    "Forwards the user's question to their case manager as a message in the application chat. Use it when you do not know the answer, when the question needs a human decision (exceptions, deadlines, payments, contract, legal assessment) or when the user asks for a person. Write the question in the user's words and language, complete enough to be understood without this chat (no personal identifiers). The user must confirm it on a card before anything is sent.",
  schema: z.object({ question: z.string().trim().min(3).max(1500), caseId: z.string().max(40).optional() }).strict(),
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: "The question for the case manager, in the user's language" },
      caseId: { type: 'string', description: 'Optional: the application it is about (defaults to the open one)' },
    },
    required: ['question'],
    additionalProperties: false,
  },
  confirm: true,
  label: { az: 'Sualı hazırlayıram…', de: 'Ich bereite die Frage vor…', en: 'Preparing the question…', ru: 'Готовлю вопрос…' },
  summary: async ({ question, caseId }, ctx) => {
    const c = await ownCase(ctx.user.id, caseId);
    const q = question.length > 400 ? `${question.slice(0, 399)}…` : question;
    return SUMMARY[langOf(ctx)](q, c?.number ?? null);
  },
  run: async ({ question, caseId }, ctx) => {
    const c = await ownCase(ctx.user.id, caseId);
    // Thrown errors mark the action FAILED (so only real hand-overs count as DONE) and reach the model as the reason.
    if (!c) throw new Error('no_case: the user has no application yet; suggest booking a consultation (/booking) or the office contacts (tool contact_my_manager)');
    const sentToday = await prisma.aiAction.count({ where: { userId: ctx.user.id, tool: HANDOVER_TOOL, status: 'DONE', decidedAt: { gte: startOfUtcDay() } } });
    // This action is already counted as DONE (claimed before run): allow up to HANDOVERS_PER_DAY in total.
    if (sentToday > HANDOVERS_PER_DAY) throw new Error(`daily_limit: at most ${HANDOVERS_PER_DAY} questions per day can be forwarded; the user can write in the case messages directly (/account/cases/${c.id}?tab=messages)`);
    const message = await createCaseMessage({ caseId: c.id, authorId: ctx.user.id, body: `${question}\n\n${VIA_AI[langOf(ctx)]}`, side: 'client' });
    return { sent: true, caseNumber: c.number, messageId: message?.id ?? null, link: `/account/cases/${c.id}?tab=messages`, note: 'The case manager answers in the application messages; the user gets a notification.' };
  },
};
