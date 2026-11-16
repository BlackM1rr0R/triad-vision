import { Router } from 'express';
import { parseLocale } from '../lib/seo.js';
import { getCaseAiSettings } from '../lib/ai/features/caseAi/config.js';
import {
  buildChecklist,
  CHANNEL,
  CHECKLIST_AS_OF,
  CHECKLIST_PROFESSIONS,
  GENERAL_LINKS,
  OFFICIAL_LINKS,
  parseProfession,
  parseType,
  PUBLIC_VISA_TYPES,
  VISA_FEE,
} from '../lib/visaChecklist/index.js';

/**
 * Public document checklist generator (/visa-document-checklist) — mounted at /api/visa-checklist:
 *   GET /?type=skilled&profession=driver&lng=ru   the list of that visa type + profession in the language
 *       (the portal's embassy checklist + Baku-specific items, lib/visaChecklist), the filing channel in Baku and
 *       the official pages. No login, nothing stored, the same answer for everyone (cacheable, server-rendered).
 */
export const visaChecklistRouter = Router();

visaChecklistRouter.get('/', async (req, res) => {
  const lng = parseLocale(req.query.lng) ?? 'az';
  const type = req.query.type === undefined ? 'skilled' : parseType(req.query.type);
  const profession = req.query.profession === undefined ? 'other' : parseProfession(req.query.profession);
  if (!type || !profession) return res.status(400).json({ error: 'BAD_QUERY' });
  const settings = await getCaseAiSettings();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    asOf: CHECKLIST_AS_OF,
    type,
    profession,
    types: PUBLIC_VISA_TYPES,
    professions: CHECKLIST_PROFESSIONS,
    channel: CHANNEL[type],
    fee: VISA_FEE,
    items: buildChecklist(settings, type, profession, lng),
    links: OFFICIAL_LINKS[type],
    generalLinks: GENERAL_LINKS,
  });
});
