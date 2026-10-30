import { describe, expect, it } from 'vitest';
import { buildClientSnapshot, NEXT_KIND_TEXT, type ClientFacts, type FactCase } from '../../src/lib/ai/client/grounding.js';
import { scrubIdentifiers } from '../../src/lib/ai/redact.js';

const now = new Date('2026-10-30T09:00:00Z');
const L = (az: string, en = az) => ({ az, de: en, en, ru: en });

const kase = (over: Partial<FactCase> = {}): FactCase => ({
  id: 'case1',
  number: 'TV-2026-0042',
  status: 'EMBASSY_DOCUMENTS',
  visaType: 'WORK',
  profession: 'LKW-Fahrer',
  staffNote: 'Pasport surətini yenidən yükləyin',
  appointmentAt: new Date('2026-11-12T08:30:00Z'),
  appointmentPlace: 'Deutsche Botschaft Baku',
  decisionAt: null,
  visaValidFrom: null,
  visaValidTo: null,
  closedAt: null,
  parentCaseId: null,
  category: { title: L('Peşəkar sürücü', 'Professional driver'), visaLabel: '§ 18a' },
  managerFirstName: 'Leyla',
  member: null,
  requirements: [
    { stage: 'EMBASSY', title: L('Pasport', 'Passport'), required: true, latest: { status: 'REJECTED', reviewNote: 'Şəkil bulanıqdır, nömrə C12345678 oxunmur' } },
    { stage: 'EMBASSY', title: L('Diplom', 'Diploma'), required: true, latest: null },
    { stage: 'EMBASSY', title: L('Əlavə məktub', 'Extra letter'), required: false, latest: null },
    { stage: 'EMBASSY', title: L('Sürücülük vəsiqəsi', 'Driving licence'), required: true, latest: { status: 'PENDING', reviewNote: null } },
    { stage: 'INITIAL', title: L('CV'), required: true, latest: { status: 'ACCEPTED', reviewNote: 'ok' } },
  ],
  ...over,
});

const facts = (over: Partial<ClientFacts> = {}): ClientFacts => ({
  now,
  user: { firstName: 'Aynur', germanLevel: 'A2', passportExpiry: new Date('2027-03-01T00:00:00Z') },
  cases: [kase()],
  next: {
    primary: { kind: 'FIX_DOCS', to: '/account/cases/case1?tab=docs#docs-embassy', dueAt: '2026-11-05T00:00:00.000Z', overdue: false, count: 1, detail: L('Pasport', 'Passport') },
    secondary: [{ kind: 'PAY_INVOICE', to: '/account/payments', dueAt: '2026-10-20T00:00:00.000Z', overdue: true, count: 1, detail: 'TV-KR-2026-0007' }],
    waiting: null,
  },
  interviews: [{ startsAt: new Date('2026-11-03T10:00:00Z'), endsAt: new Date('2026-11-03T10:30:00Z'), status: 'CONFIRMED', employer: 'Spedition Müller GmbH', online: true }],
  exams: [{ provider: 'GOETHE', level: 'B1', examDate: new Date('2026-12-01T00:00:00Z'), location: 'Goethe-Institut Baku', registrationDeadline: new Date('2026-11-10T00:00:00Z'), status: 'REGISTERED', passed: null }],
  invoices: [{ number: 'TV-KR-2026-0007', openCents: 45000, currency: 'EUR', dueDate: new Date('2026-10-20T00:00:00Z'), overdue: true }],
  unreadMessages: 2,
  ...over,
});

