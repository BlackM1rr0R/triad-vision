/**
 * Sensitive field groups added by the Access Center (SALARY, HEALTH, ADDRESS, FAMILY) — the pure rules the
 * masking engine (lib/privacy/mask.ts) applies to staff JSON responses and exports. No imports, no I/O.
 *
 * The original groups (PASSPORT, ID_NUMBER, IBAN, TAX_ID, BIRTH_PLACE) match by JSON key only. The new groups
 * also need *context*: `address` of a company or an office is business data, `address` of a client is not;
 * `firstName` is only sensitive inside a family member. Defaults: every new group is VISIBLE for every staff
 * role (no masking) until the super admin switches it on.
 *
 * Where the data lives (schema, Nov 2026):
 *  SALARY  EmploymentContract.grossMonthly / grossYearly, FamilyReunionInfo.netMonthly, AI contract check
 *          (grossMonthlySalary, hourlyWage), real-salary records (grossMonthly per contract), family readiness
 *          (inferred.grossMonthly). Invoices / settlements are finance (not masked here). Vacancy salary ranges are
 *          public job ads (not personal).
 *  HEALTH  Case.healthInsuranceExpiresAt (+ the permit reminder item 'insurance'). No medical data is stored
 *          today (the emergency wallpaper's blood type / allergies never leave the browser); the keys below cover
 *          such fields should they be added.
 *  ADDRESS User.address (client, AZ), germanAddress (official forms), ArrivalPlan.housingDetails (flat in
 *          Germany), the employee party of an AI contract check, landlord listings (PartnerHousing address and
 *          contact person) and any landlord object.
 *  FAMILY  FamilyMember personal data (names, birth date / place, passport, contact) and family-member rows
 *          of the register (kind 'member').
 */

export const LEGACY_MASK_GROUPS = ['PASSPORT', 'ID_NUMBER', 'IBAN', 'TAX_ID', 'BIRTH_PLACE'] as const;
export const EXTRA_MASK_GROUPS = ['SALARY', 'HEALTH', 'ADDRESS', 'FAMILY'] as const;
export type ExtraMaskGroup = (typeof EXTRA_MASK_GROUPS)[number];

export const isExtraGroup = (g: string): g is ExtraMaskGroup => (EXTRA_MASK_GROUPS as readonly string[]).includes(g);

/** Keys that are sensitive wherever they appear (exact, case-sensitive). */
export const EXTRA_GROUP_KEYS: Record<ExtraMaskGroup, string[]> = {
  SALARY: [
    'grossMonthly',
    'grossYearly',
    'netMonthly',
    'netYearly',
    'grossMonthlySalary',
    'hourlyWage',
    'grossSalary',
    'netSalary',
    'salaryGross',
    'salaryNet',
    'monthlyGross',
    'monthlyNet',
    'yearlyGross',
    'annualGross',
    'expectedSalary',
    'currentSalary',
    'offeredSalary',
  ],
  HEALTH: [
    'healthInsuranceExpiresAt',
    'healthInsurance',
    'healthInsuranceName',
    'healthInsuranceNumber',
    'healthInsuranceProvider',
    'medicalNotes',
    'medicalCertificate',
    'medicalCertificateNote',
    'healthNotes',
    'disability',
    'disabilityDegree',
    'pregnancy',
    'pregnant',
    'bloodType',
    'allergies',
    'chronicConditions',
  ],
  ADDRESS: [
    'homeAddress',
    'germanAddress',
    'addressGermany',
    'addressInGermany',
    'addressAz',
    'housingDetails',
    'landlordName',
    'landlordPhone',
    'landlordEmail',
    'landlordAddress',
    'rentalAddress',
    'registeredAddress',
  ],
  FAMILY: [],
};

/** Address keys of a person (client, family member, employee party, landlord). */
export const PERSON_ADDRESS_KEYS = ['address', 'street', 'houseNumber', 'postalCode', 'zip', 'zipCode'];
/** Landlord listing (PartnerHousing): the place and the contact person (the listing name stays visible). */
export const LISTING_KEYS = ['address', 'street', 'postalCode', 'contactName', 'contactPhone', 'contactEmail'];
/** An explicit landlord object ({ landlord: { name, phone, … } }): everything personal. */
export const LANDLORD_KEYS = [...LISTING_KEYS, 'name', 'firstName', 'lastName', 'phone', 'email'];
/** Personal data of a family member. */
export const FAMILY_KEYS = ['firstName', 'lastName', 'name', 'fullName', 'birthDate', 'birthPlace', 'placeOfBirth', 'passportNumber', 'passportIssuedAt', 'passportExpiresAt', 'email', 'phone'];

