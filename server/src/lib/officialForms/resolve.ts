import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { loadCaseContext } from '../ai/features/caseAi/data.js';
import { mapVidex, type VidexResult } from '../ai/features/caseAi/videx.js';
import type { ContractResult, ContractTerms } from '../ai/features/caseAi/contract.js';
import { salaryOf } from '../placement/employmentContract.js';
import { CHILD_ROWS, DATA_KEY_MAP, type DataGroup, type FieldMap, type FieldMapping, type L10n, type PdfFieldInfo } from './catalog.js';
import type { PdfValue } from './pdf.js';

/**
 * Resolves every catalogue data key for one case and applies a template's field map.
 *
 * Person / passport / address / stay values come from the VIDEX data of the case — the latest VIDEX run with the
 * staff's edits, else the deterministic mapping (passport MRZ, profile, client-provided values, documents) — so
 * the official forms show exactly what staff checked on the VIDEX sheet. Employer and contract values come from
 * the company and the employment contract tracker; employer-only details (Betriebsnummer …) are remembered per
 * company (Setting officialForms:company:<id>) once an employer or staff entered them.
 */

export type CaseData = Record<string, string>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

/** "24.10.2026" / "2026-10-24" → "2026-10-24" ('' when not a date). */
export const toIsoDay = (s: string | null | undefined) => {
  if (!s) return '';
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
};

export const dmyOf = (isoDay: string) => {
  const m = isoDay.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : isoDay;
};

export const sexCode = (s: string | null | undefined) => {
  const v = (s ?? '').trim().toLowerCase();
  if (!v) return '';
  if (/^(m|male|männlich|maennlich|kişi|kisi|мужской|м)$/.test(v) || v.startsWith('männl') || v.startsWith('maennl')) return 'M';
  if (/^(f|w|female|weiblich|qadın|qadin|женский|ж)$/.test(v) || v.startsWith('weibl')) return 'F';
  if (/^(x|d|divers|diverse)$/.test(v)) return 'X';
  return '';
};

export const maritalCode = (s: string | null | undefined) => {
  const v = (s ?? '').toLowerCase();
  if (!v.trim()) return '';
  if (/partnerschaft|civil union|partnership/.test(v)) return 'LEBENSPARTNERSCHAFT';
  if (/verheiratet|married|evli|женат|замужем/.test(v)) return 'VERHEIRATET';
  if (/geschieden|divorced|boşan|bosan|развед/.test(v)) return 'GESCHIEDEN';
  if (/verwitwet|widow|dul|вдов/.test(v)) return 'VERWITWET';
  if (/ledig|single|subay|subay|холост|не замуж/.test(v)) return 'LEDIG';
  return '';
};

/** "Musterstraße 12a, 12345 Berlin" → parts (best effort; the city column of the company wins). */
export const splitGermanAddress = (address: string | null | undefined, cityColumn?: string | null) => {
  const text = (address ?? '').replace(/\s+/g, ' ').trim();
  const parts = text.split(/[,\n]/).map((p) => p.trim()).filter(Boolean);
  let postalCode = '';
  let city = cityColumn?.trim() ?? '';
  let streetLine = '';
  for (const p of parts) {
    const m = p.match(/\b(\d{5})\b\s*(.*)$/);
    if (m && !postalCode) {
      postalCode = m[1];
      if (!city && m[2]) city = m[2].trim();
      const before = p.slice(0, m.index).trim();
      if (before && !streetLine) streetLine = before;
    } else if (!streetLine) streetLine = p;
  }
  const sm = streetLine.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)$/);
  return {
    streetLine,
    street: sm ? sm[1].trim() : streetLine,
    houseNumber: sm ? sm[2].replace(/\s+/g, '') : '',
    postalCode,
    city,
  };
};

// ─── Per-company extras ─────────────────────────────────────────────────

export interface CompanyExtras {
  betriebsnummer?: string;
  handelsregister?: string;
  fax?: string;
}
/**
 * Legacy store (before the Company legal columns existed): Setting officialForms:company:<id>. Still read as a
 * fallback and copied into empty columns once (moveCompanyExtrasToColumns); never written or deleted any more.
 */
const extrasKey = (companyId: string) => `officialForms:company:${companyId}`;
const EXTRAS_PREFIX = 'officialForms:company:';

