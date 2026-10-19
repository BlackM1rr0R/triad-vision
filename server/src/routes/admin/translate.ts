import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { LANGS, translateMany } from '../../lib/ai/translate.js';

/**
 * On-demand translation for the admin editors ("Translate" button next to the language tabs) — mounted at
 * /api/admin/translate (staff). Costs go to the caller's ADMIN AI usage; nothing is stored here.
 */
export const adminTranslateRouter = Router();

const lang = z.enum(LANGS);
const text = z.string().max(5000).optional().nullable();
const l10n = z.object({ az: text, de: text, en: text, ru: text });

adminTranslateRouter.post('/', async (req, res) => {
  const body = parse(
    z.object({
      fields: z.record(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), l10n).refine((f) => Object.keys(f).length >= 1 && Object.keys(f).length <= 20, 'FIELDS'),
      source: lang.optional(),
      /** Languages to (re)translate although they have text, per field or for all fields. */
      overwrite: z.union([z.array(lang), z.record(z.string(), z.array(lang))]).optional(),
      context: z.string().trim().max(300).optional(),
    }),
    req.body ?? {},
  );
  const names = Object.keys(body.fields);
  const perField = body.overwrite && !Array.isArray(body.overwrite) ? body.overwrite : null;
  // One call per distinct overwrite set (usually one).
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const ow = perField ? (perField[n] ?? []) : ((body.overwrite as string[] | undefined) ?? []);
    const k = [...ow].sort().join(',');
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const values: Record<string, Record<string, string>> = {};
  const translated: Record<string, string[]> = {};
  let autoTranslated = false;
  let reason: string | null = null;
  for (const [k, group] of groups) {
    const r = await translateMany(Object.fromEntries(group.map((n) => [n, body.fields[n]])), {
      userId: req.user!.id,
      source: body.source,
      overwrite: k ? (k.split(',') as (typeof LANGS)[number][]) : [],
      context: body.context,
      copyOnFailure: false,
    });
    Object.assign(values, r.values);
    Object.assign(translated, r.translated);
    if (r.autoTranslated) autoTranslated = true;
    else reason ??= r.reason ?? null;
  }
  res.json({ values, translated, autoTranslated, reason: autoTranslated ? null : reason });
});
