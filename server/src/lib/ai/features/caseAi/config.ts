import { z } from 'zod';
import type { VisaType } from '@prisma/client';
import { prisma } from '../../../../db.js';

/**
 * Settings and rule tables of the case AI checks (consistency, contract, VIDEX), one Setting row
 * `ai.caseChecks`, editable by admins on the case AI panel. The stored value is re-validated on every read;
 * anything missing or invalid falls back to the defaults below.
 *
 * ⚠ VERIFY YEARLY — the legal figures change every 1 January:
 *   - MINIMUM_WAGE: gesetzlicher Mindestlohn (MiLoG), € gross per hour. 2024 12.41, 2025 12.82, 2026 13.90 and
 *     2027 14.60 (Mindestlohnkommission decision of June 2025, adopted by ordinance).
 *   - BLUE_CARD: § 18g AufenthG salary thresholds, € gross per year. Standard = 50 % and shortage occupations /
 *     new entrants = 45.3 % of the Beitragsbemessungsgrenze of the pension insurance (BMI announcement).
 *   - OLDER_WORKER: § 18 (2) Nr. 5 AufenthG, first skilled-worker visa at 45 or older: 55 % of that BBG, unless
 *     adequate old-age provision is proven.
 * Admins can correct any value in the settings without a deploy.
 */

export const SETTING_KEY = 'ai.caseChecks';

/** Statutory minimum wage (€ / hour) per calendar year. VERIFY YEARLY. */
export const MINIMUM_WAGE: Record<string, number> = { '2024': 12.41, '2025': 12.82, '2026': 13.9, '2027': 14.6 };

/** EU Blue Card (§ 18g AufenthG) gross yearly salary thresholds. VERIFY YEARLY. */
export const BLUE_CARD: Record<string, { standard: number; shortage: number }> = {
  '2024': { standard: 45_300, shortage: 41_041.8 },
  '2025': { standard: 48_300, shortage: 43_759.8 },
  '2026': { standard: 50_700, shortage: 45_934.2 },
};

/** Skilled workers aged 45+ on their first visa (§ 18 (2) Nr. 5 AufenthG), gross per year. VERIFY YEARLY. */
export const OLDER_WORKER: Record<string, number> = { '2024': 49_830, '2025': 53_130, '2026': 55_770 };

/** Fixed statutory limits (ArbZG, BGB § 622 (3), BUrlG § 3) — these do not change yearly. */
export const STATUTORY = {
  maxWeeklyHours: 48,
  minWeeklyHours: 20,
  maxProbationMonths: 6,
  /** Minimum paid leave for a 5-day week (24 working days on a 6-day basis). */
  minVacationDays5DayWeek: 20,
  /** Weeks per month used to turn monthly salaries into hourly wages (13 / 3). */
  weeksPerMonth: 4.333,
  /** Passport must stay valid at least this long after the planned entry (agency rule). */
  passportMonthsAfterEntry: 6,
} as const;

type L10n = { az: string; de: string; en: string; ru: string };

export interface ChecklistItem {
  key: string;
  /** Requirement key (PASSPORT, VIDEX, SIGNED_CONTRACT …) whose upload ticks the item off automatically. */
  requirementKey?: string | null;
  label: L10n;
}

const item = (key: string, requirementKey: string | null, de: string, az: string, en: string, ru: string): ChecklistItem => ({ key, requirementKey, label: { az, de, en, ru } });

const COMMON = {
  videx: item('videx', 'VIDEX', 'VIDEX-Antrag, ausgedruckt und unterschrieben (2×)', 'VIDEX ərizəsi, çap edilmiş və imzalanmış (2 nüsxə)', 'VIDEX application, printed and signed (2×)', 'Анкета VIDEX, распечатанная и подписанная (2 экз.)'),
  passport: item('passport', 'PASSPORT', 'Gültiger Reisepass + 2 Kopien der Datenseite', 'Etibarlı pasport + məlumat səhifəsinin 2 surəti', 'Valid passport + 2 copies of the data page', 'Действующий паспорт + 2 копии страницы с данными'),
  photos: item('photos', 'PHOTO_2', '2 biometrische Passfotos (35×45 mm)', '2 biometrik foto (35×45 mm)', '2 biometric photos (35×45 mm)', '2 биометрических фото (35×45 мм)'),
  insurance: item('insurance', 'HEALTH_INSURANCE', 'Krankenversicherung bis zum Beginn der Beschäftigung / des Aufenthalts', 'İşə / qalışa başlayana qədər tibbi sığorta', 'Health insurance until employment / stay begins', 'Медицинская страховка до начала работы / пребывания'),
  cv: item('cv', 'CV', 'Lebenslauf auf Deutsch (unterschrieben)', 'Alman dilində CV (imzalı)', 'CV in German (signed)', 'Резюме на немецком (подписанное)'),
  fee: item('fee', null, 'Visumgebühr 75 € (in AZN, bar)', 'Viza rüsumu 75 € (AZN ilə, nağd)', 'Visa fee €75 (in AZN, cash)', 'Визовый сбор 75 € (в AZN, наличными)'),
  german: item('german', 'GERMAN_CERT', 'Deutsch-Sprachzertifikat (falls erforderlich)', 'Alman dili sertifikatı (tələb olunursa)', 'German language certificate (if required)', 'Сертификат немецкого языка (если требуется)'),
};

