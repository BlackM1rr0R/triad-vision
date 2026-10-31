/**
 * Contract templates: the documented placeholder set and a pure renderer (unit tested).
 *
 * Syntax: {{group.key}} (spaces inside the braces are allowed). Values come from the case, the client,
 * the linked company / vacancy, the Triad Vision settings and — for the "input" keys — from what the
 * staff member types when creating the contract. A missing or unknown value renders as a blank line
 * ("________") and is reported, so nothing is silently dropped.
 */

export type PlaceholderGroup = 'client' | 'case' | 'company' | 'partner' | 'contract' | 'vacancy' | 'triad' | 'staff' | 'date' | 'input';

export interface PlaceholderDef {
  key: string;
  group: PlaceholderGroup;
  /** typed in by the staff member at send time */
  input?: boolean;
  /** input field type hint for the client */
  type?: 'text' | 'date' | 'number';
}

export const PLACEHOLDERS: PlaceholderDef[] = [
  { key: 'client.fullName', group: 'client' },
  { key: 'client.firstName', group: 'client' },
  { key: 'client.lastName', group: 'client' },
  { key: 'client.birthDate', group: 'client' },
  { key: 'client.passportNumber', group: 'client' },
  { key: 'client.nationality', group: 'client' },
  { key: 'client.address', group: 'client' },
  { key: 'client.phone', group: 'client' },
  { key: 'client.email', group: 'client' },
  { key: 'case.number', group: 'case' },
  { key: 'case.visaType', group: 'case' },
  { key: 'case.visaCategory', group: 'case' },
  { key: 'case.profession', group: 'case' },
  { key: 'company.name', group: 'company' },
  { key: 'company.address', group: 'company' },
  { key: 'company.contactPerson', group: 'company' },
  // Legal data of the employer (Company columns; employer contracts and employment contracts)
  { key: 'company.legalForm', group: 'company' },
  { key: 'company.street', group: 'company' },
  { key: 'company.postalCode', group: 'company' },
  { key: 'company.city', group: 'company' },
  { key: 'company.country', group: 'company' },
  { key: 'company.betriebsnummer', group: 'company' },
  { key: 'company.registerNumber', group: 'company' },
  { key: 'company.registerCourt', group: 'company' },
  { key: 'company.taxNumber', group: 'company' },
  { key: 'company.vatId', group: 'company' },
  { key: 'company.managingDirector', group: 'company' },
  { key: 'company.signatoryName', group: 'company' },
  { key: 'company.signatoryRole', group: 'company' },
  { key: 'company.email', group: 'company' },
  { key: 'company.phone', group: 'company' },
  // Referral partner (PARTNER templates, lib/partnerRecords)
  { key: 'partner.name', group: 'partner' },
  { key: 'partner.legalForm', group: 'partner' },
  { key: 'partner.address', group: 'partner' },
  { key: 'partner.street', group: 'partner' },
  { key: 'partner.postalCode', group: 'partner' },
  { key: 'partner.city', group: 'partner' },
  { key: 'partner.country', group: 'partner' },
  { key: 'partner.registerNumber', group: 'partner' },
  { key: 'partner.registerCourt', group: 'partner' },
  { key: 'partner.vatId', group: 'partner' },
  { key: 'partner.taxId', group: 'partner' },
  { key: 'partner.betriebsnummer', group: 'partner' },
  { key: 'partner.signatoryName', group: 'partner' },
  { key: 'partner.signatoryRole', group: 'partner' },
  { key: 'partner.contactPerson', group: 'partner' },
  { key: 'partner.email', group: 'partner' },
  { key: 'partner.phone', group: 'partner' },
  { key: 'partner.commission', group: 'partner' },
  // The partner contract itself (employer / partner contracts)
  { key: 'contract.title', group: 'contract' },
  { key: 'contract.startDate', group: 'contract' },
  { key: 'contract.endDate', group: 'contract' },
  { key: 'contract.value', group: 'contract' },
  { key: 'contract.noticePeriodDays', group: 'contract' },
  { key: 'vacancy.title', group: 'vacancy' },
  { key: 'vacancy.city', group: 'vacancy' },
  { key: 'vacancy.salaryMin', group: 'vacancy' },
  { key: 'vacancy.salaryMax', group: 'vacancy' },
  { key: 'triad.name', group: 'triad' },
  { key: 'triad.address', group: 'triad' },
  { key: 'triad.representative', group: 'triad' },
  { key: 'triad.registerNumber', group: 'triad' },
  { key: 'triad.registerCourt', group: 'triad' },
  { key: 'triad.vatId', group: 'triad' },
  { key: 'triad.email', group: 'triad' },
  { key: 'triad.phone', group: 'triad' },
  { key: 'staff.fullName', group: 'staff' },
  { key: 'today', group: 'date' },
  { key: 'startDate', group: 'input', input: true, type: 'date' },
  { key: 'salary', group: 'input', input: true, type: 'text' },
  { key: 'workingHours', group: 'input', input: true, type: 'text' },
  { key: 'probationMonths', group: 'input', input: true, type: 'number' },
];

export const PLACEHOLDER_KEYS = new Set(PLACEHOLDERS.map((p) => p.key));
export const INPUT_KEYS = PLACEHOLDERS.filter((p) => p.input).map((p) => p.key);

export const BLANK = '________';
const TOKEN = /\{\{\s*([A-Za-z][A-Za-z0-9_.]*)\s*\}\}/g;

export type Segment = { text: string } | { key: string; value: string | null };

export interface RenderResult {
  text: string;
  /** keys used by the template that have no value (in order of first use, unique) */
  missing: string[];
  /** keys used by the template that are not in the documented set (also rendered as blanks) */
  unknown: string[];
  /** the text split into literal and placeholder parts (lets the UI highlight blanks) */
  segments: Segment[];
}

/** Placeholder keys a template body uses (unique, in order). */
export const usedKeys = (body: string) => [...new Set([...body.matchAll(TOKEN)].map((m) => m[1]))];

export const renderTemplate = (body: string, values: Record<string, string | number | null | undefined>, blank = BLANK): RenderResult => {
  const missing: string[] = [];
  const unknown: string[] = [];
  const segments: Segment[] = [];
  let text = '';
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    const key = m[1];
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: body.slice(last, idx) });
    const raw = PLACEHOLDER_KEYS.has(key) ? values[key] : undefined;
    const value = raw === null || raw === undefined ? '' : String(raw).trim();
    if (!PLACEHOLDER_KEYS.has(key)) {
      if (!unknown.includes(key)) unknown.push(key);
    } else if (!value && !missing.includes(key)) missing.push(key);
    segments.push({ key, value: value || null });
    text += body.slice(last, idx) + (value || blank);
    last = idx + m[0].length;
  }
  if (last < body.length) segments.push({ text: body.slice(last) });
  text += body.slice(last);
  return { text, missing, unknown, segments };
};

/**
 * Lines starting with "//" are editor notes (e.g. "template — have it reviewed, not legal advice"):
 * they stay in the template but never reach the preview, the PDF or the signer.
 */
export const stripComments = (body: string) =>
  body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n')
    .replace(/^\n+/, '');

/** Comments removed, then placeholders filled. */
export const renderContract = (body: string, values: Record<string, string | number | null | undefined>) => renderTemplate(stripComments(body), values);
