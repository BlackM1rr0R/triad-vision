import { canonicalProfession } from '../matching.js';
import { DATA_KEY_MAP } from './catalog.js';
import type { SheetSection } from './pdf.js';

/**
 * "Erklärung zum Beschäftigungsverhältnis" (EzB 02/2024, Bundesagentur für Arbeit) as a step-by-step wizard:
 * which employer value belongs to which step and official question number, conditional questions, validation
 * rules (shared with the client, which evaluates them generically), prefill from the vacancy / company profile
 * and the data sheet in the official question order.
 *
 * Form source: https://www.arbeitsagentur.de/datei/erklaerung-zum-beschaeftigungsverhaeltnis_ba047549.pdf
 * (EzB - 02/2024, checked 16.11.2026: the official URL still serves this version). Minimum wage: MiLoV5
 * (https://www.gesetze-im-internet.de/milov5/) 13,90 € from 01.01.2026, 14,60 € from 01.01.2027. Statutory
 * leave: § 3 BUrlG, 24 Werktage (6-day week) = 20 Arbeitstage at 5 days a week.
 *
 * Decision on the official PDF: the BA does not state terms for redistributing the form, so it is NOT committed
 * to the repository. An admin installs it once from the official URL into private storage (Admin › Official
 * forms); the employer / staff flows never fetch anything external. Without an installed template the wizard
 * still works and produces this data sheet, clearly labelled as not the official form, to copy into the form.
 */

export const EZB_FORM_URL = 'https://www.arbeitsagentur.de/datei/erklaerung-zum-beschaeftigungsverhaeltnis_ba047549.pdf';
export const EZB_VERSION_LABEL = 'EzB 02/2024';
export const EZB_CHECKED = '2026-11-16';

export const EZB_STEPS = ['employer', 'job', 'place', 'time', 'pay', 'insurance'] as const;
export type EzbStep = (typeof EZB_STEPS)[number];

/** Condition: the value of `key` is one of `in` ('*' = any non-empty value). */
export interface EzbCondition {
  key: string;
  in: string[];
}

export interface EzbFieldRule {
  key: string;
  step: EzbStep;
  /** Question number on the official form (null = not on the form, e.g. probation for the contract). */
  question: number | null;
  required?: boolean;
  showWhen?: EzbCondition;
  /** Required when shown (only meaningful with showWhen). */
  requiredWhenShown?: boolean;
  pattern?: string;
  min?: number;
  max?: number;
  multiline?: boolean;
}

const when = (key: string, ...values: string[]): EzbCondition => ({ key, in: values });

