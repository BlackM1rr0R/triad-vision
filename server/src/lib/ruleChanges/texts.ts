import type { Locale } from '@prisma/client';

/** Notification / e-mail framing of a rule change, per client language. */
export const RULE_CHANGE_TEXT: Record<Locale, { prefix: string; effective: (d: string) => string; source: (u: string) => string; cta: string }> = {
  az: { prefix: 'Qayda dəyişikliyi', effective: (d) => `Qüvvəyə minmə tarixi: ${d}`, source: (u) => `Rəsmi mənbə: ${u}`, cta: 'Kabinetdə oxu' },
  de: { prefix: 'Regeländerung', effective: (d) => `Gilt ab: ${d}`, source: (u) => `Offizielle Quelle: ${u}`, cta: 'Im Kundenbereich lesen' },
  en: { prefix: 'Rule change', effective: (d) => `Effective from: ${d}`, source: (u) => `Official source: ${u}`, cta: 'Read in your account' },
  ru: { prefix: 'Изменение правил', effective: (d) => `Вступает в силу: ${d}`, source: (u) => `Официальный источник: ${u}`, cta: 'Читать в кабинете' },
};
