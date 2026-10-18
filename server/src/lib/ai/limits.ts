import type { AiScope } from '@prisma/client';
import { prisma } from '../../db.js';
import type { AiSettings } from './settings.js';
import { getKeyInfo } from './openrouter.js';

/**
 * Cost and usage limits, checked BEFORE every call to OpenRouter (and between tool rounds).
 * Days and months are UTC calendar periods. Costs are summed from AiMessage.costMicros.
 */

export type LimitReason = 'DISABLED' | 'DAILY_MESSAGES' | 'DAILY_COST' | 'MONTHLY_BUDGET' | 'KEY_CREDIT' | 'NO_API_KEY';

/** Below this remaining key credit (USD) nobody gets an answer. */
export const MIN_KEY_CREDIT_USD = 0.1;

type Lang = 'az' | 'de' | 'en' | 'ru';
const TEXT: Record<LimitReason, Record<Lang, string>> = {
  DISABLED: {
    az: 'AI köməkçi hazırda söndürülüb. Sualınızı müraciətinizin mesajlarında menecerinizə yaza bilərsiniz.',
    de: 'Der KI-Assistent ist derzeit ausgeschaltet. Schreiben Sie Ihre Frage gern Ihrem Betreuer in den Nachrichten Ihres Antrags.',
    en: 'The AI assistant is switched off at the moment. You can write your question to your case manager in your application messages.',
    ru: 'AI-помощник сейчас отключён. Вы можете написать вопрос своему менеджеру в сообщениях заявки.',
  },
  DAILY_MESSAGES: {
    az: 'Bugünkü sual limitinizə çatdınız. Sabah yenidən yaza bilərsiniz, təcili suallar üçün isə menecerinizə müraciət edin.',
    de: 'Sie haben Ihr Tageslimit an Fragen erreicht. Morgen geht es weiter – bei dringenden Fragen schreiben Sie bitte Ihrem Betreuer.',
    en: "You've reached today's question limit. You can continue tomorrow — for urgent questions please write to your case manager.",
    ru: 'Вы достигли дневного лимита вопросов. Продолжить можно завтра, а по срочным вопросам напишите своему менеджеру.',
  },
  DAILY_COST: {
    az: 'Bugünkü AI istifadə limitinə çatdınız. Sabah yenidən cəhd edin, təcili suallar üçün menecerinizə yazın.',
    de: 'Das heutige KI-Nutzungslimit ist erreicht. Bitte versuchen Sie es morgen wieder oder schreiben Sie Ihrem Betreuer.',
    en: "Today's AI usage limit has been reached. Please try again tomorrow or write to your case manager.",
    ru: 'Дневной лимит использования AI исчерпан. Попробуйте завтра или напишите своему менеджеру.',
  },
  MONTHLY_BUDGET: {
    az: 'AI köməkçinin bu ayki büdcəsi bitib. Suallarınızı menecerinizə yaza bilərsiniz.',
    de: 'Das Monatsbudget des KI-Assistenten ist aufgebraucht. Ihre Fragen beantwortet gern Ihr Betreuer.',
    en: "The AI assistant's budget for this month is used up. Your case manager is happy to answer your questions.",
    ru: 'Бюджет AI-помощника на этот месяц исчерпан. На ваши вопросы ответит ваш менеджер.',
  },
  KEY_CREDIT: {
    az: 'AI köməkçi müvəqqəti əlçatan deyil. Bir az sonra yenidən cəhd edin.',
    de: 'Der KI-Assistent ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.',
    en: 'The AI assistant is temporarily unavailable. Please try again later.',
    ru: 'AI-помощник временно недоступен. Попробуйте позже.',
  },
  NO_API_KEY: {
    az: 'AI köməkçi hələ qurulmayıb.',
    de: 'Der KI-Assistent ist noch nicht eingerichtet.',
    en: 'The AI assistant is not set up yet.',
    ru: 'AI-помощник ещё не настроен.',
  },
};

export const limitMessage = (reason: LimitReason, locale: string) => TEXT[reason][(['az', 'de', 'en', 'ru'].includes(locale) ? locale : 'az') as Lang];

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

export const costSince = async (since: Date, where: { userId?: string; scope?: AiScope } = {}) => {
  const r = await prisma.aiMessage.aggregate({
    _sum: { costMicros: true },
    where: { createdAt: { gte: since }, ...(where.userId || where.scope ? { conversation: { ...(where.userId ? { userId: where.userId } : {}), ...(where.scope ? { scope: where.scope } : {}) } } : {}) },
  });
  return (r._sum.costMicros ?? 0) / 1e6;
};

export const monthSpentUsd = () => costSince(startOfUtcMonth());

export const userTodayUsage = async (userId: string, scope: AiScope) => {
  const since = startOfUtcDay();
  const [costUsd, messages] = await Promise.all([
    costSince(since, { userId, scope }),
    prisma.aiMessage.count({ where: { role: 'user', createdAt: { gte: since }, conversation: { userId, scope } } }),
  ]);
  return { costUsd, messages };
};

/**
 * Null when the user may ask, otherwise the reason. `countingNewMessage` is false for follow-ups
 * after a confirm/reject (they do not use up a daily question).
 */
export const checkLimits = async (
  user: { id: string },
  scope: AiScope,
  s: AiSettings,
  apiKey: string,
  opts: { countingNewMessage?: boolean } = {},
): Promise<LimitReason | null> => {
  if (scope === 'CLIENT' && !s.clientEnabled) return 'DISABLED';
  if (!apiKey) return 'NO_API_KEY';
  const [month, today] = await Promise.all([monthSpentUsd(), userTodayUsage(user.id, scope)]);
  if (month >= s.monthlyBudgetUsd) return 'MONTHLY_BUDGET';
  if (scope === 'CLIENT') {
    if ((opts.countingNewMessage ?? true) && today.messages >= s.clientDailyMessages) return 'DAILY_MESSAGES';
    if (today.costUsd >= s.clientDailyCostUsd) return 'DAILY_COST';
  } else if (today.costUsd >= s.adminDailyCostUsd) return 'DAILY_COST';
  const key = await getKeyInfo(apiKey);
  if (key && key.limitRemaining !== null && key.limitRemaining < MIN_KEY_CREDIT_USD) return 'KEY_CREDIT';
  return null;
};

/** Cheaper re-check between tool rounds (no message count, no key call). */
export const checkSpendDuringTurn = async (user: { id: string }, scope: AiScope, s: AiSettings): Promise<LimitReason | null> => {
  const [month, today] = await Promise.all([monthSpentUsd(), costSince(startOfUtcDay(), { userId: user.id, scope })]);
  if (month >= s.monthlyBudgetUsd) return 'MONTHLY_BUDGET';
  if (today >= (scope === 'CLIENT' ? s.clientDailyCostUsd : s.adminDailyCostUsd)) return 'DAILY_COST';
  return null;
};
