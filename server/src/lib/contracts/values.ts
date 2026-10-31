import type { VisaType } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../http.js';
import { INPUT_KEYS } from './render.js';

/** Languages a template can be written in (dates, labels and signature lines follow it). */
export type ContractLang = 'de' | 'en' | 'az' | 'ru';
export const asContractLang = (l: string | null | undefined): ContractLang => (l === 'en' || l === 'az' || l === 'ru' ? l : 'de');

const INTL: Record<ContractLang, string> = { de: 'de-DE', en: 'en-GB', az: 'az-Latn-AZ', ru: 'ru-RU' };

export const fmtContractDate = (d: Date | string | null | undefined, lang: ContractLang) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return lang === 'en' ? `${dd}/${mm}/${date.getUTCFullYear()}` : `${dd}.${mm}.${date.getUTCFullYear()}`;
};

const fmtMoney = (n: number | null | undefined, lang: ContractLang) =>
  typeof n === 'number' ? `${new Intl.NumberFormat(INTL[lang], { maximumFractionDigits: 0 }).format(n)} €` : '';

export const VISA_TYPE: Record<ContractLang, Record<VisaType, string>> = {
  de: { WORK: 'Erwerbstätigkeit', AUSBILDUNG: 'Berufsausbildung', WEITERBILDUNG: 'Anerkennung / Weiterbildung', JOB_SEEKER: 'Arbeitsplatzsuche (Chancenkarte)', STUDY: 'Studium', FAMILY: 'Familiennachzug', TOURIST: 'Besuch (Schengen)' },
  en: { WORK: 'Employment', AUSBILDUNG: 'Vocational training', WEITERBILDUNG: 'Recognition / further training', JOB_SEEKER: 'Job seeking (Opportunity Card)', STUDY: 'Studies', FAMILY: 'Family reunion', TOURIST: 'Visit (Schengen)' },
  az: { WORK: 'İş vizası', AUSBILDUNG: 'Peşə təhsili (Ausbildung)', WEITERBILDUNG: 'Tanınma / əlavə təhsil', JOB_SEEKER: 'İş axtarışı (Chancenkarte)', STUDY: 'Təhsil', FAMILY: 'Ailə birləşməsi', TOURIST: 'Turist (Şengen)' },
  ru: { WORK: 'Трудоустройство', AUSBILDUNG: 'Профобучение (Ausbildung)', WEITERBILDUNG: 'Признание / доп. обучение', JOB_SEEKER: 'Поиск работы (Chancenkarte)', STUDY: 'Учёба', FAMILY: 'Воссоединение семьи', TOURIST: 'Гостевая (Шенген)' },
};

const l10n = (json: unknown, lang: ContractLang) => {
  if (!json || typeof json !== 'object') return '';
  const o = json as Record<string, unknown>;
  const v = o[lang] ?? o.de ?? o.en ?? o.az;
  return typeof v === 'string' ? v : '';
};

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Triad Vision's own name and address: the Impressum settings first, the contact settings as fallback. */
export const triadParty = async () => {
  const rows = await prisma.setting.findMany({ where: { key: { in: ['legal', 'contact'] } } });
  const legal = (rows.find((r) => r.key === 'legal')?.value ?? {}) as Record<string, unknown>;
  const contact = (rows.find((r) => r.key === 'contact')?.value ?? {}) as Record<string, unknown>;
  const name = [str(legal.companyName), str(legal.legalForm)].filter(Boolean).join(' ') || 'Triad Vision';
  const legalAddress = [str(legal.street), [str(legal.postalCode), str(legal.city)].filter(Boolean).join(' '), str(legal.country)].filter(Boolean).join(', ');
  const offices = Array.isArray(contact.offices) ? (contact.offices as Record<string, unknown>[]) : [];
  return {
    name,
    address: legalAddress || str(offices[0]?.address),
    representative: str(legal.representative),
    registerNumber: str(legal.registerNumber),
    registerCourt: str(legal.registerCourt),
    vatId: str(legal.vatId),
    email: str(legal.email) || str(contact.email),
    phone: str(legal.phone) || str(contact.phone),
  };
};

export type TriadParty = Awaited<ReturnType<typeof triadParty>>;

/** triad.* placeholder values (Impressum settings "legal", contact settings as fallback). */
export const triadValues = (triad: TriadParty): Record<string, string> => ({
  'triad.name': triad.name,
  'triad.address': triad.address,
  'triad.representative': triad.representative,
  'triad.registerNumber': triad.registerNumber,
  'triad.registerCourt': triad.registerCourt,
  'triad.vatId': triad.vatId,
  'triad.email': triad.email,
  'triad.phone': triad.phone,
});

/** Employer columns used by the company.* placeholders (legal data from the Company row). */
export interface CompanyParty {
  name: string;
  legalForm: string | null;
  address: string | null;
  city: string | null;
  street?: string | null;
  postalCode?: string | null;
  country?: string | null;
  betriebsnummer?: string | null;
  registerNumber?: string | null;
  registerCourt?: string | null;
  taxNumber?: string | null;
  vatId?: string | null;
  managingDirector?: string | null;
  signatoryName?: string | null;
  signatoryRole?: string | null;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
}