/** Parent keys whose object is a private person (the client and the like). */
const PERSON_PARENTS = new Set(['client', 'user', 'owner', 'candidate', 'worker', 'applicant', 'mainApplicant', 'person', 'employee', 'member', 'sponsor']);
const FAMILY_PARENTS = new Set(['familyMember', 'familyMembers']);
const FAMILY_RELATIONS = new Set(['SPOUSE', 'CHILD', 'PARENT', 'OTHER']);

type Obj = Record<string, unknown>;

/** A family member object (FamilyMember, a register member row, …). */
export const isFamilyObject = (obj: Obj, parentKey: string | undefined) => {
  if (parentKey && FAMILY_PARENTS.has(parentKey)) return true;
  if (obj.kind === 'member' && typeof obj.relation === 'string') return true; // register row of a member case
  return (
    typeof obj.relation === 'string' &&
    FAMILY_RELATIONS.has(obj.relation.toUpperCase()) &&
    ('firstName' in obj || 'lastName' in obj || 'name' in obj) &&
    ('mainCaseId' in obj || 'memberCaseId' in obj || 'joinsWhen' in obj)
  );
};

/** A private person whose address is personal (not a company, office or authority). */
export const isPersonObject = (obj: Obj, parentKey: string | undefined) => {
  if (parentKey && PERSON_PARENTS.has(parentKey)) return true;
  if (obj.role === 'CLIENT') return true;
  return ('firstName' in obj || 'lastName' in obj) && ('birthDate' in obj || 'passportNumber' in obj || 'passportExpiry' in obj);
};

/** The keys of a landlord listing (PartnerHousing) or an explicit landlord object to mask (null: neither). */
export const landlordKeysOf = (obj: Obj, parentKey: string | undefined): string[] | null => {
  if (parentKey === 'landlord') return LANDLORD_KEYS;
  if (('contactName' in obj || 'contactPhone' in obj) && 'address' in obj && ('priceMin' in obj || 'priceMax' in obj)) return LISTING_KEYS;
  return null;
};

/** Permit reminder item of the health insurance: { item: 'insurance', expiresAt }. */
export const isHealthItem = (obj: Obj) => obj.item === 'insurance' && 'expiresAt' in obj;

/** Decimal (Prisma) and similar numeric objects. */
const isDecimalLike = (v: unknown) => !!v && typeof v === 'object' && typeof (v as { toFixed?: unknown }).toFixed === 'function' && typeof (v as { toNumber?: unknown }).toNumber === 'function';

/** Whether a value under a key of a new group is something worth masking (not empty, not masked already). */
export const isExtraValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0 && !v.includes('•');
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  return isDecimalLike(v);
};

/** The masked form of a new-group value: names keep their first letter, everything else is "••••". */
export const maskExtraValue = (group: ExtraMaskGroup, key: string, v: unknown): string => {
  if (group === 'FAMILY' && (key === 'firstName' || key === 'lastName' || key === 'name' || key === 'fullName') && typeof v === 'string') {
    const first = v.trim().charAt(0);
    return first ? `${first}•••` : '••••';
  }
  return '••••';
};

/**
 * Responses of public tools a staff member may use themselves (their own input comes back): the new groups are
 * never applied there (nothing personal of a client is in them).
 */
export const EXTRA_EXCLUDED_PATHS = [
  /^\/api\/public(\/|$)/,
  /^\/api\/budget(\/|$)/,
  /^\/api\/family-check(\/|$)/,
  /^\/api\/real-salaries(\/|$)/,
  /^\/api\/tools(\/|$)/,
  /^\/api\/rental-disclosure(\/|$)/,
  /^\/api\/life(\/|$)/,
  /^\/api\/growth(\/|$)/,
  /^\/api\/when-in-germany(\/|$)/,
  /^\/api\/changes-2027(\/|$)/,
  /^\/api\/pocket-guide(\/|$)/,
  /^\/api\/configurator(\/|$)/,
  /^\/api\/packages(\/|$)/,
  /^\/api\/glossary(\/|$)/,
  /^\/api\/vacancies(\/|$)/,
  /^\/api\/germany-jobs(\/|$)/,
  /^\/api\/study(\/|$)/,
  /^\/api\/compare-visas(\/|$)/,
  /^\/api\/visa-checklist(\/|$)/,
  /^\/api\/landing(\/|$)/,
  /^\/api\/profession-hubs(\/|$)/,
  /^\/api\/candidate-catalogue(\/|$)/,
  /^\/api\/search(\/|$)/,
  /^\/api\/guides(\/|$)/,
];

export const isExtraExcludedPath = (url: string) => EXTRA_EXCLUDED_PATHS.some((re) => re.test(url));

/** Every key a new group can mask (request bodies: masked values sent back unchanged are dropped). */
export const EXTRA_INPUT_KEYS = new Set([...Object.values(EXTRA_GROUP_KEYS).flat(), ...PERSON_ADDRESS_KEYS, ...LANDLORD_KEYS, ...FAMILY_KEYS, 'expiresAt']);
