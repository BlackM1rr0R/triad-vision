import type { Locale } from '@prisma/client';

/** Admin notification of the daily data-freshness job, per staff language. */
export const FRESHNESS_TEXT: Record<
  Locale,
  { title: (n: number) => string; soon: (label: string, due: string) => string; due: (label: string, due: string) => string; cta: string }
> = {
  az: {
    title: (n) => `Məlumatların aktuallığı: ${n} bənd yoxlanmalıdır`,
    soon: (l, d) => `• ${l} — ${d} tarixinədək yoxlayın`,
    due: (l, d) => `• ${l} — yoxlama vaxtı çatıb (${d})`,
    cta: 'Siyahını aç',
  },
  de: {
    title: (n) => `Datenaktualität: ${n} Eintrag/Einträge prüfen`,
    soon: (l, d) => `• ${l} — bis ${d} prüfen`,
    due: (l, d) => `• ${l} — Prüfung fällig (${d})`,
    cta: 'Liste öffnen',
  },
  en: {
    title: (n) => `Data freshness: ${n} item(s) to review`,
    soon: (l, d) => `• ${l} — review by ${d}`,
    due: (l, d) => `• ${l} — review due (${d})`,
    cta: 'Open the list',
  },
  ru: {
    title: (n) => `Актуальность данных: проверить пунктов — ${n}`,
    soon: (l, d) => `• ${l} — проверить до ${d}`,
    due: (l, d) => `• ${l} — срок проверки наступил (${d})`,
    cta: 'Открыть список',
  },
};
