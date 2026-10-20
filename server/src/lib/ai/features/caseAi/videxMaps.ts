import type { VisaType } from '@prisma/client';

/** Lookup tables for the VIDEX data sheet: ICAO country codes, purposes of stay, education levels (German labels). */

const COUNTRIES: Record<string, { de: string; en: string; adj: string }> = {
  AZE: { de: 'Aserbaidschan', en: 'Azerbaijan', adj: 'aserbaidschanisch' },
  TUR: { de: 'Türkei', en: 'Turkey', adj: 'türkisch' },
  GEO: { de: 'Georgien', en: 'Georgia', adj: 'georgisch' },
  RUS: { de: 'Russische Föderation', en: 'Russia', adj: 'russisch' },
  UKR: { de: 'Ukraine', en: 'Ukraine', adj: 'ukrainisch' },
  KAZ: { de: 'Kasachstan', en: 'Kazakhstan', adj: 'kasachisch' },
  UZB: { de: 'Usbekistan', en: 'Uzbekistan', adj: 'usbekisch' },
  KGZ: { de: 'Kirgisistan', en: 'Kyrgyzstan', adj: 'kirgisisch' },
  TJK: { de: 'Tadschikistan', en: 'Tajikistan', adj: 'tadschikisch' },
  TKM: { de: 'Turkmenistan', en: 'Turkmenistan', adj: 'turkmenisch' },
  ARM: { de: 'Armenien', en: 'Armenia', adj: 'armenisch' },
  BLR: { de: 'Belarus', en: 'Belarus', adj: 'belarussisch' },
  MDA: { de: 'Moldau', en: 'Moldova', adj: 'moldauisch' },
  IRN: { de: 'Iran', en: 'Iran', adj: 'iranisch' },
  IND: { de: 'Indien', en: 'India', adj: 'indisch' },
  PAK: { de: 'Pakistan', en: 'Pakistan', adj: 'pakistanisch' },
  EGY: { de: 'Ägypten', en: 'Egypt', adj: 'ägyptisch' },
  D: { de: 'Deutschland', en: 'Germany', adj: 'deutsch' },
  DEU: { de: 'Deutschland', en: 'Germany', adj: 'deutsch' },
};

export const countryName = (code: string, lang: 'de' | 'en' = 'de') => COUNTRIES[code.toUpperCase().replace(/</g, '')]?.[lang] ?? null;
export const nationalityAdj = (code: string) => COUNTRIES[code.toUpperCase().replace(/</g, '')]?.adj ?? null;

/** Free-text profile nationality ("Azerbaijan", "Azərbaycan", "азербайджан") → ICAO code when recognised. */
export const nationalityCode = (s: string | null | undefined) => {
  const v = (s ?? '').toLowerCase();
  if (!v) return null;
  if (/az[eə]r|азерб/.test(v)) return 'AZE';
  if (/t[uü]rk|турц/.test(v)) return 'TUR';
  if (/georg|gürc|грузи/.test(v)) return 'GEO';
  if (/russ|rus|росси/.test(v)) return 'RUS';
  if (/ukr|укра/.test(v)) return 'UKR';
  if (/kaz|qazax|казах/.test(v)) return 'KAZ';
  if (/uzb|özb|узбек/.test(v)) return 'UZB';
  return null;
};

export const PURPOSE_DE: Record<VisaType, string> = {
  WORK: 'Erwerbstätigkeit als Fachkraft (§§ 18a/18b AufenthG)',
  AUSBILDUNG: 'Betriebliche Berufsausbildung (§ 16a AufenthG)',
  WEITERBILDUNG: 'Anerkennung ausländischer Berufsqualifikationen (§ 16d AufenthG)',
  JOB_SEEKER: 'Arbeitsplatzsuche – Chancenkarte (§ 20a AufenthG)',
  STUDY: 'Studium (§ 16b AufenthG)',
  FAMILY: 'Familiennachzug (§§ 27 ff. AufenthG)',
  TOURIST: 'Besuch / Tourismus (Schengen-Visum)',
};

export const EDUCATION_DE: Record<string, string> = {
  school: 'Schulabschluss',
  vocational: 'Berufsausbildung',
  university: 'Hochschulabschluss',
};

export const SEX_DE: Record<string, string> = { M: 'männlich', F: 'weiblich', X: 'divers' };