/** Default embassy checklists (German Embassy Baku, national visa). Verify with the embassy's current list. */
export const DEFAULT_CHECKLISTS: Record<VisaType, ChecklistItem[]> = {
  WORK: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('contract', 'SIGNED_CONTRACT', 'Unterschriebener Arbeitsvertrag / verbindliches Arbeitsplatzangebot', 'İmzalanmış əmək müqaviləsi / iş təklifi', 'Signed employment contract / binding job offer', 'Подписанный трудовой договор / предложение о работе'),
    item('declaration', null, '„Erklärung zum Beschäftigungsverhältnis“ (vom Arbeitgeber ausgefüllt)', '“Erklärung zum Beschäftigungsverhältnis” (işəgötürən doldurur)', '“Erklärung zum Beschäftigungsverhältnis” (filled in by the employer)', '«Erklärung zum Beschäftigungsverhältnis» (заполняет работодатель)'),
    item('recognition', 'ANERKENNUNG', 'Anerkennungsbescheid oder ZAB-Zeugnisbewertung', 'Tanınma qərarı (Anerkennung) və ya ZAB qiymətləndirməsi', 'Recognition notice or ZAB statement of comparability', 'Решение о признании или оценка ZAB'),
    item('diplomas', 'DIPLOMA', 'Diplome / Zeugnisse mit Apostille und beglaubigter Übersetzung', 'Apostilli və təsdiqli tərcüməli diplom / attestatlar', 'Diplomas / certificates with apostille and certified translation', 'Дипломы / аттестаты с апостилем и заверенным переводом'),
    item('ba', null, 'Vorabzustimmung der Bundesagentur für Arbeit (falls vorhanden)', 'Federal Əmək Agentliyinin ilkin razılığı (varsa)', 'Pre-approval of the Federal Employment Agency (if any)', 'Предварительное согласие Агентства по труду (если есть)'),
    COMMON.cv, COMMON.german, COMMON.insurance, COMMON.fee,
  ],
  AUSBILDUNG: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('contract', 'SIGNED_CONTRACT', 'Unterschriebener Ausbildungsvertrag', 'İmzalanmış peşə təhsili (Ausbildung) müqaviləsi', 'Signed training contract (Ausbildungsvertrag)', 'Подписанный договор об обучении (Ausbildung)'),
    item('school', 'DIPLOMA', 'Schulabschlusszeugnis mit Apostille und Übersetzung', 'Apostilli və tərcüməli məktəb attestatı', 'School-leaving certificate with apostille and translation', 'Аттестат с апостилем и переводом'),
    item('german', 'GERMAN_CERT', 'Deutsch-Sprachzertifikat (mindestens B1)', 'Alman dili sertifikatı (ən azı B1)', 'German certificate (at least B1)', 'Сертификат немецкого (не ниже B1)'),
    item('ba', null, 'Zustimmung der Bundesagentur für Arbeit', 'Federal Əmək Agentliyinin razılığı', 'Approval of the Federal Employment Agency', 'Согласие Агентства по труду'),
    item('motivation', null, 'Motivationsschreiben auf Deutsch', 'Alman dilində motivasiya məktubu', 'Motivation letter in German', 'Мотивационное письмо на немецком'),
    COMMON.cv, COMMON.insurance, COMMON.fee,
  ],
  WEITERBILDUNG: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('deficit', 'ANERKENNUNG', 'Defizitbescheid der Anerkennungsstelle', 'Tanınma orqanının çatışmazlıq qərarı (Defizitbescheid)', 'Deficit notice of the recognition authority', 'Решение о дефицитах (Defizitbescheid)'),
    item('measure', null, 'Bestätigung der Anpassungsqualifizierung / Arbeitsplatzangebot', 'Uyğunlaşma kursu təsdiqi / iş təklifi', 'Confirmation of the qualification measure / job offer', 'Подтверждение адаптационного курса / предложение работы'),
    item('german', 'GERMAN_CERT', 'Deutsch-Sprachzertifikat (in der Regel A2)', 'Alman dili sertifikatı (adətən A2)', 'German certificate (usually A2)', 'Сертификат немецкого (обычно A2)'),
    item('funds', null, 'Finanzierungsnachweis (Sperrkonto oder Vergütung)', 'Maliyyə sübutu (bloklanmış hesab və ya əmək haqqı)', 'Proof of funds (blocked account or pay)', 'Подтверждение финансирования (блок-счёт или оплата)'),
    COMMON.cv, COMMON.insurance, COMMON.fee,
  ],
  JOB_SEEKER: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('qualification', 'DIPLOMA', 'Nachweis der Qualifikation (Abschluss, ggf. Anerkennung)', 'İxtisas sübutu (diplom, lazım olsa tanınma)', 'Proof of qualification (degree, recognition if any)', 'Подтверждение квалификации (диплом, признание)'),
    item('language', 'LANGUAGE_CERT', 'Sprachnachweis (Deutsch A1 oder Englisch B2)', 'Dil sübutu (alman A1 və ya ingilis B2)', 'Language proof (German A1 or English B2)', 'Языковой сертификат (немецкий A1 или английский B2)'),
    item('funds', null, 'Finanzierungsnachweis (Sperrkonto)', 'Maliyyə sübutu (bloklanmış hesab)', 'Proof of funds (blocked account)', 'Подтверждение средств (блок-счёт)'),
    item('motivation', null, 'Motivationsschreiben', 'Motivasiya məktubu', 'Motivation letter', 'Мотивационное письмо'),
    COMMON.cv, COMMON.insurance, COMMON.fee,
  ],
  STUDY: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('admission', null, 'Zulassungsbescheid der Hochschule', 'Universitetin qəbul qərarı', 'Admission letter of the university', 'Решение о зачислении'),
    item('funds', null, 'Sperrkonto (Finanzierungsnachweis)', 'Bloklanmış hesab (maliyyə sübutu)', 'Blocked account (proof of funds)', 'Блокированный счёт'),
    item('school', 'DIPLOMA', 'Schulabschluss / Hochschulzeugnisse mit Übersetzung', 'Tərcüməli attestat / diplomlar', 'School / university certificates with translation', 'Аттестат / дипломы с переводом'),
    item('language', 'LANGUAGE_CERT', 'Sprachnachweis (Deutsch oder Englisch)', 'Dil sertifikatı (alman və ya ingilis)', 'Language certificate (German or English)', 'Языковой сертификат (немецкий или английский)'),
    item('motivation', null, 'Motivationsschreiben', 'Motivasiya məktubu', 'Motivation letter', 'Мотивационное письмо'),
    COMMON.cv, COMMON.insurance, COMMON.fee,
  ],
  FAMILY: [
    COMMON.videx, COMMON.passport, COMMON.photos,
    item('civil', null, 'Heirats- / Geburtsurkunde mit Apostille und Übersetzung', 'Apostilli və tərcüməli nikah / doğum şəhadətnaməsi', 'Marriage / birth certificate with apostille and translation', 'Свидетельство о браке / рождении с апостилем и переводом'),
    item('sponsor', null, 'Kopie von Pass und Aufenthaltstitel der Bezugsperson in Deutschland', 'Almaniyadakı ailə üzvünün pasport və yaşayış icazəsi surəti', 'Copy of the sponsor’s passport and residence permit', 'Копия паспорта и ВНЖ родственника в Германии'),
    item('german', 'GERMAN_CERT', 'Deutschkenntnisse A1 (Ehegatten, falls erforderlich)', 'Alman dili A1 (həyat yoldaşı, tələb olunursa)', 'German A1 (spouses, if required)', 'Немецкий A1 (супруги, если требуется)'),
    item('housing', 'ACCOMMODATION', 'Nachweis über ausreichenden Wohnraum', 'Kifayət qədər yaşayış sahəsi sübutu', 'Proof of sufficient housing', 'Подтверждение жилья'),
    item('income', null, 'Einkommensnachweis der Bezugsperson', 'Ailə üzvünün gəlir sübutu', 'Proof of the sponsor’s income', 'Подтверждение дохода родственника'),
    COMMON.fee,
  ],
  TOURIST: [
    item('form', 'VIDEX', 'Schengen-Visumantrag (unterschrieben)', 'Şengen viza ərizəsi (imzalı)', 'Schengen visa application (signed)', 'Шенгенская анкета (подписанная)'),
    COMMON.passport,
    item('photo', 'PHOTO', '1 biometrisches Passfoto', '1 biometrik foto', '1 biometric photo', '1 биометрическое фото'),
    item('insurance', 'HEALTH_INSURANCE', 'Reisekrankenversicherung (mind. 30.000 €)', 'Səyahət sığortası (ən azı 30 000 €)', 'Travel health insurance (at least €30,000)', 'Туристическая страховка (не менее 30 000 €)'),
    item('travel', null, 'Flugreservierung und Unterkunftsnachweis', 'Uçuş rezervasiyası və qalma yeri sübutu', 'Flight reservation and accommodation', 'Бронь билетов и жилья'),
    item('means', null, 'Nachweis über Beschäftigung und finanzielle Mittel', 'İş yeri və maliyyə vəsaiti sübutu', 'Proof of employment and funds', 'Подтверждение работы и средств'),
    item('fee', null, 'Visumgebühr 90 €', 'Viza rüsumu 90 €', 'Visa fee €90', 'Визовый сбор 90 €'),
  ],
};

