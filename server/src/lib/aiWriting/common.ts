import type { Request, Response } from 'express';
import type { Locale } from '@prisma/client';
import { limitMessage } from '../ai/limits.js';
import type { AiCompleteFailure } from '../ai/complete.js';

/** Shared helpers of the client AI writing features (CV, cover letter, recommendations). */

export const LOCALES = ['az', 'de', 'en', 'ru'] as const;
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

export const LANG_NAMES: Record<Locale, string> = { az: 'Azerbaijani', de: 'German', en: 'English', ru: 'Russian' };

/** Interface language of the request: the X-Locale header (what the user is looking at), else the profile locale. */
export const requestLocale = (req: Request): Locale => {
  const h = String(req.get('x-locale') ?? '').slice(0, 2);
  if (isLocale(h)) return h;
  const u = req.user?.locale;
  return isLocale(u) ? u : 'az';
};

const LIMIT_REASONS = new Set(['DISABLED', 'DAILY_MESSAGES', 'DAILY_COST', 'MONTHLY_BUDGET', 'KEY_CREDIT', 'NO_API_KEY']);

/**
 * Answers a failed AI call: 403 AI_DISABLED, 429 AI_LIMIT { reason, message } (same shape as /api/ai),
 * or 503 AI_UNAVAILABLE for timeouts and upstream / output errors.
 */
export const sendAiFailure = (res: Response, reason: AiCompleteFailure, locale: Locale) => {
  if (reason === 'DISABLED') {
    res.status(403).json({ error: 'AI_DISABLED', reason, message: limitMessage('DISABLED', locale) });
    return;
  }
  if (LIMIT_REASONS.has(reason)) {
    res.status(429).json({ error: 'AI_LIMIT', reason, message: limitMessage(reason as Parameters<typeof limitMessage>[0], locale) });
    return;
  }
  res.status(503).json({ error: 'AI_UNAVAILABLE', reason });
};

/** Plain string from model JSON, trimmed and capped. */
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');

/** Collapses whitespace of user-provided text for prompts. */
export const clip = (v: string | null | undefined, max: number) => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
