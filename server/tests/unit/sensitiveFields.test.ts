import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_MASKING,
  MASK_GROUPS,
  maskAnyWith,
  maskJson,
  maskJsonPolicy,
  maskedGroupsFor,
  policyFromModes,
  resolvePolicy,
  stripMaskedInput,
  type MaskGroup,
  type MaskMode,
  type PolicyOverrides,
} from '../../src/lib/privacy/mask.js';
import { EXTRA_MASK_GROUPS, isExtraExcludedPath } from '../../src/lib/privacy/sensitiveRules.js';
import { extraRevealGroup } from '../../src/lib/privacy/sensitiveReveal.js';

/** A staff-side body touching every group, shaped like the real responses. */
const body = () => ({
  case: {
    id: 'c1',
    healthInsuranceExpiresAt: new Date('2027-03-31T00:00:00Z'),
    residenceTitleExpiresAt: new Date('2028-01-01T00:00:00Z'),
    client: { id: 'u1', firstName: 'Elvin', lastName: 'Məmmədov', email: 'e@x.az', address: 'Bakı, Nizami küç. 12', birthDate: '1994-03-12', passportNumber: 'C01234567' },
  },
  contract: { caseId: 'c1', employerName: 'Muster GmbH', grossMonthly: new Prisma.Decimal('3100.00'), grossYearly: 37200, weeklyHours: 40 },
  reunion: { info: { netMonthly: 2300, warmRent: 900 }, inferred: { grossMonthly: 3100 } },
  vacancy: { title: 'Fahrer', salaryMin: 2800, salaryMax: 3200 },
  invoice: { number: 'R-1', grossCents: 119000, netCents: 100000 },
  company: { name: 'Muster GmbH', address: 'Hamburg, Hafenstraße 1', vatId: 'DE123456789' },
  office: { address: 'Bakı, 28 May 1' },
  arrival: { housingDetails: 'Berlin, Musterstraße 5', housingCity: 'Berlin' },
  listing: { name: 'Wohnheim Mitte', city: 'Berlin', priceMin: 400, priceMax: 600, address: 'Berlin, Torstr. 1', contactName: 'Frau Schulz', contactPhone: '+49 30 123', contactEmail: 's@x.de' },
  permits: { items: [{ item: 'insurance', expiresAt: '2027-03-31' }, { item: 'residence', expiresAt: '2028-01-01' }] },
  family: {
    main: { id: 'c1', name: 'Elvin Məmmədov' },
    members: [
      {
        caseId: 'c2',
        relation: 'spouse',
        profile: { id: 'f1', mainCaseId: 'c1', memberCaseId: 'c2', relation: 'spouse', firstName: 'Aysel', lastName: 'Məmmədova', birthDate: '1996-07-01', passportNumber: 'C07654321', email: 'a@x.az', joinsWhen: 'WITH_MAIN' },
      },
    ],
  },
  register: [{ id: 'c2', kind: 'member', relation: 'spouse', firstName: 'Aysel', lastName: 'Məmmədova', birthDate: '1996-07-01', passportNumber: 'C07654321', phone: null, email: 'a@x.az' }],
  formFields: [{ source: 'contract.grossMonthly', value: 3100 }, { source: 'client.lastName', value: 'Məmmədov' }],
});

const modesOf = (masked: MaskGroup[], hidden: MaskGroup[] = []) =>
  Object.fromEntries(MASK_GROUPS.map((g) => [g, { mode: (hidden.includes(g) ? 'HIDDEN' : masked.includes(g) ? 'MASKED' : 'VISIBLE') as MaskMode }])) as Record<MaskGroup, { mode: MaskMode }>;

describe('sensitive field groups — defaults are today', () => {
  it('the new groups are not masked for anybody by default', () => {
    for (const role of ['STAFF', 'ADMIN'] as const) {
      const modes = resolvePolicy({ role, id: 'u' }, DEFAULT_MASKING, new Map(), null);
      for (const g of EXTRA_MASK_GROUPS) expect(modes[g]).toEqual({ mode: 'VISIBLE', source: 'default' });
      // The original groups exactly as the setting says.
      expect(policyFromModes(modes).masked).toEqual(maskedGroupsFor({ role }, DEFAULT_MASKING));
      expect(policyFromModes(modes).hidden.size).toBe(0);
    }
    for (const role of ['SUPER_ADMIN', 'CLIENT', 'COMPANY', 'AGENT'] as const) {
      const p = policyFromModes(resolvePolicy({ role, id: 'u' }, { STAFF: [...MASK_GROUPS], ADMIN: [...MASK_GROUPS] }, new Map(), null));
      expect(p.masked.size + p.hidden.size).toBe(0);
    }
  });

  it('with the default STAFF groups only passport / id / bank / tax values change (byte for byte the old behaviour)', () => {
    const groups = maskedGroupsFor({ role: 'STAFF' }, DEFAULT_MASKING);
    const b = body();
    const viaPolicy = maskJsonPolicy({ masked: groups, hidden: new Set() }, b);
    expect(JSON.stringify(viaPolicy)).toBe(JSON.stringify(maskJson(groups, b)));
    const out = viaPolicy as ReturnType<typeof body>;
    expect(out.case.client.passportNumber).toBe('•••• 567');
    expect(out.company.vatId).toBe('•••• 6789');
    // New-group data untouched.
    expect(out.contract.grossMonthly).toBe(b.contract.grossMonthly);
    expect(out.case.client.address).toBe(b.case.client.address);
    expect(out.case.healthInsuranceExpiresAt).toBe(b.case.healthInsuranceExpiresAt);
    expect(out.family.members[0].profile.firstName).toBe('Aysel');
    expect(out.listing.contactName).toBe('Frau Schulz');
  });
});

