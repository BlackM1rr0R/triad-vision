import { describe, expect, it } from 'vitest';
import { computeCommission, payoutEventsOf } from '../../src/lib/agents/commissions.js';
import { coarseStage, displayName } from '../../src/lib/agents/privacy.js';
import { normaliseAgentCode } from '../../src/lib/agents/referral.js';
import { ibanField } from '../../src/lib/agents/validation.js';
import { lastMonths } from '../../src/lib/agents/stats.js';

describe('computeCommission', () => {
  it('FIXED pays the configured cents for every event', () => {
    const a = { commissionType: 'FIXED' as const, commissionValue: 15000 };
    expect(computeCommission(a, 'CASE_CREATED')).toBe(15000);
    expect(computeCommission(a, 'VISA_APPROVED')).toBe(15000);
    expect(computeCommission(a, 'INVOICE_PAID', 999999)).toBe(15000);
  });

  it('PERCENT applies basis points to the invoice amount, rounded, and only for INVOICE_PAID', () => {
    const a = { commissionType: 'PERCENT' as const, commissionValue: 1250 }; // 12.5 %
    expect(computeCommission(a, 'INVOICE_PAID', 100000)).toBe(12500);
    expect(computeCommission(a, 'INVOICE_PAID', 333)).toBe(42); // 41.625 → 42
    expect(computeCommission(a, 'INVOICE_PAID', 0)).toBeNull();
    expect(computeCommission(a, 'INVOICE_PAID')).toBeNull();
    expect(computeCommission(a, 'VISA_APPROVED', 100000)).toBeNull();
    expect(computeCommission({ commissionType: 'PERCENT', commissionValue: 1 }, 'INVOICE_PAID', 10)).toBeNull(); // rounds to 0
  });

  it('a zero value never pays', () => {
    expect(computeCommission({ commissionType: 'FIXED', commissionValue: 0 }, 'CASE_CREATED')).toBeNull();
  });
});

describe('helpers', () => {
  it('payoutEventsOf defaults to VISA_APPROVED and drops unknown values', () => {
    expect(payoutEventsOf(null)).toEqual(['VISA_APPROVED']);
    expect(payoutEventsOf('x')).toEqual(['VISA_APPROVED']);
    expect(payoutEventsOf(['INVOICE_PAID', 'NOPE', 'CASE_CREATED'])).toEqual(['CASE_CREATED', 'INVOICE_PAID']);
    expect(payoutEventsOf([])).toEqual([]);
  });

  it('displayName keeps only first name + last initial', () => {
    expect(displayName({ firstName: 'Əli', lastName: 'məmmədov' })).toBe('Əli M.');
    expect(displayName({ firstName: 'Leyla', lastName: '' })).toBe('Leyla');
  });

  it('coarseStage maps every case status to six public stages', () => {
    expect(coarseStage(null)).toBe('REGISTERED');
    expect(coarseStage('DOCUMENTS_REVIEW')).toBe('DOCUMENTS');
    expect(coarseStage('CONTRACT_SIGNED')).toBe('CONTRACT');
    expect(coarseStage('APPOINTMENT_SCHEDULED')).toBe('EMBASSY');
    expect(coarseStage('APPROVED')).toBe('APPROVED');
    expect(coarseStage('REJECTED')).toBe('CLOSED');
    expect(coarseStage('CANCELLED')).toBe('CLOSED');
  });

  it('normalises codes and validates IBANs', () => {
    expect(normaliseAgentCode(' gəncə-ali! ')).toBe('GNC-ALI');
    expect(ibanField.parse('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000');
    expect(ibanField.parse('')).toBeNull();
    expect(ibanField.parse(undefined)).toBeUndefined();
    expect(ibanField.safeParse('DE89370400440532013001').success).toBe(false);
    expect(ibanField.safeParse('AZ21NABZ00000000137010001944').success).toBe(true);
  });

  it('lastMonths lists 12 months ending with the current one', () => {
    const m = lastMonths(12, new Date('2026-03-15T00:00:00Z'));
    expect(m).toHaveLength(12);
    expect(m[0]).toBe('2025-04');
    expect(m[11]).toBe('2026-03');
  });
});
