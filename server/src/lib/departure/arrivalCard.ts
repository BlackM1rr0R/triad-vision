import { prisma } from '../../db.js';
import { getBrand } from '../brand/index.js';
import { firstDayOf } from '../employerArrival.js';

/**
 * Digital "Arrival card" (portal /account/arrival-card, GET /api/account/departure/arrival-card): everything a newly
 * arrived worker needs on one phone screen, also without internet (the page keeps it offline on the device):
 *   - the German address: the accommodation staff wrote into the arrival plan (OFFERED / ARRANGED), else the partner
 *     landlord listing the client was introduced to and is interested in, else just the city;
 *   - the employer (employment contract name, else the company), its contact person and phone, the first work day
 *     (employer arrival checklist FIRST_DAY, else the contract start);
 *   - the arrival (flight, airport, confirmed pickup);
 *   - emergency numbers in Germany, the Azerbaijani embassy in Berlin and the Triad Vision support number
 *     (Setting `contact`.phone, else the brand phone).
 * Client-only, own APPROVED cases only; never public. The QR code (vCard of the contact person) is drawn on the
 * device from these fields.
 */

/** Emergency numbers valid everywhere in Germany, free of charge. */
export const EMERGENCY_NUMBERS = [
  { key: 'emergency', number: '112' }, // fire brigade + ambulance (EU emergency number)
  { key: 'police', number: '110' },
  { key: 'doctorOnCall', number: '116117' }, // ärztlicher Bereitschaftsdienst (non-life-threatening, nights / weekends)
] as const;

/**
 * Embassy of the Republic of Azerbaijan in Berlin — consular section (passports, lost documents) and the embassy's
 * main line. Checked 2026-11-15 against the German Federal Foreign Office's list of foreign missions
 * (auswaertiges-amt.de → Aserbaidschan → Vertretungen); the embassy's own site (berlin.mfa.gov.az) could not be
 * opened from here (TLS certificate error), only its search-indexed contact pages, which give the same numbers.
 * The embassy's street address differs between those sources, so only the consular section's address is shown.
 * Re-check on berlin.mfa.gov.az before relying on it.
 */
export const EMBASSY = {
  website: 'https://berlin.mfa.gov.az',
  phone: '+49 30 219 16 13',
  email: 'berlin@mission.mfa.gov.az',
  consular: { address: 'Hubertusallee 43, 14193 Berlin', phone: '+49 30 206 480 63', email: 'consul_berlin@mission.mfa.gov.az' },
} as const;

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export const supportPhone = async () => {
  const row = await prisma.setting.findUnique({ where: { key: 'contact' } });
  const contact = (row?.value ?? {}) as Record<string, unknown>;
  return str(contact.phone) ?? (await getBrand()).phone;
};

export const arrivalCard = async (userId: string, caseId: string | null) => {
  const c = await prisma.case.findFirst({
    where: { clientId: userId, status: 'APPROVED', ...(caseId ? { id: caseId } : {}) },
    orderBy: [{ parentCaseId: 'asc' }, { decisionAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      parentCaseId: true,
      client: { select: { firstName: true, lastName: true, phone: true } },
      company: { select: { name: true, contactName: true, phone: true, email: true, street: true, postalCode: true, city: true } },
      vacancy: { select: { city: true } },
      arrivalPlan: true,
      housing: { select: { city: true, moveInDate: true } },
    },
  });
  if (!c) return null;
  // A member case without its own plan / contract uses the main application's.
  const mainId = c.parentCaseId && !c.arrivalPlan ? c.parentCaseId : c.id;
  const [mainPlan, contract, firstDayItems, proposal, phone] = await Promise.all([
    mainId === c.id ? Promise.resolve(c.arrivalPlan) : prisma.arrivalPlan.findFirst({ where: { caseId: mainId, clientId: userId } }),
    prisma.employmentContract.findUnique({ where: { caseId: mainId }, select: { employerName: true, startDate: true } }),
    prisma.employerArrivalItem.findMany({ where: { caseId: mainId, key: 'FIRST_DAY' }, select: { key: true, dueDate: true } }),
    prisma.housingProposal.findFirst({
      where: { caseId: c.id, introducedAt: { not: null }, withdrawnAt: null, response: 'INTERESTED' },
      orderBy: { introducedAt: 'desc' },
      select: { listing: { select: { name: true, address: true, city: true, contactName: true, contactPhone: true } } },
    }),
    supportPhone(),
  ]);
  const plan = mainPlan && mainPlan.status !== 'CANCELLED' ? mainPlan : null;
  const company = c.company;
  const staffHousing = plan && (plan.housingStatus === 'OFFERED' || plan.housingStatus === 'ARRANGED') ? str(plan.housingDetails) : null;
  const listing = proposal?.listing ?? null;
  const city = c.housing?.city || plan?.housingCity || listing?.city || c.vacancy?.city || company?.city || null;
  const companyAddress = company ? [str(company.street), [str(company.postalCode), str(company.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null : null;

  return {
    generatedAt: new Date().toISOString(),
    case: { id: c.id, number: c.number },
    holder: { name: `${c.client.firstName} ${c.client.lastName}`.trim(), phone: c.client.phone ?? null },
    address: {
      text: staffHousing ?? (listing?.address ? [listing.address, listing.city].filter(Boolean).join(', ') : null),
      city,
      source: staffHousing ? 'ARRIVAL_PLAN' : listing?.address ? 'PARTNER_HOUSING' : city ? 'CITY' : null,
      landlord: !staffHousing && listing ? { name: str(listing.contactName), phone: str(listing.contactPhone) } : null,
      moveInDate: c.housing?.moveInDate?.toISOString() ?? null,
    },
    employer: company || contract?.employerName
      ? {
          name: str(contract?.employerName) ?? company?.name ?? null,
          contactName: str(company?.contactName),
          phone: str(company?.phone),
          email: str(company?.email),
          address: companyAddress,
        }
      : null,
    firstWorkDay: (firstDayOf(firstDayItems) ?? contract?.startDate ?? null)?.toISOString() ?? null,
    arrival: plan
      ? {
          at: (plan.arrivalTime ?? plan.flightDate)?.toISOString() ?? null,
          flightNumber: plan.flightNumber,
          airport: plan.arrivalAirport,
          pickup: plan.pickupConfirmed ? str(plan.pickupDetails) : null,
        }
      : null,
    emergency: EMERGENCY_NUMBERS.map((e) => ({ ...e })),
    embassy: EMBASSY,
    support: { phone },
  };
};

export type ArrivalCard = NonNullable<Awaited<ReturnType<typeof arrivalCard>>>;