describe('SALARY / HEALTH / ADDRESS / FAMILY when switched on', () => {
  it('SALARY: contract, reunion and form-field salaries masked; vacancy ranges and invoices untouched', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf(['SALARY'])), body()) as ReturnType<typeof body>;
    expect(out.contract.grossMonthly).toBe('••••');
    expect(out.contract.grossYearly).toBe('••••');
    expect(out.contract.weeklyHours).toBe(40);
    expect(out.reunion.info.netMonthly).toBe('••••');
    expect(out.reunion.info.warmRent).toBe(900);
    expect(out.reunion.inferred.grossMonthly).toBe('••••');
    expect(out.formFields[0].value).toBe('••••');
    expect(out.formFields[1].value).toBe('Məmmədov');
    expect(out.vacancy).toEqual(body().vacancy);
    expect(out.invoice).toEqual(body().invoice);
    expect(out.case.client.passportNumber).toBe('C01234567'); // other groups as configured (visible here)
  });

  it('HIDDEN sends null instead of a mask', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf([], ['SALARY'])), body()) as ReturnType<typeof body>;
    expect(out.contract.grossMonthly).toBeNull();
    expect(out.reunion.info.netMonthly).toBeNull();
  });

  it('HEALTH: insurance date (Date or string) and the insurance reminder item; residence title stays', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf(['HEALTH'])), body()) as ReturnType<typeof body>;
    expect(out.case.healthInsuranceExpiresAt).toBe('••••');
    expect(out.case.residenceTitleExpiresAt).toEqual(new Date('2028-01-01T00:00:00Z'));
    expect(out.permits.items[0].expiresAt).toBe('••••');
    expect(out.permits.items[1].expiresAt).toBe('2028-01-01');
  });

  it('ADDRESS: client home address, flat in Germany and landlord contact; company / office addresses stay', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf(['ADDRESS'])), body()) as ReturnType<typeof body>;
    expect(out.case.client.address).toBe('••••');
    expect(out.arrival.housingDetails).toBe('••••');
    expect(out.arrival.housingCity).toBe('Berlin');
    expect(out.listing).toMatchObject({ name: 'Wohnheim Mitte', city: 'Berlin', address: '••••', contactName: '••••', contactPhone: '••••', contactEmail: '••••' });
    expect(out.company.address).toBe('Hamburg, Hafenstraße 1');
    expect(out.office.address).toBe('Bakı, 28 May 1');
    expect(out.case.client.firstName).toBe('Elvin');
  });

  it('FAMILY: member names keep the initial, dates / passport / e-mail masked; the main applicant stays', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf(['FAMILY'])), body()) as ReturnType<typeof body>;
    const p = out.family.members[0].profile;
    expect(p.firstName).toBe('A•••');
    expect(p.lastName).toBe('M•••');
    expect(p.birthDate).toBe('••••');
    expect(p.passportNumber).toBe('••••');
    expect(p.email).toBe('••••');
    expect(p.joinsWhen).toBe('WITH_MAIN');
    expect(out.family.main.name).toBe('Elvin Məmmədov');
    expect(out.case.client.firstName).toBe('Elvin');
    expect(out.register[0]).toMatchObject({ firstName: 'A•••', lastName: 'M•••', birthDate: '••••', passportNumber: '••••', phone: null });
  });

  it('a hidden original group wins over a masked new group on the same field', () => {
    const out = maskJsonPolicy(policyFromModes(modesOf(['FAMILY'], ['PASSPORT'])), body()) as ReturnType<typeof body>;
    expect(out.family.members[0].profile.passportNumber).toBeNull();
    expect(out.case.client.passportNumber).toBeNull();
  });

  it('exports: maskAnyWith masks numbers and dates of a new group, leaves others', () => {
    const g = new Set<MaskGroup>(['SALARY', 'FAMILY']);
    expect(maskAnyWith(g, 'grossMonthly', 3100)).toBe('••••');
    expect(maskAnyWith(g, 'birthDate', '1996-07-01', 'FAMILY')).toBe('••••');
    expect(maskAnyWith(g, 'firstName', 'Aysel', 'FAMILY')).toBe('A•••');
    expect(maskAnyWith(g, 'weeklyHours', 40)).toBe(40);
    expect(maskAnyWith(new Set(), 'grossMonthly', 3100)).toBe(3100);
  });
});

