import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/**
 * Aggregated usage of the anonymous (public) AI features. Visitors have no user, so nothing goes into
 * AiConversation / AiMessage; instead one Setting row (`ai.publicUsage`) keeps per-UTC-day totals
 * { usd, messages, quiz, leads } for the last 62 days. It feeds the public daily cap, the public share of
 * the monthly budget and the counters on the AI settings page. Writes are serialised in-process.
 */

export const PUBLIC_USAGE_KEY = 'ai.publicUsage';
const KEEP_DAYS = 62;

export interface DayUsage {
  usd: number;
  messages: number;
  quiz: number;
  leads: number;
}

type Store = { days: Record<string, DayUsage> };

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

const empty = (): DayUsage => ({ usd: 0, messages: 0, quiz: 0, leads: 0 });

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

const read = async (): Promise<Store> => {
  const row = await prisma.setting.findUnique({ where: { key: PUBLIC_USAGE_KEY } });
  const raw = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? (row.value as Record<string, unknown>).days : null;
  const days: Record<string, DayUsage> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      days[k] = { usd: num(o.usd), messages: num(o.messages), quiz: num(o.quiz), leads: num(o.leads) };
    }
  }
  return { days };
};

let chain: Promise<unknown> = Promise.resolve();

/** Adds to today's totals (never throws). */
export const bookPublicUsage = (delta: Partial<DayUsage>) => {
  const run = async () => {
    const store = await read();
    const key = utcDay();
    const day = store.days[key] ?? empty();
    day.usd = Math.round((day.usd + (delta.usd ?? 0)) * 1e6) / 1e6;
    day.messages += delta.messages ?? 0;
    day.quiz += delta.quiz ?? 0;
    day.leads += delta.leads ?? 0;
    store.days[key] = day;
    const keys = Object.keys(store.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete store.days[k];
    const value = store as unknown as Prisma.InputJsonValue;
    await prisma.setting.upsert({ where: { key: PUBLIC_USAGE_KEY }, create: { key: PUBLIC_USAGE_KEY, value }, update: { value } });
  };
  const p = chain.then(run, run).catch(() => undefined);
  chain = p;
  return p;
};

export const publicUsageToday = async (): Promise<DayUsage> => (await read()).days[utcDay()] ?? empty();

/** Totals of the current UTC month. */
export const publicUsageMonth = async (): Promise<DayUsage> => {
  const prefix = utcDay().slice(0, 7);
  const out = empty();
  for (const [k, d] of Object.entries((await read()).days)) {
    if (!k.startsWith(prefix)) continue;
    out.usd += d.usd;
    out.messages += d.messages;
    out.quiz += d.quiz;
    out.leads += d.leads;
  }
  out.usd = Math.round(out.usd * 1e6) / 1e6;
  return out;
};

/** Waits for pending writes (tests). */
export const flushPublicUsage = () => chain;
