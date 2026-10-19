import { describe, expect, it } from 'vitest';
import { evaluateRisks, topSeverity, type RiskFacts } from '../../src/lib/aiStaff/risk.js';
import { riskText } from '../../src/lib/aiStaff/texts.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-20T09:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const inDays = (d: number) => new Date(now.getTime() + d * DAY);

const facts = (over: Partial<RiskFacts> = {}): RiskFacts => ({
  caseId: 'c1',
  number: 'TV-2026-0001',
  status: 'DOCUMENTS_PENDING',
  visaType: 'WORK',
  clientName: 'Aysel Məmmədova',
  staffId: 's1',
  staffName: 'Staff One',
  createdAt: ago(30),
  lastActivityAt: ago(1),
  reviewWaitingSince: null,
  pendingReviewCount: 0,
  changeRequestAt: null,
  lastClientActivityAt: ago(1),
  appointmentAt: null,
  missingEmbassyDocs: 0,
  passportExpiresAt: null,
  signatures: [],
  translations: [],
  ...over,
});

const codes = (f: RiskFacts) => evaluateRisks(f, now).map((r) => r.code);

describe('aiStaff risk rules', () => {
  it('a healthy, recently active case has no risks; closed cases never have risks', () => {
    expect(evaluateRisks(facts(), now)).toEqual([]);
    expect(evaluateRisks(facts({ status: 'APPROVED', lastActivityAt: ago(100), passportExpiresAt: ago(5) }), now)).toEqual([]);
    expect(topSeverity([])).toBeNull();
  });

  it('documents waiting for review: > 3 days medium, > 7 days high', () => {
    expect(codes(facts({ status: 'DOCUMENTS_REVIEW', reviewWaitingSince: ago(3), pendingReviewCount: 2 }))).toEqual([]);
    const [m] = evaluateRisks(facts({ status: 'DOCUMENTS_REVIEW', reviewWaitingSince: ago(4), pendingReviewCount: 2 }), now);
    expect(m).toMatchObject({ code: 'REVIEW_WAITING', severity: 'medium', action: 'REVIEW_DOCUMENTS', days: 4, detail: '2' });
    expect(evaluateRisks(facts({ status: 'EMBASSY_REVIEW', reviewWaitingSince: ago(8) }), now)[0].severity).toBe('high');
  });

  it('client silent after a change request: > 7 days, unless the client reacted afterwards', () => {
    const base = { changeRequestAt: ago(8), lastClientActivityAt: ago(10), lastActivityAt: ago(8) };
    expect(evaluateRisks(facts(base), now)[0]).toMatchObject({ code: 'CLIENT_SILENT', severity: 'medium', action: 'REMIND_CLIENT', days: 8 });
    expect(codes(facts({ ...base, lastClientActivityAt: ago(2) }))).not.toContain('CLIENT_SILENT');
    expect(codes(facts({ ...base, changeRequestAt: ago(6) }))).not.toContain('CLIENT_SILENT');
    expect(evaluateRisks(facts({ ...base, changeRequestAt: ago(15), lastClientActivityAt: ago(20), lastActivityAt: ago(10) }), now).find((r) => r.code === 'CLIENT_SILENT')!.severity).toBe('high');
  });

  it('no activity > 14 days (high after 30; low while the embassy decides)', () => {
    expect(codes(facts({ lastActivityAt: ago(14) }))).toEqual([]);
    expect(evaluateRisks(facts({ lastActivityAt: ago(15) }), now)[0]).toMatchObject({ code: 'NO_ACTIVITY', severity: 'medium', action: 'CONTACT_CLIENT', days: 15 });
    expect(evaluateRisks(facts({ lastActivityAt: ago(31) }), now)[0].severity).toBe('high');
    expect(evaluateRisks(facts({ status: 'DECISION_PENDING', lastActivityAt: ago(40) }), now)[0]).toMatchObject({ severity: 'low', action: 'CHECK_EMBASSY' });
  });

  it('appointment in < 7 days with missing embassy documents is high', () => {
    const r = evaluateRisks(facts({ status: 'APPOINTMENT_SCHEDULED', appointmentAt: inDays(5), missingEmbassyDocs: 2 }), now);
    expect(r[0]).toMatchObject({ code: 'APPOINTMENT_DOCS_MISSING', severity: 'high', action: 'COLLECT_EMBASSY_DOCS', days: 5, detail: '2', date: inDays(5).toISOString().slice(0, 10) });
    expect(codes(facts({ appointmentAt: inDays(8), missingEmbassyDocs: 2 }))).toEqual([]);
    expect(codes(facts({ appointmentAt: inDays(3), missingEmbassyDocs: 0 }))).toEqual([]);
    expect(codes(facts({ appointmentAt: ago(1), missingEmbassyDocs: 3 }))).toEqual([]);
  });

  it('passport expiring within 6 months (high within 90 days or expired)', () => {
    expect(codes(facts({ passportExpiresAt: inDays(200) }))).toEqual([]);
    expect(evaluateRisks(facts({ passportExpiresAt: inDays(150) }), now)[0]).toMatchObject({ code: 'PASSPORT_EXPIRING', severity: 'medium', action: 'RENEW_PASSPORT' });
    expect(evaluateRisks(facts({ passportExpiresAt: inDays(60) }), now)[0].severity).toBe('high');
    const expired = evaluateRisks(facts({ passportExpiresAt: ago(3) }), now)[0];
    expect(expired.severity).toBe('high');
    expect(riskText(expired, 'az').title).toContain('bitib');
  });

  it('signature request about to expire and overdue translation orders', () => {
    const sig = evaluateRisks(facts({ signatures: [{ title: 'Arbeitsvertrag', expiresAt: inDays(2) }, { title: 'Later', expiresAt: inDays(10) }, { title: 'No date', expiresAt: null }] }), now);
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ code: 'SIGNATURE_EXPIRING', severity: 'medium', action: 'REMIND_SIGNER', detail: 'Arbeitsvertrag' });
    expect(evaluateRisks(facts({ signatures: [{ title: 'X', expiresAt: new Date(now.getTime() + 6 * 3600_000) }] }), now)[0].severity).toBe('high');

    const tr = evaluateRisks(facts({ translations: [{ number: 7, dueAt: ago(2) }, { number: 8, dueAt: inDays(2) }, { number: 9, dueAt: ago(5) }] }), now);
    expect(tr.map((r) => [r.detail, r.severity])).toEqual([
      ['TR-0009', 'high'],
      ['TR-0007', 'medium'],
    ]);
  });

  it('sorts by severity and localizes titles and suggestions in all four languages', () => {
    const r = evaluateRisks(facts({ status: 'DOCUMENTS_REVIEW', reviewWaitingSince: ago(5), pendingReviewCount: 1, appointmentAt: inDays(2), missingEmbassyDocs: 1, lastActivityAt: ago(16) }), now);
    expect(r[0].severity).toBe('high');
    expect(topSeverity(r)).toBe('high');
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      for (const x of r) {
        const tx = riskText(x, l);
        expect(tx.title.length).toBeGreaterThan(5);
        expect(tx.suggestion.length).toBeGreaterThan(5);
      }
    }
    expect(riskText(r.find((x) => x.code === 'REVIEW_WAITING')!, 'de').title).toBe('Dokumente warten seit 5 Tagen auf Prüfung');
  });
});