describe('policy precedence', () => {
  const overrides: PolicyOverrides = new Map([
    ['role:STAFF', new Map<MaskGroup, MaskMode>([['ADDRESS', 'HIDDEN']])],
    ['template:tpl1', new Map<MaskGroup, MaskMode>([['SALARY', 'MASKED'], ['ADDRESS', 'VISIBLE']])],
    ['user:u1', new Map<MaskGroup, MaskMode>([['SALARY', 'VISIBLE'], ['PASSPORT', 'VISIBLE']])],
  ]);
  const settings = { STAFF: ['PASSPORT', 'HEALTH'] as MaskGroup[], ADMIN: [] as MaskGroup[] };

  it('user > template > role (hidden row, then the setting) > visible', () => {
    const m = resolvePolicy({ role: 'STAFF', id: 'u1' }, settings, overrides, 'tpl1');
    expect(m.SALARY).toEqual({ mode: 'VISIBLE', source: 'user' });
    expect(m.PASSPORT).toEqual({ mode: 'VISIBLE', source: 'user' });
    expect(m.ADDRESS).toEqual({ mode: 'VISIBLE', source: 'template' });
    expect(m.HEALTH).toEqual({ mode: 'MASKED', source: 'role' });
    expect(m.FAMILY).toEqual({ mode: 'VISIBLE', source: 'default' });
    const other = resolvePolicy({ role: 'STAFF', id: 'u2' }, settings, overrides, null);
    expect(other.ADDRESS).toEqual({ mode: 'HIDDEN', source: 'role' });
    expect(other.SALARY.mode).toBe('VISIBLE');
    expect(other.PASSPORT.mode).toBe('MASKED');
    // Role rows of STAFF never reach ADMIN.
    expect(resolvePolicy({ role: 'ADMIN', id: 'u3' }, settings, overrides, null).ADDRESS.mode).toBe('VISIBLE');
  });

  it('overrides never apply to SUPER_ADMIN', () => {
    const p = policyFromModes(resolvePolicy({ role: 'SUPER_ADMIN', id: 'u1' }, settings, new Map([['user:u1', new Map<MaskGroup, MaskMode>([['SALARY', 'HIDDEN']])]]), null));
    expect(p.masked.size + p.hidden.size).toBe(0);
  });
});

describe('request bodies, paths and reveal entities', () => {
  it('masked values of new-group keys sent back unchanged are dropped only when new groups are active', () => {
    const input = () => ({ grossMonthly: '••••', note: 'x', address: '••••', firstName: 'A•••', weeklyHours: 40, fields: [{ source: 'contract.grossMonthly', value: '••••' }, { source: 'x', value: 1 }] });
    expect(stripMaskedInput(input(), 0, true)).toEqual({ note: 'x', weeklyHours: 40, fields: [{ source: 'x', value: 1 }] });
    // Without new groups: grossMonthly is a known key (dropped), contextual keys stay as before.
    expect(stripMaskedInput(input())).toMatchObject({ address: '••••', firstName: 'A•••' });
  });

  it('public tools are never masked by the new groups; staff APIs are', () => {
    expect(isExtraExcludedPath('/api/budget/plan')).toBe(true);
    expect(isExtraExcludedPath('/api/family-check')).toBe(true);
    expect(isExtraExcludedPath('/api/real-salaries')).toBe(true);
    expect(isExtraExcludedPath('/api/admin/real-salaries')).toBe(false);
    expect(isExtraExcludedPath('/api/admin/placement/cases/x/contract')).toBe(false);
    expect(isExtraExcludedPath('/api/family/cases/x')).toBe(false);
  });

  it('reveal entities map to their group (10-character reason); original ones do not', () => {
    expect(extraRevealGroup('employmentContract', 'grossMonthly')).toBe('SALARY');
    expect(extraRevealGroup('casePermit', 'healthInsuranceExpiresAt')).toBe('HEALTH');
    expect(extraRevealGroup('partnerHousing', 'contactPhone')).toBe('ADDRESS');
    expect(extraRevealGroup('familyPerson', 'birthDate')).toBe('FAMILY');
    expect(extraRevealGroup('employmentContract', 'note')).toBeNull();
    expect(extraRevealGroup('user', 'passportNumber')).toBeNull();
  });
});