/** "Hauptstraße 1, 10115 Berlin": the structured columns when filled, else the legacy free-text address + city. */
export const companyAddressLine = (co: Pick<CompanyParty, 'address' | 'city' | 'street' | 'postalCode'>) => {
  if (co.street?.trim()) return [co.street.trim(), [co.postalCode?.trim(), co.city?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [co.address?.replace(/\s*\n\s*/g, ', '), co.address && co.city && co.address.includes(co.city) ? '' : co.city].filter(Boolean).join(', ');
};

/** company.* placeholder values ('' = unknown). `contact`: the contact person (contact name or first login). */
export const companyValues = (co: CompanyParty | null | undefined, contact = ''): Record<string, string> => ({
  'company.name': co ? [co.name, co.legalForm && !co.name.includes(co.legalForm) ? co.legalForm : ''].filter(Boolean).join(' ') : '',
  'company.address': co ? companyAddressLine(co) : '',
  'company.contactPerson': contact || co?.contactName?.trim() || '',
  'company.legalForm': co?.legalForm ?? '',
  'company.street': co?.street ?? '',
  'company.postalCode': co?.postalCode ?? '',
  'company.city': co?.city ?? '',
  'company.country': co?.country ?? '',
  'company.betriebsnummer': co?.betriebsnummer ?? '',
  'company.registerNumber': co?.registerNumber ?? '',
  'company.registerCourt': co?.registerCourt ?? '',
  'company.taxNumber': co?.taxNumber ?? '',
  'company.vatId': co?.vatId ?? '',
  'company.managingDirector': co?.managingDirector ?? '',
  'company.signatoryName': co?.signatoryName?.trim() || co?.managingDirector?.trim() || '',
  'company.signatoryRole': co?.signatoryRole ?? '',
  'company.email': co?.email ?? '',
  'company.phone': co?.phone ?? '',
});

export const loadContractCase = async (caseId: string) => {
  const c = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      client: true,
      visaCategory: { select: { title: true, visaLabel: true } },
      company: { include: { users: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, firstName: true, lastName: true, email: true, phone: true, locale: true } } } },
      vacancy: { select: { title: true, city: true, salaryMin: true, salaryMax: true } },
    },
  });
  if (!c) throw notFound('CASE_NOT_FOUND');
  return c;
};
export type ContractCase = Awaited<ReturnType<typeof loadContractCase>>;

/** Every placeholder value for a case (empty string = unknown → rendered as a blank). */
export const contractValues = async (
  c: ContractCase,
  inputs: Record<string, string | undefined>,
  lang: ContractLang,
  staff: { firstName: string; lastName: string } | null,
  now = new Date(),
): Promise<Record<string, string>> => {
  const triad = await triadParty();
  const cl = c.client;
  const co = c.company;
  const contact = co ? co.contactName?.trim() || (co.users[0] ? `${co.users[0].firstName} ${co.users[0].lastName}`.trim() : '') : '';
  const values: Record<string, string> = {
    'client.fullName': `${cl.firstName} ${cl.lastName}`.trim(),
    'client.firstName': cl.firstName,
    'client.lastName': cl.lastName,
    'client.birthDate': fmtContractDate(cl.birthDate, lang),
    'client.passportNumber': cl.passportNumber ?? '',
    'client.nationality': cl.nationality ?? '',
    'client.address': [cl.address?.replace(/\s*\n\s*/g, ', '), cl.address && cl.city && cl.address.includes(cl.city) ? '' : cl.city].filter(Boolean).join(', '),
    'client.phone': cl.phone ?? '',
    'client.email': cl.email,
    'case.number': c.number,
    'case.visaType': VISA_TYPE[lang][c.visaType] ?? c.visaType,
    'case.visaCategory': c.visaCategory ? [l10n(c.visaCategory.title, lang), c.visaCategory.visaLabel].filter(Boolean).join(' · ') : '',
    'case.profession': c.profession,
    ...companyValues(co, contact),
    'vacancy.title': c.vacancy ? l10n(c.vacancy.title, lang) : '',
    'vacancy.city': c.vacancy?.city ?? '',
    'vacancy.salaryMin': fmtMoney(c.vacancy?.salaryMin, lang),
    'vacancy.salaryMax': fmtMoney(c.vacancy?.salaryMax, lang),
    ...triadValues(triad),
    'staff.fullName': staff ? `${staff.firstName} ${staff.lastName}`.trim() : '',
    today: fmtContractDate(now, lang),
  };
  for (const key of INPUT_KEYS) {
    const raw = inputs[key]?.trim() ?? '';
    values[key] = key === 'startDate' && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? fmtContractDate(`${raw}T00:00:00Z`, lang) : raw;
  }
  return values;
};