describe('client assistant grounding snapshot', () => {
  it('contains the stage, next steps, missing / rejected documents with reasons, dates and invoices', () => {
    const s = buildClientSnapshot(facts(), 'en');
    expect(s.today).toBe('2026-10-30');
    expect(s.client).toEqual({ firstName: 'Aynur', germanLevel: 'A2', passportValidUntil: '2027-03-01' });
    const app = s.applications[0];
    expect(app).toMatchObject({
      number: 'TV-2026-0042',
      status: 'EMBASSY_DOCUMENTS',
      step: 'Embassy',
      category: 'Professional driver (§ 18a)',
      caseManager: 'Leyla',
      noteFromTeam: 'Pasport surətini yenidən yükləyin',
      embassyAppointment: { at: '2026-11-12 08:30 UTC', place: 'Deutsche Botschaft Baku' },
      link: '/account/cases/case1',
    });
    expect(app.documents).toEqual({
      accepted: 1,
      total: 5,
      missingRequired: ['Diploma'], // the optional letter is not "missing"
      waitingForReview: ['Driving licence'],
      rejected: [{ title: 'Passport', reason: 'Şəkil bulanıqdır, nömrə •••• oxunmur' }],
    });
    expect(s.nextSteps).toEqual([
      { what: NEXT_KIND_TEXT.FIX_DOCS, detail: 'Passport', dueOn: '2026-11-05', link: '/account/cases/case1?tab=docs#docs-embassy' },
      { what: NEXT_KIND_TEXT.PAY_INVOICE, detail: 'TV-KR-2026-0007', dueOn: '2026-10-20', overdue: true, link: '/account/payments' },
    ]);
    expect(s.upcoming.interviews[0]).toMatchObject({ at: '2026-11-03 10:00 UTC', employer: 'Spedition Müller GmbH', online: true });
    expect(s.upcoming.germanExams[0]).toEqual({ exam: 'GOETHE B1', status: 'REGISTERED', date: '2026-12-01', place: 'Goethe-Institut Baku', registerBy: '2026-11-10' });
    expect(s.openInvoices).toEqual([{ number: 'TV-KR-2026-0007', open: '450.00 EUR', dueOn: '2026-10-20', overdue: true, link: '/account/payments' }]);
    expect(s.unreadMessagesFromTeam).toBe(2);
  });

  it("uses the user's language for titles and marks family member cases", () => {
    const member = kase({ id: 'case2', number: 'TV-2026-0043', status: 'DOCUMENTS_PENDING', visaType: 'FAMILY', parentCaseId: 'case1', member: { firstName: 'Nərmin', relation: 'spouse' }, staffNote: null, appointmentAt: null });
    const s = buildClientSnapshot(facts({ cases: [kase(), member] }), 'az');
    expect(s.applications[0].documents.missingRequired).toEqual(['Diplom']);
    expect(s.applications[1]).toMatchObject({ number: 'TV-2026-0043', visaType: 'FAMILY', familyMember: { firstName: 'Nərmin', relation: 'spouse' } });
    expect(s.applications[1]).not.toHaveProperty('noteFromTeam');
    expect(s.applications[1]).not.toHaveProperty('embassyAppointment');
  });

  it('says who has the ball when there is nothing to do, and copes with no cases / unknown level', () => {
    const s = buildClientSnapshot(
      facts({ cases: [], user: { firstName: 'Elvin', germanLevel: null, passportExpiry: null }, next: { primary: null, secondary: [], waiting: { side: 'EMBASSY', expectedBy: '2026-12-15T00:00:00.000Z' } }, interviews: [], exams: [], invoices: [] }),
      'de',
    );
    expect(s.applications).toEqual([]);
    expect(s.client).toEqual({ firstName: 'Elvin', germanLevel: 'unknown' });
    expect(s.nextSteps).toEqual([]);
    expect(s.nothingToDoNow).toEqual({ waitingFor: 'embassy', expectedBy: '2026-12-15' });
    expect(buildClientSnapshot(facts({ next: null }), 'en')).not.toHaveProperty('nextSteps');
  });

  it('never carries ids of other records, identifiers or fields that are not in the allow-list', () => {
    // Extra (staff-only) fields on the input objects must not leak through: the snapshot picks fields explicitly.
    const c = { ...kase(), processingStage: 'REFUSED', internalNote: 'GEHEIM intern', clientId: 'other-user', passportNumber: 'C99887766' } as FactCase;
    const f = { ...facts({ cases: [c] }), user: { firstName: 'Aynur', germanLevel: 'B1', passportExpiry: null, passportNumber: 'C99887766', birthPlace: 'Gəncə' } } as ClientFacts;
    const json = JSON.stringify(buildClientSnapshot(f, 'en'));
    for (const secret of ['GEHEIM', 'REFUSED', 'other-user', 'C99887766', 'C12345678', 'Gəncə', 'passportNumber', 'internalNote']) expect(json).not.toContain(secret);
  });

  it('long free text is shortened', () => {
    const s = buildClientSnapshot(facts({ cases: [kase({ staffNote: 'x'.repeat(1000) })] }), 'en');
    expect(s.applications[0].noteFromTeam!.length).toBeLessThanOrEqual(300);
  });
});

describe('scrubIdentifiers', () => {
  it('masks passport / ID numbers, IBANs and labelled FIN codes', () => {
    expect(scrubIdentifiers('Pass C12345678 and AA1234567, ID AZE12345678')).toBe('Pass •••• and ••••, ID ••••');
    expect(scrubIdentifiers('IBAN DE89 3704 0044 0532 0130 00 bitte')).toBe('IBAN •••• bitte');
    expect(scrubIdentifiers('AZ21NABZ00000000137010001944')).toBe('••••');
    expect(scrubIdentifiers('FIN kod: 5ABC12D')).toBe('FIN kod: ••••');
  });

  it('keeps case / invoice numbers, dates, amounts, levels and ordinary words', () => {
    const text = 'TV-2026-0042, TV-KR-2026-0007, TR-0012, 2026-11-12, 2800 €, B1, § 18a, Fin Germany, cm1abc23def45ghi';
    expect(scrubIdentifiers(text)).toBe(text);
  });

  it('keeps JSON valid', () => {
    const out = scrubIdentifiers(JSON.stringify({ note: 'C12345678', n: 1 }));
    expect(JSON.parse(out)).toEqual({ note: '••••', n: 1 });
  });
});