/** Wizard order = official order within each step. */
export const EZB_FIELDS: EzbFieldRule[] = [
  // C. Arbeitgeber
  { key: 'company.name', step: 'employer', question: 10, required: true },
  { key: 'company.street', step: 'employer', question: 11, required: true },
  { key: 'company.houseNumber', step: 'employer', question: 12 },
  { key: 'company.postalCode', step: 'employer', question: 13, required: true, pattern: '^\\d{5}$' },
  { key: 'company.city', step: 'employer', question: 14, required: true },
  { key: 'company.contactName', step: 'employer', question: 15 },
  { key: 'company.phone', step: 'employer', question: 16, pattern: '^[+0-9 ()/-]{5,30}$' },
  { key: 'company.email', step: 'employer', question: 17, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$' },
  { key: 'company.fax', step: 'employer', question: 18 },
  { key: 'company.betriebsnummer', step: 'employer', question: 19, required: true, pattern: '^\\d{8}$' },
  { key: 'company.handelsregister', step: 'employer', question: null },
  { key: 'company.foundedRecently', step: 'employer', question: 20, required: true },
  // D./E./F. Tätigkeit und Qualifikation
  { key: 'contract.jobTitle', step: 'job', question: 25, required: true },
  { key: 'employment.kldbCode', step: 'job', question: 25, pattern: '^\\d{5}$' },
  { key: 'employment.jobDescription', step: 'job', question: 25, multiline: true },
  { key: 'employment.qualificationRequired', step: 'job', question: 34 },
  { key: 'employment.licenceRequired', step: 'job', question: 35 },
  { key: 'employment.licenceDetails', step: 'job', question: 36, showWhen: when('employment.licenceRequired', 'yes'), requiredWhenShown: true },
  // D. Arbeitsort
  { key: 'employment.workplaceMode', step: 'place', question: 24, required: true },
  { key: 'employment.workplaceAddress', step: 'place', question: 24, showWhen: when('employment.workplaceMode', 'ADDRESS'), requiredWhenShown: true },
  { key: 'employment.leasedToThirdParty', step: 'place', question: 23, required: true },
  // D./G./H./I. Beginn, Dauer, Arbeitszeit, Überstunden, Urlaub
  { key: 'contract.startDate', step: 'time', question: 21, required: true },
  { key: 'contract.contractType', step: 'time', question: 22, required: true },
  { key: 'contract.endDate', step: 'time', question: 22, showWhen: when('contract.contractType', 'FIXED', 'AUSBILDUNG'), requiredWhenShown: true },
  { key: 'contract.probationMonths', step: 'time', question: null, min: 0, max: 6 },
  { key: 'contract.weeklyHours', step: 'time', question: 37, required: true, min: 1, max: 60 },
  { key: 'employment.overtime', step: 'time', question: 38, required: true },
  { key: 'employment.overtimeExtent', step: 'time', question: 39, showWhen: when('employment.overtime', 'yes'), requiredWhenShown: true },
  { key: 'employment.overtimeCompensation', step: 'time', question: 40, showWhen: when('employment.overtime', 'yes') },
  { key: 'contract.vacationDays', step: 'time', question: 41, required: true, min: 0, max: 60 },
  // J. Arbeitsentgelt
  { key: 'contract.grossMonthly', step: 'pay', question: 46, required: true, min: 1, max: 100_000 },
  { key: 'employment.collectiveAgreement', step: 'pay', question: 42, required: true },
  { key: 'employment.tariffApplied', step: 'pay', question: 43, showWhen: when('employment.collectiveAgreement', 'yes'), requiredWhenShown: true },
  { key: 'employment.collectiveAgreementName', step: 'pay', question: 44, showWhen: when('employment.tariffApplied', 'yes'), requiredWhenShown: true },
  { key: 'employment.payGroup', step: 'pay', question: 45, showWhen: when('employment.tariffApplied', 'yes') },
  { key: 'employment.benefitsInKind', step: 'pay', question: 48 },
  { key: 'employment.benefitsInKindAmount', step: 'pay', question: 49, showWhen: when('employment.benefitsInKind', '*'), min: 0, max: 100_000 },
  { key: 'employment.variablePay', step: 'pay', question: 50 },
  { key: 'employment.variablePayAmount', step: 'pay', question: 51, showWhen: when('employment.variablePay', '*'), min: 0, max: 100_000 },
  // K. Sozialversicherung, Ergänzungen
  { key: 'employment.socialInsurance', step: 'insurance', question: 52, required: true },
  { key: 'employment.socialInsuranceReason', step: 'insurance', question: 53, showWhen: when('employment.socialInsurance', 'no'), requiredWhenShown: true, multiline: true },
  { key: 'employment.remarks', step: 'insurance', question: 56, multiline: true },
];

export const EZB_RULE_MAP = new Map(EZB_FIELDS.map((f) => [f.key, f]));

export const conditionMet = (c: EzbCondition | undefined, values: Record<string, string>) => {
  if (!c) return true;
  const v = (values[c.key] ?? '').trim();
  return c.in.includes('*') ? !!v : c.in.includes(v);
};

/** Shown in the wizard: its own condition and the condition of the field it depends on (chains like 42 → 43 → 44). */
export const isShown = (key: string, values: Record<string, string>, depth = 0): boolean => {
  const r = EZB_RULE_MAP.get(key);
  if (!r?.showWhen) return true;
  if (depth > 5) return false;
  return conditionMet(r.showWhen, values) && isShown(r.showWhen.key, values, depth + 1);
};

export type EzbErrorCode = 'REQUIRED' | 'PATTERN' | 'RANGE' | 'DATE_ORDER';
export interface EzbIssue {
  key: string;
  code: EzbErrorCode | EzbWarningCode;
}
export type EzbWarningCode = 'VACATION_BELOW_STATUTORY' | 'BELOW_MINIMUM_WAGE';

/** Statutory minimum wage per hour on a date (MiLoV5). */
export const minimumWageOn = (isoDay: string) => (isoDay >= '2027-01-01' ? 14.6 : 13.9);
/** Weeks per month used for the hourly estimate (52 / 12). */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Validates the employer values of the wizard (only fields that are shown). Errors block signing; warnings are
 * hints (minimum wage, statutory leave) — the employer may still have reasons (e.g. part-time days per week).
 */
export const validateEzb = (values: Record<string, string>, opts: { requireAll?: boolean } = {}) => {
  const errors: EzbIssue[] = [];
  const warnings: EzbIssue[] = [];
  const v = (k: string) => (values[k] ?? '').trim();
  for (const f of EZB_FIELDS) {
    if (!isShown(f.key, values)) continue;
    const raw = v(f.key);
    if (!raw) {
      if ((opts.requireAll !== false && f.required) || (f.showWhen && f.requiredWhenShown)) errors.push({ key: f.key, code: 'REQUIRED' });
      continue;
    }
    if (f.pattern && !new RegExp(f.pattern).test(raw)) errors.push({ key: f.key, code: 'PATTERN' });
    if (f.min !== undefined || f.max !== undefined) {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) errors.push({ key: f.key, code: 'RANGE' });
    }
  }
  const start = v('contract.startDate');
  const end = v('contract.endDate');
  if (start && end && isShown('contract.endDate', values) && end <= start) errors.push({ key: 'contract.endDate', code: 'DATE_ORDER' });

  const hours = Number(v('contract.weeklyHours'));
  const monthly = Number(v('contract.grossMonthly'));
  const vacation = v('contract.vacationDays');
  if (vacation && hours >= 30 && Number(vacation) < 20) warnings.push({ key: 'contract.vacationDays', code: 'VACATION_BELOW_STATUTORY' });
  if (hours > 0 && monthly > 0) {
    const hourly = monthly / (hours * WEEKS_PER_MONTH);
    if (hourly < minimumWageOn(start || new Date().toISOString().slice(0, 10))) warnings.push({ key: 'contract.grossMonthly', code: 'BELOW_MINIMUM_WAGE' });
  }
  return { errors, warnings };
};