const legacyExtras = async (companyId: string): Promise<CompanyExtras> => {
  const row = await prisma.setting.findUnique({ where: { key: extrasKey(companyId) } });
  const v = row?.value;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as CompanyExtras) : {};
};

/** "Amtsgericht München, HRB 12345" → { registerNumber: "HRB 12345", registerCourt: "Amtsgericht München" }. */
export const splitHandelsregister = (s: string): { registerNumber: string; registerCourt: string | null } => {
  const t = s.trim().replace(/\s+/g, ' ');
  const m = t.match(/\b(HR\s?[AB]|GnR|PR|VR|GsR)\s*\d+(\s?[A-Z]{1,2}\b)?/i);
  if (!m) return { registerNumber: t.slice(0, 40), registerCourt: null };
  const court = (t.slice(0, m.index) + t.slice((m.index ?? 0) + m[0].length)).replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').replace(/\s*,\s*,/g, ',').trim();
  return { registerNumber: m[0].trim().slice(0, 40), registerCourt: court ? court.slice(0, 120) : null };
};

/** Register number and court as one line, as the official forms print it. */
export const handelsregisterOf = (co: { registerNumber: string | null; registerCourt: string | null }) =>
  [co.registerCourt?.trim(), co.registerNumber?.trim()].filter(Boolean).join(', ');

/** Betriebsnummer / Handelsregister / fax of the company: the Company columns first, the legacy Setting values as fallback. */
export const companyExtras = async (companyId: string): Promise<CompanyExtras> => {
  const [co, legacy] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { betriebsnummer: true, registerNumber: true, registerCourt: true, fax: true } }),
    legacyExtras(companyId),
  ]);
  const out: CompanyExtras = {};
  const betriebsnummer = co?.betriebsnummer?.trim() || legacy.betriebsnummer?.trim();
  const handelsregister = (co ? handelsregisterOf(co) : '') || legacy.handelsregister?.trim();
  const fax = co?.fax?.trim() || legacy.fax?.trim();
  if (betriebsnummer) out.betriebsnummer = betriebsnummer;
  if (handelsregister) out.handelsregister = handelsregister;
  if (fax) out.fax = fax;
  return out;
};

/** Writes changed extras into the Company columns (undefined = unchanged, '' = clear). */
export const saveCompanyExtras = async (companyId: string, patch: CompanyExtras) => {
  const current = await companyExtras(companyId);
  const data: Prisma.CompanyUpdateInput = {};
  if (patch.betriebsnummer !== undefined && patch.betriebsnummer.trim() !== (current.betriebsnummer ?? '')) data.betriebsnummer = patch.betriebsnummer.trim().slice(0, 20) || null;
  if (patch.fax !== undefined && patch.fax.trim() !== (current.fax ?? '')) data.fax = patch.fax.trim().slice(0, 40) || null;
  if (patch.handelsregister !== undefined && patch.handelsregister.trim() !== (current.handelsregister ?? '')) {
    const v = patch.handelsregister.trim();
    if (v) Object.assign(data, splitHandelsregister(v));
    else Object.assign(data, { registerNumber: null, registerCourt: null });
  }
  if (Object.keys(data).length) await prisma.company.update({ where: { id: companyId }, data });
  return companyExtras(companyId);
};

/**
 * One-time data move (idempotent; jobs/partnerContracts.ts and tests): every legacy Setting row's values are
 * copied into the company's EMPTY columns — filled columns are never overwritten, the Setting rows stay.
 */
export const moveCompanyExtrasToColumns = async () => {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: EXTRAS_PREFIX } } });
  let moved = 0;
  for (const row of rows) {
    const companyId = row.key.slice(EXTRAS_PREFIX.length);
    const v = (row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {}) as CompanyExtras;
    const co = await prisma.company.findUnique({ where: { id: companyId }, select: { betriebsnummer: true, registerNumber: true, registerCourt: true, fax: true } });
    if (!co) continue;
    const data: Prisma.CompanyUpdateInput = {};
    if (!co.betriebsnummer && v.betriebsnummer?.trim()) data.betriebsnummer = v.betriebsnummer.trim().slice(0, 20);
    if (!co.fax && v.fax?.trim()) data.fax = v.fax.trim().slice(0, 40);
    if (!co.registerNumber && !co.registerCourt && v.handelsregister?.trim()) Object.assign(data, splitHandelsregister(v.handelsregister));
    if (!Object.keys(data).length) continue;
    await prisma.company.update({ where: { id: companyId }, data });
    moved++;
  }
  return { checked: rows.length, moved };
};