export const VISA_TYPES = Object.keys(DEFAULT_CHECKLISTS) as VisaType[];

// ─── Stored settings ─────────────────────────────────────────────────

const l10nSchema = z.object({ az: z.string().max(300), de: z.string().max(300), en: z.string().max(300), ru: z.string().max(300) });
const itemSchema = z.object({ key: z.string().trim().min(1).max(40), requirementKey: z.string().trim().max(40).nullable().optional(), label: l10nSchema });
const yearKey = z.string().regex(/^20\d\d$/);
const amount = (max: number) => z.coerce.number().min(0).max(max);

export const caseAiSettingsSchema = z.object({
  /** Off = only the deterministic rules run, no model calls. */
  enabled: z.boolean().catch(true),
  minimumWage: z.record(yearKey, amount(100)).catch({ ...MINIMUM_WAGE }),
  blueCard: z.record(yearKey, z.object({ standard: amount(500_000), shortage: amount(500_000) })).catch({ ...BLUE_CARD }),
  olderWorker: z.record(yearKey, amount(500_000)).catch({ ...OLDER_WORKER }),
  checklists: z.record(z.enum(VISA_TYPES as [VisaType, ...VisaType[]]), z.array(itemSchema).max(40)).catch({}),
});

export type CaseAiSettings = z.infer<typeof caseAiSettingsSchema>;