/** The rule fields sent to the client (it evaluates them generically: same source of truth). */
export const ruleView = (key: string) => {
  const r = EZB_RULE_MAP.get(key);
  if (!r) return { step: 'insurance' as EzbStep, question: null, rules: {} };
  return {
    step: r.step,
    question: r.question,
    rules: {
      ...(r.pattern ? { pattern: r.pattern } : {}),
      ...(r.min !== undefined ? { min: r.min } : {}),
      ...(r.max !== undefined ? { max: r.max } : {}),
      ...(r.showWhen ? { showWhen: r.showWhen, requiredWhenShown: !!r.requiredWhenShown } : {}),
      ...(r.multiline ? { multiline: true } : {}),
    },
  };
};

// ─── Prefill (vacancy / company profile) ────────────────────────────────

export interface EzbPrefillInput {
  vacancy?: { occupationCode: string | null; description: unknown; city: string | null; postalCode: string | null } | null;
  company?: { city: string | null; foundedYear: number | null; collectiveAgreement: string | null } | null;
  profession?: string | null;
  jobTitle?: string | null;
  now?: Date;
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const germanText = (v: unknown) => (typeof v === 'string' ? v : v && typeof v === 'object' && !Array.isArray(v) ? String((v as Record<string, unknown>).de ?? '') : '');

/**
 * Suggestions for the employer-side values from the vacancy (KldB code, description, place of work), the
 * company profile (collective agreement, founding year) and the profession. Only fills keys still empty
 * (the caller's `set` keeps the first value).
 */
export const ezbPrefill = (input: EzbPrefillInput): Record<string, string> => {
  const out: Record<string, string> = {};
  const now = input.now ?? new Date();
  const vac = input.vacancy;
  const kldb = vac?.occupationCode?.trim() ?? '';
  if (/^\d{5}$/.test(kldb)) {
    out['employment.kldbCode'] = kldb;
    // 5th digit = Anforderungsniveau: 1 Helfer (no qualified training), 2 Fachkraft (vocational training).
    if (kldb.endsWith('1')) out['employment.qualificationRequired'] = 'NONE';
    else if (kldb.endsWith('2')) out['employment.qualificationRequired'] = 'VOCATIONAL';
  }
  const desc = stripHtml(germanText(vac?.description));
  if (desc) out['employment.jobDescription'] = desc.length > 600 ? `${desc.slice(0, 597).trimEnd()}…` : desc;
  const vacCity = vac?.city?.trim() ?? '';
  const coCity = input.company?.city?.trim() ?? '';
  if (vacCity && coCity && vacCity.toLowerCase() !== coCity.toLowerCase()) {
    out['employment.workplaceMode'] = 'ADDRESS';
    out['employment.workplaceAddress'] = [vac?.postalCode?.trim(), vacCity].filter(Boolean).join(' ');
  }
  const agreement = input.company?.collectiveAgreement?.trim();
  if (agreement) {
    out['employment.collectiveAgreement'] = 'yes';
    out['employment.tariffApplied'] = 'yes';
    out['employment.collectiveAgreementName'] = agreement;
  }
  const founded = input.company?.foundedYear;
  if (founded) {
    const year = now.getUTCFullYear();
    // Only the year is known: older than 2 full years → no, founded this or last year → yes, else leave open.
    if (founded <= year - 3) out['company.foundedRecently'] = 'no';
    else if (founded >= year - 1) out['company.foundedRecently'] = 'yes';
  }
  // Nurses need the permission to use the professional title (§ 1 PflBG) — a suggestion the employer confirms.
  if (canonicalProfession(input.jobTitle) === 'nurse' || canonicalProfession(input.profession) === 'nurse') {
    out['employment.licenceRequired'] = 'yes';
    out['employment.licenceDetails'] = 'Erlaubnis zum Führen der Berufsbezeichnung nach § 1 Pflegeberufegesetz (Anerkennung)';
  }
  return out;
};

// ─── Data sheet in the official question order ──────────────────────────

const OPTION_DE: Record<string, Record<string, string>> = {
  yesNo: { yes: 'Ja', no: 'Nein' },
  'contract.contractType': { UNLIMITED: 'unbefristet', FIXED: 'befristet', AUSBILDUNG: 'befristet (Ausbildung)' },
  'employment.workplaceMode': {
    EMPLOYER_SEAT: 'Arbeitsort entspricht dem Arbeitgeber-Sitz',
    CHANGING: 'wechselnde Arbeits-/Einsatzorte',
    ADDRESS: 'Arbeitsort unter folgender Adresse',
  },
  'employment.qualificationRequired': {
    NONE: 'keine qualifizierte Berufsausbildung und kein Hochschulabschluss erforderlich (Helfer-/Anlerntätigkeit)',
    VOCATIONAL: 'qualifizierte Berufsausbildung',
    UNIVERSITY: 'Hochschulabschluss',
  },
  'contract.workingTime': { FULL: 'Vollzeit', PART: 'Teilzeit', MINI: 'Geringfügige Beschäftigung' },
};

const dmyOf = (isoDay: string) => `${isoDay.slice(8, 10)}.${isoDay.slice(5, 7)}.${isoDay.slice(0, 4)}`;
const moneyDe = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A value as it is written into the official form (German option texts, DD.MM.YYYY, 1.234,56). */
export const ezbDisplayValue = (key: string, raw: string) => {
  const v = (raw ?? '').trim();
  if (!v) return '';
  const def = DATA_KEY_MAP.get(key);
  if (def?.kind === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? dmyOf(v) : v;
  if (def?.kind === 'money') return Number.isFinite(Number(v)) ? `${moneyDe(Number(v))} €` : v;
  if (def?.kind === 'code') return OPTION_DE[key]?.[v] ?? OPTION_DE.yesNo[v] ?? v;
  return v;
};

const SHEET_SECTIONS: { title: string; rows: [number | null, string, string][] }[] = [
  {
    title: 'B. Angaben zur Arbeitnehmerin / zum Arbeitnehmer',
    rows: [
      [3, 'Vorname(n)', 'client.firstName'],
      [4, 'Nachname', 'client.lastName'],
      [5, 'Geburtsdatum', 'client.birthDate'],
      [7, 'Staatsangehörigkeit', 'client.nationality'],
      [8, 'Derzeitiger Wohnsitz', 'address.full'],
    ],
  },
  {
    title: 'C. Angaben zum Arbeitgeber',
    rows: [
      [10, 'Firma', 'company.name'],
      [11, 'Straße', 'company.street'],
      [12, 'Hausnummer', 'company.houseNumber'],
      [13, 'Postleitzahl', 'company.postalCode'],
      [14, 'Ort', 'company.city'],
      [15, 'Kontaktperson', 'company.contactName'],
      [16, 'Telefon', 'company.phone'],
      [17, 'E-Mail', 'company.email'],
      [18, 'Telefax', 'company.fax'],
      [19, 'Betriebsnummer des Beschäftigungsbetriebes', 'company.betriebsnummer'],
      [20, 'Unternehmen in den letzten 24 Monaten gegründet', 'company.foundedRecently'],
    ],
  },
  {
    title: 'D. Angaben zur Beschäftigung',
    rows: [
      [21, 'Beginn des Beschäftigungsverhältnisses', 'contract.startDate'],
      [22, 'Befristung', 'contract.contractType'],
      [22, 'befristet bis', 'contract.endDate'],
      [23, 'Überlassung an Dritte', 'employment.leasedToThirdParty'],
      [24, 'Arbeitsort', 'employment.workplaceMode'],
      [24, 'Adresse des Arbeitsorts', 'employment.workplaceAddress'],
      [25, 'Berufsbezeichnung und Beschreibung der Tätigkeit', 'employment.jobTitleDescription'],
    ],
  },
  {
    title: 'E./F. Qualifikation und Berufsausübungserlaubnis',
    rows: [
      [34, 'Für die Tätigkeit erforderlich', 'employment.qualificationRequired'],
      [35, 'Berufsausübung an Qualifikation / Erlaubnis gebunden', 'employment.licenceRequired'],
      [36, 'Erforderliche Qualifikation oder Erlaubnis', 'employment.licenceDetails'],
    ],
  },
  {
    title: 'G.–I. Arbeitszeit, Überstunden, Urlaub',
    rows: [
      [37, 'Arbeitszeit', 'contract.workingTime'],
      [37, 'Arbeitsstunden pro Woche', 'contract.weeklyHours'],
      [38, 'Verpflichtung zu Überstunden', 'employment.overtime'],
      [39, 'Überstundenumfang', 'employment.overtimeExtent'],
      [40, 'Überstundenausgleich durch', 'employment.overtimeCompensation'],
      [41, 'Urlaubsanspruch (Arbeitstage je Urlaubsjahr)', 'contract.vacationDays'],
    ],
  },
  {
    title: 'J. Arbeitsentgelt',
    rows: [
      [42, 'Arbeitgeber tarifgebunden (§ 3 oder § 5 TVG)', 'employment.collectiveAgreement'],
      [43, 'Beschäftigung zu den tariflichen Arbeitsbedingungen', 'employment.tariffApplied'],
      [44, 'Tarifvertrag', 'employment.collectiveAgreementName'],
      [45, 'Entgeltgruppe', 'employment.payGroup'],
      [46, 'Arbeitsentgelt pro Monat (brutto)', 'contract.grossMonthly'],
      [48, 'Art der geldwerten Leistung', 'employment.benefitsInKind'],
      [49, 'Höhe der geldwerten Leistung (brutto)', 'employment.benefitsInKindAmount'],
      [50, 'Art der variablen Vergütung', 'employment.variablePay'],
      [51, 'Höhe der variablen Vergütung (brutto)', 'employment.variablePayAmount'],
    ],
  },
  {
    title: 'K. Inländisches Beschäftigungsverhältnis / Ergänzungen',
    rows: [
      [52, 'Sozialversicherungspflicht in Deutschland', 'employment.socialInsurance'],
      [53, 'Begründung, falls keine Versicherungspflicht', 'employment.socialInsuranceReason'],
      [56, 'Ergänzende Angaben', 'employment.remarks'],
    ],
  },
];

/** Sections of the data sheet: "19 · Betriebsnummer …" with the form value; required + empty = highlighted. */
export const ezbSheetSections = (data: Record<string, string>): SheetSection[] =>
  SHEET_SECTIONS.map((s) => ({
    title: s.title,
    rows: s.rows
      .filter(([, , key]) => isShown(key, data) || !EZB_RULE_MAP.has(key))
      .map(([q, label, key]) => {
        const value = ezbDisplayValue(key, data[key] ?? '');
        const r = EZB_RULE_MAP.get(key);
        const required = !!r && (r.required || (!!r.showWhen && !!r.requiredWhenShown));
        return { label: q ? `${q} · ${label}` : label, value, missing: !value && required };
      })
      .filter((r) => r.value || r.missing),
  })).filter((s) => s.rows.length);

export const EZB_SHEET_NOTE = `Kein amtliches Formular. Datenblatt in der Reihenfolge der „Erklärung zum Beschäftigungsverhältnis“ (${EZB_VERSION_LABEL}) zum Übertragen in das Formular der Bundesagentur für Arbeit: ${EZB_FORM_URL} · Gelb = fehlt noch.`;
