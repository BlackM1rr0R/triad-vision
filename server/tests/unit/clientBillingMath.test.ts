import { describe, expect, it } from 'vitest';
import {
  clientLines,
  computeClientTotals,
  daysPastDue,
  deriveStatus,
  firesOnStatus,
  isPastDue,
  nextNumberFrom,
  openCents,
  parseTrigger,
  recognisedRevenue,
  splitByPercent,
  statusReached,
} from '../../src/lib/billing/math.js';
import { fromTemplate, netForGross, PLAN_TEMPLATES } from '../../src/lib/billing/plans.js';

const noon = (s: string) => new Date(`${s}T12:00:00Z`);

describe('client invoice totals', () => {
  it('charges VAT on taxable lines only; embassy fees are passed through without VAT', () => {
    const t = computeClientTotals(
      [
        { quantity: 1, unitPriceCents: 100000, category: 'SERVICE_FEE' },
        { quantity: 2.5, unitPriceCents: 3333, category: 'TRANSLATION' },
        { quantity: 1, unitPriceCents: 7500, category: 'EMBASSY_FEE' },
      ],
      19,
    );
    // taxable 1000,00 + 83,325 → 83,33 = 1083,33; VAT 205,8327 → 205,83
    expect(t).toEqual({ netCents: 115833, taxableCents: 108333, passThroughCents: 7500, vatCents: 20583, grossCents: 136416 });
  });

  it('small business / exempt: rate 0 means no VAT at all', () => {
    expect(computeClientTotals([{ quantity: 3, unitPriceCents: 999, category: 'COURIER' }], 0)).toMatchObject({ vatCents: 0, grossCents: 2997 });
  });

  it('reads stored lines tolerantly (unknown category → OTHER)', () => {
    expect(clientLines([{ description: 'x', quantity: '2', unitPriceCents: 10.4, category: 'BOGUS' }, null, 'y'])).toEqual([
      { description: 'x', quantity: 2, unitPriceCents: 10, category: 'OTHER', servicePeriod: null },
    ]);
  });

  it('recognised revenue = paid share of the net without pass-through fees', () => {
    const items = [
      { description: 'Service', quantity: 1, unitPriceCents: 100000, category: 'SERVICE_FEE' },
      { description: 'Embassy', quantity: 1, unitPriceCents: 7500, category: 'EMBASSY_FEE' },
    ];
    // gross 1000 + 190 + 75 = 1265
    expect(recognisedRevenue({ items, vatRate: 19, grossCents: 126500, paidCents: 126500 })).toBe(100000);
    expect(recognisedRevenue({ items, vatRate: 19, grossCents: 126500, paidCents: 63250 })).toBe(50000);
    expect(recognisedRevenue({ items, vatRate: 19, grossCents: 126500, paidCents: 0 })).toBe(0);
  });
});

describe('numbering', () => {
  it('continues the yearly sequence numerically (not by string order)', () => {
    expect(nextNumberFrom([], 2026)).toBe('TV-KR-2026-0001');
    expect(nextNumberFrom(['TV-KR-2026-0009', 'TV-KR-2026-0010', 'TV-KR-2025-0444', 'DRAFT-x'], 2026)).toBe('TV-KR-2026-0011');
    expect(nextNumberFrom(['TV-KR-2026-9999'], 2026)).toBe('TV-KR-2026-10000');
  });
});

describe('status transitions', () => {
  const inv = (over: Partial<{ status: string; grossCents: number; paidCents: number; dueDate: Date }> = {}) => ({ status: 'SENT', grossCents: 10000, paidCents: 0, dueDate: noon('2026-03-10'), ...over });
  const before = new Date('2026-03-10T20:00:00Z');
  const after = new Date('2026-03-11T13:00:00Z');

  it('follows payments and the due day', () => {
    expect(deriveStatus(inv(), before)).toBe('SENT');
    expect(deriveStatus(inv({ paidCents: 4000 }), before)).toBe('PARTIALLY_PAID');
    expect(deriveStatus(inv({ paidCents: 10000 }), after)).toBe('PAID');
    expect(deriveStatus(inv(), after)).toBe('OVERDUE');
    expect(deriveStatus(inv({ paidCents: 4000, status: 'PARTIALLY_PAID' }), after)).toBe('OVERDUE');
    expect(deriveStatus(inv({ status: 'DRAFT' }), after)).toBe('DRAFT');
    expect(deriveStatus(inv({ status: 'CANCELLED' }), after)).toBe('CANCELLED');
  });

  it('due day and days past due (calendar days at noon UTC)', () => {
    expect(isPastDue(noon('2026-03-10'), before)).toBe(false);
    expect(isPastDue(noon('2026-03-10'), after)).toBe(true);
    expect(daysPastDue(noon('2026-03-10'), new Date('2026-03-13T13:00:00Z'))).toBe(3);
    expect(openCents({ status: 'OVERDUE', grossCents: 10000, paidCents: 2500 })).toBe(7500);
    expect(openCents({ status: 'PAID', grossCents: 10000, paidCents: 10000 })).toBe(0);
    expect(openCents({ status: 'CANCELLED', grossCents: 10000, paidCents: 0 })).toBe(0);
  });
});

