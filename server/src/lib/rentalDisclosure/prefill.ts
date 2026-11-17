import { prisma } from '../../db.js';
import { quickNetMonthly } from '../budget/salary.js';

/**
 * Prefill of the Mieterselbstauskunft for a logged-in client, only from data the portal already holds and only the
 * fields the DSK guidance allows (no birth date, no nationality — asking for nationality is impermissible and the
 * model questionnaire has no birth date): name, current address, phone, e-mail, employer and occupation from the
 * employment contract (else the employer company of the case), net income estimated from the contract's gross
 * (tax class I, the site's payroll engine — marked as an estimate) and the move-in date of the housing checklist.
 * Read-only; nothing is written.
 */

export interface DisclosurePrefill {
  name: string;
  address: string;
  phone: string;
  email: string;
  employer: string;
  occupation: string;
  /** Estimated net per month from the contract gross (EUR), null when unknown. */
  net: number | null;
  /** YYYY-MM-DD */
  moveIn: string;
  sources: Partial<Record<'employer' | 'occupation' | 'net' | 'moveIn', 'contract' | 'case' | 'housing'>>;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export const disclosurePrefill = async (userId: string): Promise<DisclosurePrefill> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { firstName: true, lastName: true, email: true, phone: true, address: true, city: true } });
  const kase = await prisma.case.findFirst({
    where: { clientId: userId, parentCaseId: null, status: { not: 'CANCELLED' } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, profession: true, company: { select: { name: true } }, housing: { select: { moveInDate: true } } },
  });
  const contract = kase ? await prisma.employmentContract.findUnique({ where: { caseId: kase.id }, select: { employerName: true, jobTitle: true, grossMonthly: true, grossYearly: true } }) : null;

  const sources: DisclosurePrefill['sources'] = {};
  const employer = contract?.employerName?.trim() || kase?.company?.name?.trim() || '';
  if (employer) sources.employer = contract?.employerName?.trim() ? 'contract' : 'case';
  const occupation = contract?.jobTitle?.trim() || kase?.profession?.trim() || '';
  if (occupation) sources.occupation = contract?.jobTitle?.trim() ? 'contract' : 'case';
  const gross = num(contract?.grossMonthly) || (num(contract?.grossYearly) ? num(contract!.grossYearly)! / 12 : null);
  const net = gross && gross > 0 ? Math.round(quickNetMonthly(gross) / 10) * 10 : null;
  if (net) sources.net = 'contract';
  const moveIn = kase?.housing?.moveInDate ? kase.housing.moveInDate.toISOString().slice(0, 10) : '';
  if (moveIn) sources.moveIn = 'housing';

  const street = user.address?.trim() ?? '';
  const city = user.city?.trim() ?? '';
  const address = city && !street.toLowerCase().includes(city.toLowerCase()) ? [street, city].filter(Boolean).join(', ') : street;
  return {
    name: [user.lastName, user.firstName].filter(Boolean).join(', '),
    address,
    phone: user.phone ?? '',
    email: user.email,
    employer,
    occupation,
    net,
    moveIn,
    sources,
  };
};