// ─── Case data ──────────────────────────────────────────────────────────

const moneyDe = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Every data key of the catalogue for the case ('' = unknown). Dates are ISO days, money plain numbers ("3200.5"). */
export const loadCaseData = async (caseId: string, now = new Date()): Promise<CaseData> => {
  const ctx = await loadCaseContext(caseId, now);
  const [videxRun, contractRun, contract, family] = await Promise.all([
    prisma.caseAiRun.findFirst({ where: { caseId, kind: 'VIDEX' }, orderBy: { createdAt: 'desc' }, select: { result: true } }),
    prisma.caseAiRun.findFirst({ where: { caseId, kind: 'CONTRACT' }, orderBy: { createdAt: 'desc' }, select: { result: true } }),
    prisma.employmentContract.findUnique({ where: { caseId } }),
    prisma.familyMember.findMany({ where: { mainCaseId: caseId }, orderBy: { createdAt: 'asc' } }),
  ]);
  const terms: ContractTerms | null = contractRun ? ((contractRun.result as unknown as ContractResult).terms ?? null) : null;
  // Staff-edited VIDEX values win; keys the run left empty fall back to today's deterministic mapping.
  const mapped = new Map(mapVidex(ctx, terms).map((f) => [f.key, f.value]));
  const vx = new Map(mapped);
  if (videxRun) for (const f of (videxRun.result as unknown as VidexResult).fields ?? []) if (f.value) vx.set(f.key, f.value);
  const v = (key: string) => vx.get(key) ?? '';

  const d: CaseData = {};
  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    const s = String(value).trim();
    if (s && !d[key]) d[key] = s;
  };

  // Person
  set('client.lastName', v('surname'));
  set('client.firstName', v('givenNames'));
  set('client.fullName', [v('givenNames'), v('surname')].filter(Boolean).join(' '));
  set('client.birthName', v('birthName'));
  set('client.birthDate', toIsoDay(v('birthDate')));
  set('client.birthPlace', v('placeOfBirth'));
  set('client.birthCountry', v('countryOfBirth'));
  set('client.nationality', v('nationality'));
  set('client.nationalityAtBirth', v('nationalityAtBirth'));
  set('client.sex', sexCode(v('sex')) || sexCode(ctx.documents.find((x) => x.mrz)?.mrz?.sex));
  const spouse = family.find((m) => m.relation === 'SPOUSE') ?? null;
  set('client.maritalStatus', maritalCode(v('maritalStatus')) || (spouse ? 'VERHEIRATET' : ''));
  set('client.profession', v('occupation'));
  set('client.education', ctx.client.education ?? '');
  set('client.educationText', v('education'));
  set('client.germanLevel', v('germanLevel'));
  set('client.phone', v('phone'));
  set('client.email', v('email'));
  // Passport
  set('passport.type', v('passportType'));
  set('passport.number', v('passportNumber'));
  set('passport.issueDate', toIsoDay(v('passportIssueDate')));
  set('passport.expiry', toIsoDay(v('passportExpiry')));
  set('passport.authority', v('passportAuthority'));
  set('passport.country', v('passportCountry'));
  // Address
  set('address.street', v('street'));
  set('address.postalCode', v('postalCode'));
  set('address.city', v('city'));
  set('address.postalCity', [v('postalCode'), v('city')].filter(Boolean).join(' '));
  set('address.country', v('country'));
  set('address.full', [v('street'), [v('postalCode'), v('city')].filter(Boolean).join(' '), v('country')].filter(Boolean).join(', '));
  // Case / stay
  set('case.number', ctx.number);
  set('case.visaType', ctx.visaType);
  set('case.visaCategory', ctx.visaCategory?.visaLabel ?? '');
  set('case.purpose', v('purpose'));
  set('case.plannedEntryDate', toIsoDay(v('entryDate')) || ctx.plannedEntry.date);
  set('case.stayDuration', v('stayDuration'));
  set('case.residenceGermany', v('residenceGermany'));
  set('case.costCoverage', v('costCoverage'));
  set('case.position', contract?.jobTitle ?? v('position'));
  const withMain = family.filter((m) => m.joinsWhen === 'WITH_MAIN');
  set('case.familyAccompanying', withMain.length ? 'yes' : 'no');
  set('case.familyAccompanyingNames', withMain.map((m) => `${m.firstName} ${m.lastName}`.trim()).join(', '));
  // Family
  const residence = [v('city'), v('country')].filter(Boolean).join(', ');
  if (spouse) {
    set('spouse.lastName', spouse.lastName.toUpperCase());
    set('spouse.firstName', spouse.firstName.toUpperCase());
    set('spouse.birthDate', iso(spouse.birthDate));
    set('spouse.birthPlace', spouse.birthPlace);
    set('spouse.nationality', spouse.nationality);
    set('spouse.residence', residence);
  }
  family
    .filter((m) => m.relation === 'CHILD')
    .slice(0, CHILD_ROWS)
    .forEach((c, i) => {
      const n = i + 1;
      set(`children.${n}.lastName`, c.lastName.toUpperCase());
      set(`children.${n}.firstName`, c.firstName.toUpperCase());
      set(`children.${n}.sex`, sexCode(c.sex));
      set(`children.${n}.birthDate`, iso(c.birthDate));
      set(`children.${n}.birthDatePlace`, [c.birthDate ? dmyOf(iso(c.birthDate)) : '', c.birthPlace ?? ''].filter(Boolean).join(', '));
      set(`children.${n}.nationality`, c.nationality);
      set(`children.${n}.residence`, residence);
    });
  // Employer
  const co = ctx.company;
  if (co) {
    const extras = await companyExtras(co.id);
    // Structured address columns (Company.street / postalCode) win over the free-text address.
    const legal = await prisma.company.findUnique({ where: { id: co.id }, select: { street: true, postalCode: true, city: true } });
    const addr = legal?.street?.trim()
      ? { ...splitGermanAddress(legal.street, legal.city ?? co.city), postalCode: legal.postalCode?.trim() ?? '', city: legal.city?.trim() || co.city?.trim() || '' }
      : splitGermanAddress(co.address, co.city);
    set('company.name', `${co.name}${co.legalForm && !co.name.includes(co.legalForm) ? ` ${co.legalForm}` : ''}`);
    set('company.street', addr.street);
    set('company.houseNumber', addr.houseNumber);
    set('company.streetLine', addr.streetLine);
    set('company.postalCode', addr.postalCode);
    set('company.city', addr.city);
    set('company.postalCity', [addr.postalCode, addr.city].filter(Boolean).join(' '));
    set('company.address', [addr.streetLine, [addr.postalCode, addr.city].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    set('company.contactName', co.contactName);
    set('company.phone', co.phone);
    set('company.email', co.email);
    set('company.fax', extras.fax);
    set('company.betriebsnummer', extras.betriebsnummer);
    set('company.handelsregister', extras.handelsregister);
  } else if (contract?.employerName) set('company.name', contract.employerName);
  // Employment contract
  if (contract) {
    const { monthly, yearly } = salaryOf({ grossMonthly: contract.grossMonthly === null ? null : Number(contract.grossMonthly), grossYearly: contract.grossYearly === null ? null : Number(contract.grossYearly) });
    const hours = contract.weeklyHours === null ? null : Number(contract.weeklyHours);
    set('contract.jobTitle', contract.jobTitle);
    set('contract.contractType', contract.contractType);
    set('contract.grossMonthly', monthly);
    set('contract.grossYearly', yearly);
    if (monthly !== null && hours) set('contract.hourlyWage', Math.round((monthly / (hours * 4.33)) * 100) / 100);
    set('contract.weeklyHours', hours);
    if (hours !== null) set('contract.workingTime', hours >= 30 ? 'FULL' : 'PART');
    set('contract.startDate', iso(contract.startDate));
    set('contract.endDate', iso(contract.endDate));
    set('contract.probationMonths', contract.probationMonths);
    set('contract.vacationDays', contract.vacationDays);
  } else if (terms) {
    set('contract.jobTitle', terms.position);
    set('contract.startDate', toIsoDay(terms.startDate));
    set('contract.endDate', toIsoDay(terms.endDate));
    set('contract.contractType', terms.contractType === 'fixed_term' ? 'FIXED' : terms.contractType === 'permanent' ? 'UNLIMITED' : null);
    set('contract.grossMonthly', terms.grossMonthlySalary);
    set('contract.weeklyHours', terms.weeklyHours);
    set('contract.vacationDays', terms.vacationDays);
    set('contract.probationMonths', terms.probationMonths);
  }
  if (!d['contract.jobTitle']) set('contract.jobTitle', v('position'));
  set('case.stayUntil', d['contract.contractType'] === 'FIXED' ? d['contract.endDate'] : '');
  // Employment details: defaults the employer confirms in the portal.
  set('employment.workplaceMode', 'EMPLOYER_SEAT');
  set('employment.leasedToThirdParty', 'no');
  set('employment.overtime', 'no');
  set('employment.collectiveAgreement', 'no');
  set('employment.socialInsurance', 'yes');
  // Meta
  const today = iso(now);
  set('meta.today', today);
  set('meta.placeAndDate', [v('city'), dmyOf(today)].filter(Boolean).join(', '));
  set('meta.employerPlaceDate', [d['company.city'], dmyOf(today)].filter(Boolean).join(', '));
  return d;
};

/** Values derived from others, recomputed after overrides (employer edits, staff overrides). */
export const deriveData = (base: CaseData, overrides: Record<string, string> = {}): CaseData => {
  const d: CaseData = { ...base };
  for (const [k, v] of Object.entries(overrides)) if (DATA_KEY_MAP.has(k)) d[k] = (v ?? '').trim();
  const touched = (k: string) => Object.prototype.hasOwnProperty.call(overrides, k);
  if (['company.street', 'company.houseNumber'].some(touched) && !touched('company.streetLine')) d['company.streetLine'] = [d['company.street'], d['company.houseNumber']].filter(Boolean).join(' ');
  if (['company.postalCode', 'company.city'].some(touched) && !touched('company.postalCity')) d['company.postalCity'] = [d['company.postalCode'], d['company.city']].filter(Boolean).join(' ');
  if (['company.street', 'company.houseNumber', 'company.postalCode', 'company.city'].some(touched) && !touched('company.address')) d['company.address'] = [d['company.streetLine'], d['company.postalCity']].filter(Boolean).join(', ');
  if (touched('company.city') && !touched('meta.employerPlaceDate')) d['meta.employerPlaceDate'] = [d['company.city'], d['meta.today'] ? dmyOf(d['meta.today']) : ''].filter(Boolean).join(', ');
  if (['contract.grossMonthly', 'contract.weeklyHours'].some(touched)) {
    const m = Number(d['contract.grossMonthly']);
    const h = Number(d['contract.weeklyHours']);
    if (!touched('contract.grossYearly')) d['contract.grossYearly'] = Number.isFinite(m) && d['contract.grossMonthly'] ? String(Math.round(m * 12 * 100) / 100) : '';
    if (!touched('contract.hourlyWage')) d['contract.hourlyWage'] = Number.isFinite(m) && Number.isFinite(h) && h > 0 && d['contract.grossMonthly'] ? String(Math.round((m / (h * 4.33)) * 100) / 100) : '';
    if (!touched('contract.workingTime') && d['contract.weeklyHours']) d['contract.workingTime'] = h >= 30 ? 'FULL' : 'PART';
  }
  if (['contract.jobTitle', 'employment.jobDescription'].some(touched) || !d['employment.jobTitleDescription']) {
    d['employment.jobTitleDescription'] = [d['contract.jobTitle'], d['employment.jobDescription']].filter(Boolean).join(' – ');
  }
  if (touched('contract.jobTitle') && !touched('case.position')) d['case.position'] = d['contract.jobTitle'];
  if (['contract.contractType', 'contract.endDate'].some(touched)) d['case.stayUntil'] = d['contract.contractType'] === 'FIXED' ? (d['contract.endDate'] ?? '') : '';
  return d;
};

// ─── Mapping ────────────────────────────────────────────────────────────

const fmtValue = (raw: string, m: FieldMapping) => {
  const def = DATA_KEY_MAP.get(m.source);
  let out = raw;
  if (m.map) out = m.map[raw] ?? m.map[raw.toUpperCase()] ?? m.map[raw.toLowerCase()] ?? out;
  const format = m.format ?? (def?.kind === 'date' ? 'date' : def?.kind === 'money' ? 'money' : 'none');
  if (format === 'date' || format === 'dateIso' || format === 'monthYear') {
    const d = toIsoDay(out);
    if (d) out = format === 'date' ? dmyOf(d) : format === 'monthYear' ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : d;
  } else if (format === 'money') {
    const n = Number(out);
    if (out && Number.isFinite(n)) out = moneyDe(n);
  } else if (format === 'upper') out = out.toLocaleUpperCase('de-DE');
  else if (format === 'lower') out = out.toLocaleLowerCase('de-DE');
  return out;
};

const matchesWhen = (raw: string, when: string) => {
  if (when === '*') return !!raw.trim();
  const v = raw.trim().toUpperCase();
  return when
    .split('|')
    .map((x) => x.trim().toUpperCase())
    .some((x) => x === v);
};

export interface FilledRow {
  field: string;
  type: PdfFieldInfo['type'];
  source: string;
  /** Last segment of the data key ("passportNumber" …) — lets the response masking recognise sensitive values. */
  key: string;
  /** What goes into the PDF (text / option; "X" / "" for check boxes). */
  value: string;
  checked?: boolean;
  overridden: boolean;
  missing: boolean;
}

export interface MissingEntry {
  source: string;
  group: DataGroup | 'const';
  label: L10n | null;
  fields: string[];
}

/** Data keys whose last segment is not the field name the response masking knows (lib/privacy/mask.ts). */
const MASK_KEY: Record<string, string> = { 'passport.number': 'passportNumber' };

/** Applies a field map to resolved data (+ per-field staff overrides). Fields without a mapping stay untouched. */
export const applyMapping = (fields: PdfFieldInfo[], map: FieldMap, data: CaseData, fieldOverrides: Record<string, string> = {}) => {
  const values: Record<string, PdfValue> = {};
  const rows: FilledRow[] = [];
  const missing = new Map<string, MissingEntry>();
  const typeOf = new Map(fields.map((f) => [f.name, f.type]));
  for (const [field, m] of Object.entries(map)) {
    const type = typeOf.get(field);
    if (!type) continue; // mapping of a field the PDF no longer has
    const isConst = m.source === 'const';
    const raw = isConst ? (m.value ?? '') : (data[m.source] ?? '');
    const has = Object.prototype.hasOwnProperty.call(fieldOverrides, field);
    const lastKey = MASK_KEY[m.source] ?? m.source.split('.').pop() ?? m.source;
    let value: string;
    let checked: boolean | undefined;
    if (type === 'checkbox') {
      checked = has ? ['1', 'true', 'x', 'yes', 'ja', 'on'].includes((fieldOverrides[field] ?? '').trim().toLowerCase()) : m.when ? matchesWhen(raw, m.when) : !!raw.trim();
      values[field] = checked;
      value = checked ? 'X' : '';
    } else {
      value = has ? (fieldOverrides[field] ?? '') : raw ? fmtValue(raw, m) : '';
      values[field] = value;
    }
    const isMissing = !has && !isConst && !m.optional && !raw.trim();
    if (isMissing) {
      const def = DATA_KEY_MAP.get(m.source);
      const e = missing.get(m.source) ?? { source: m.source, group: def?.group ?? 'const', label: def?.label ?? null, fields: [] };
      e.fields.push(field);
      missing.set(m.source, e);
    }
    rows.push({ field, type, source: m.source, key: lastKey, value, ...(checked !== undefined ? { checked } : {}), overridden: has, missing: isMissing });
  }
  return { values, rows, missing: [...missing.values()] };
};

/** Where staff fix a missing value (case page section anchor or a page link). */
export const fixLinkFor = (source: string, ctx: { caseId: string; companyId: string | null }) => {
  const group = source.split('.')[0];
  if (group === 'company') return ctx.companyId ? { href: `/admin/companies/${ctx.companyId}` } : { section: 'case-employment' };
  if (group === 'contract' || group === 'employment') return { section: 'case-employment' };
  if (group === 'spouse' || group === 'children') return { section: 'case-family' };
  if (source === 'case.plannedEntryDate') return { section: 'case-arrival' };
  if (group === 'client' || group === 'passport' || group === 'address' || group === 'case') return { section: 'case-ai' };
  return null;
};