describe('payment plan triggers and amounts', () => {
  it('parses triggers', () => {
    expect(parseTrigger('DATE')).toEqual({ kind: 'DATE' });
    expect(parseTrigger('ON_SIGN')).toEqual({ kind: 'ON_SIGN' });
    expect(parseTrigger('CASE_STATUS:APPROVED')).toEqual({ kind: 'CASE_STATUS', status: 'APPROVED' });
    expect(parseTrigger('CASE_STATUS:REJECTED')).toBeNull();
    expect(parseTrigger('SOMETIME')).toBeNull();
  });

  it('a status fires its own trigger and every earlier one; ON_SIGN fires with the contract signature', () => {
    expect(firesOnStatus('CASE_STATUS:EMBASSY_DOCUMENTS', 'EMBASSY_DOCUMENTS')).toBe(true);
    expect(firesOnStatus('CASE_STATUS:EMBASSY_DOCUMENTS', 'APPOINTMENT_SCHEDULED')).toBe(true);
    expect(firesOnStatus('CASE_STATUS:EMBASSY_DOCUMENTS', 'CONTRACT_SIGNED')).toBe(false);
    expect(firesOnStatus('CASE_STATUS:APPROVED', 'REJECTED')).toBe(false);
    expect(firesOnStatus('ON_SIGN', 'CONTRACT_SIGNED')).toBe(true);
    expect(firesOnStatus('ON_SIGN', 'CONTRACT_SENT')).toBe(false);
    expect(firesOnStatus('DATE', 'APPROVED')).toBe(false);
    expect(statusReached('CANCELLED', 'DOCUMENTS_PENDING')).toBe(false);
  });

  it('splits by percent in whole cents, the last part takes the rest', () => {
    expect(splitByPercent(99999, [40, 30, 30])).toEqual([40000, 30000, 29999]);
    expect(splitByPercent(100, [1, 1, 1])).toEqual([33, 33, 34]);
    const parts = splitByPercent(123457, [34, 33, 33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(123457);
  });

  it('builds instalments from a template (labels in the client language, DATE items get monthly dates)', () => {
    const std = PLAN_TEMPLATES.find((t) => t.key === 'standard')!;
    expect(fromTemplate(std, 250000, 'de')).toEqual([
      { label: 'Anzahlung bei Vertragsunterzeichnung', trigger: 'ON_SIGN', dueDate: null, amountCents: 100000 },
      { label: 'Rate bei Botschaftsunterlagen', trigger: 'CASE_STATUS:EMBASSY_DOCUMENTS', dueDate: null, amountCents: 75000 },
      { label: 'Schlussrate bei Visumzusage', trigger: 'CASE_STATUS:APPROVED', dueDate: null, amountCents: 75000 },
    ]);
    const monthly = fromTemplate(PLAN_TEMPLATES.find((t) => t.key === 'monthly3')!, 90000, 'az', new Date('2026-01-31T09:00:00Z'));
    expect(monthly.map((m) => m.dueDate)).toEqual(['2026-01-28', '2026-02-28', '2026-03-28']);
  });

  it('net unit price whose invoice gross is the instalment (exact when such a net exists, else 1 cent off)', () => {
    for (const gross of [100000, 75000, 33333, 1, 99999]) {
      const n = netForGross(gross, 19);
      expect(n + Math.round((n * 19) / 100)).toBe(gross);
    }
    const n = netForGross(123456, 19); // no net gives exactly 1234,56 at 19 %
    expect(Math.abs(n + Math.round((n * 19) / 100) - 123456)).toBeLessThanOrEqual(1);
    expect(netForGross(5000, 0)).toBe(5000);
  });
});