export const caseAiSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    minimumWage: z.record(yearKey, z.number().min(0).max(100)),
    blueCard: z.record(yearKey, z.object({ standard: z.number().min(0).max(500_000), shortage: z.number().min(0).max(500_000) })),
    olderWorker: z.record(yearKey, z.number().min(0).max(500_000)),
    checklists: z.record(z.enum(VISA_TYPES as [VisaType, ...VisaType[]]), z.array(itemSchema).max(40)),
  })
  .partial()
  .strict();

let cache: { value: CaseAiSettings; at: number } | null = null;

export const getCaseAiSettings = async (): Promise<CaseAiSettings> => {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const row = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  const raw = row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  const value = caseAiSettingsSchema.parse(raw); // missing / invalid keys fall back to the defaults
  cache = { value, at: Date.now() };
  return value;
};

export const clearCaseAiSettingsCache = () => {
  cache = null;
};

export const saveCaseAiSettings = async (patch: z.infer<typeof caseAiSettingsUpdateSchema>) => {
  const current = await getCaseAiSettings();
  const next: CaseAiSettings = { ...current, ...patch, checklists: { ...current.checklists, ...(patch.checklists ?? {}) } };
  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: next }, update: { value: next } });
  cache = { value: next, at: Date.now() };
  return next;
};

/** Settings as shown to staff: the effective checklist per visa type (stored or default). */
export const publicCaseAiSettings = (s: CaseAiSettings) => ({
  ...s,
  checklists: Object.fromEntries(VISA_TYPES.map((v) => [v, checklistFor(s, v)])) as Record<VisaType, ChecklistItem[]>,
  defaults: { minimumWage: MINIMUM_WAGE, blueCard: BLUE_CARD, olderWorker: OLDER_WORKER },
  statutory: STATUTORY,
});

export const checklistFor = (s: CaseAiSettings, visaType: VisaType): ChecklistItem[] => {
  const own = s.checklists[visaType];
  return own && own.length ? own : DEFAULT_CHECKLISTS[visaType];
};

/** Value of a year table for `year`: that year, else the latest earlier year, else the earliest year. */
export const forYear = <T>(table: Record<string, T>, year: number): T | null => {
  const years = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!years.length) return null;
  const pick = [...years].reverse().find((y) => y <= year) ?? years[0];
  return table[String(pick)] ?? null;
};
