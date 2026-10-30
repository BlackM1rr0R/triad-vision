import { describe, expect, it } from 'vitest';
import { commissionTriggerReached } from '../../src/lib/partners/commissions.js';
import { paymentStateOf, showExtended } from '../../src/lib/partners/owned.js';

describe('commissionTriggerReached', () => {
  it('ASSIGNED (and unknown values) pay as soon as the case has the partner', () => {
    expect(commissionTriggerReached('ASSIGNED', 'DOCUMENTS_PENDING')).toBe(true);
    expect(commissionTriggerReached(null, 'DOCUMENTS_PENDING')).toBe(true);
    expect(commissionTriggerReached('SOMETHING', 'CANCELLED')).toBe(true);
  });

  it('CONTRACT_SIGNED pays from the signature on, not for refused or cancelled cases', () => {
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'CONTRACT_SENT')).toBe(false);
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'CONTRACT_SIGNED')).toBe(true);
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'APPOINTMENT_SCHEDULED')).toBe(true);
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'APPROVED')).toBe(true);
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'REJECTED')).toBe(false);
    expect(commissionTriggerReached('CONTRACT_SIGNED', 'CANCELLED')).toBe(false);
  });

  it('VISA_APPROVED pays only for an approved visa', () => {
    expect(commissionTriggerReached('VISA_APPROVED', 'DECISION_PENDING')).toBe(false);
    expect(commissionTriggerReached('VISA_APPROVED', 'APPROVED')).toBe(true);
  });
});

describe('showExtended', () => {
  it('needs both the admin setting and the client’s consent', () => {
    expect(showExtended('EXTENDED', true)).toBe(true);
    expect(showExtended('EXTENDED', false)).toBe(false);
    expect(showExtended('EXTENDED', undefined)).toBe(false);
    expect(showExtended('MINIMAL', true)).toBe(false);
  });
});

describe('paymentStateOf', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  const inv = (status: string, grossCents: number, paidCents: number, due = '2026-11-15') => ({ status, grossCents, paidCents, dueDate: new Date(`${due}T00:00:00Z`) });

  it('ignores drafts and cancelled invoices', () => {
    expect(paymentStateOf([], now)).toBe('NONE');
    expect(paymentStateOf([inv('DRAFT', 100, 0), inv('CANCELLED', 100, 0)], now)).toBe('NONE');
  });

  it('PAID when everything is paid, OPEN / PARTIAL / OVERDUE otherwise', () => {
    expect(paymentStateOf([inv('PAID', 100, 100)], now)).toBe('PAID');
    expect(paymentStateOf([inv('SENT', 100, 0)], now)).toBe('OPEN');
    expect(paymentStateOf([inv('PARTIALLY_PAID', 100, 40)], now)).toBe('PARTIAL');
    expect(paymentStateOf([inv('PAID', 100, 100), inv('SENT', 100, 0)], now)).toBe('PARTIAL');
    expect(paymentStateOf([inv('SENT', 100, 0, '2026-10-01')], now)).toBe('OVERDUE');
    expect(paymentStateOf([inv('OVERDUE', 100, 0)], now)).toBe('OVERDUE');
  });
});
