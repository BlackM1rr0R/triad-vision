import { z } from 'zod';
import { prisma } from '../../db.js';
import { QUOTE_UNITS } from './math.js';

/**
 * Setting 'quotes': the price catalogue (reusable German service lines with default prices), the
 * intro / closing text templates and the defaults for new quotes. Edited by admins on the Angebote page.
 *
 * Templates may use the placeholders {firma}, {ansprechpartner}, {anzahl} and {gueltigBis}; the wizard
 * fills them in when a template is picked, so the saved quote holds the final text.
 */

export const QUOTE_SETTING_KEY = 'quotes';

const id = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const catalogueItemSchema = z.object({
  id,
  name: z.string().trim().min(1).max(300),
  unit: z.enum(QUOTE_UNITS),
  unitPriceCents: z.coerce.number().int().min(0).max(100_000_000),
  vatRate: z.coerce.number().int().min(0).max(100).nullable().default(null),
  active: z.boolean().default(true),
});

const templateSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  text: z.string().trim().max(4000),
});

export const quoteSettingsSchema = z.object({
  catalogue: z.array(catalogueItemSchema).max(100),
  introTemplates: z.array(templateSchema).max(20),
  closingTemplates: z.array(templateSchema).max(20),
  validDays: z.coerce.number().int().min(1).max(365),
  paymentTerms: z.string().trim().max(2000),
  deliveryTerms: z.string().trim().max(2000),
  /** The employer is reminded this many days before the quote expires. */
  reminderDays: z.coerce.number().int().min(1).max(30),
});

export type QuoteSettings = z.infer<typeof quoteSettingsSchema>;
export type CatalogueItem = z.infer<typeof catalogueItemSchema>;

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  catalogue: [
    { id: 'placement-ce', name: 'Personalvermittlung LKW-Fahrer (CE) – je Fachkraft', unit: 'PERSON', unitPriceCents: 450000, vatRate: null, active: true },
    { id: 'placement-skilled', name: 'Personalvermittlung Fachkraft (allgemein) – je Fachkraft', unit: 'PERSON', unitPriceCents: 350000, vatRate: null, active: true },
    { id: 'visa-service', name: 'Visa- und Behördenservice (Antrag, Termin, Begleitung)', unit: 'PERSON', unitPriceCents: 90000, vatRate: null, active: true },
    { id: 'recognition', name: 'Anerkennungsverfahren (Berufsabschluss / Führerschein)', unit: 'PERSON', unitPriceCents: 60000, vatRate: null, active: true },
    { id: 'language-a2-b1', name: 'Sprachkurs Deutsch A2–B1', unit: 'PERSON', unitPriceCents: 120000, vatRate: null, active: true },
    { id: 'relocation', name: 'Relocation / Ankunft (Abholung, Anmeldung, Wohnungssuche)', unit: 'PERSON', unitPriceCents: 50000, vatRate: null, active: true },
    { id: 'translation', name: 'Übersetzung und Beglaubigung von Dokumenten', unit: 'PIECE', unitPriceCents: 4500, vatRate: null, active: true },
    { id: 'integration', name: 'Betreuung nach Arbeitsantritt (Integration)', unit: 'MONTH', unitPriceCents: 15000, vatRate: null, active: true },
    { id: 'project-flat', name: 'Projektpauschale Recruiting-Kampagne', unit: 'FLAT', unitPriceCents: 150000, vatRate: null, active: true },
  ],
  introTemplates: [
    {
      id: 'standard',
      name: 'Standard',
      text: 'vielen Dank für Ihr Interesse an einer Zusammenarbeit mit Triad Vision. Gerne unterbreiten wir Ihnen für die Gewinnung von {anzahl} qualifizierten Fachkräften folgendes Angebot.',
    },
    {
      id: 'after-call',
      name: 'Nach Gespräch',
      text: 'wie in unserem Gespräch besprochen, erhalten Sie hiermit unser Angebot für die Vermittlung und Begleitung von {anzahl} Fachkräften bis zum Arbeitsantritt in Ihrem Unternehmen.',
    },
  ],
  closingTemplates: [
    {
      id: 'standard',
      name: 'Standard',
      text: 'Wir würden uns freuen, Sie bei der Gewinnung Ihrer neuen Mitarbeiter zu unterstützen. Für Rückfragen stehen wir Ihnen jederzeit gern zur Verfügung. Das Angebot können Sie bequem online über den Link in unserer E-Mail oder im Unternehmensbereich annehmen.',
    },
  ],
  validDays: 30,
  paymentTerms: '50 % bei Auftragserteilung, 50 % bei Arbeitsantritt der jeweiligen Fachkraft. Zahlbar innerhalb von 14 Tagen nach Rechnungsstellung ohne Abzug.',
  deliveryTerms: 'Bereitstellung der Fachkräfte innerhalb von 12–16 Wochen nach Auftragserteilung, abhängig von der Dauer der Visa- und Anerkennungsverfahren.',
  reminderDays: 3,
};

/** Stored settings over the defaults; a field that does not validate falls back to its default. */
export const readQuoteSettings = (value: unknown): QuoteSettings => {
  const o = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_QUOTE_SETTINGS } as Record<string, unknown>;
  for (const [k, schema] of Object.entries(quoteSettingsSchema.shape)) {
    if (o[k] === undefined) continue;
    const r = (schema as z.ZodTypeAny).safeParse(o[k]);
    if (r.success) out[k] = r.data;
  }
  return out as QuoteSettings;
};

export const getQuoteSettings = async () => readQuoteSettings((await prisma.setting.findUnique({ where: { key: QUOTE_SETTING_KEY } }))?.value);

export const saveQuoteSettings = async (value: QuoteSettings) => {
  await prisma.setting.upsert({ where: { key: QUOTE_SETTING_KEY }, create: { key: QUOTE_SETTING_KEY, value }, update: { value } });
  return value;
};
