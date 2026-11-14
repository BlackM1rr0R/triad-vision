import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Phone staff view (client/src/components/staffMobile/pure.ts): swipe threshold / outcome maths and the quick case
 * transitions per status. Loaded by URL so the server type-check does not pull client sources in.
 */

type Allowed = { left: boolean; right: boolean };
type Pure = {
  swipeThreshold: (w: number) => number;
  swipeOffset: (dx: number, t: number, a: Allowed) => number;
  swipeOutcome: (dx: number, t: number, a: Allowed, v?: number) => 'left' | 'right' | null;
  isHorizontal: (dx: number, dy: number) => boolean;
  quickActionsFor: (s: string) => string[];
  actionBody: (a: string, note?: string) => Record<string, unknown>;
  nextStatusOf: (s: string, a: string) => string;
};

let p: Pure;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/components/staffMobile/pure.ts');
  p = (await import(pathToFileURL(file).href)) as Pure;
});

const both = { left: true, right: true };

describe('swipe maths', () => {
  it('threshold is 35 % of the row, between 72 and ~115 px', () => {
    expect(p.swipeThreshold(100)).toBe(72);
    expect(p.swipeThreshold(300)).toBe(105);
    expect(p.swipeThreshold(1000)).toBeCloseTo(115.2);
  });

  it('triggers past the threshold, or on a quick flick; never on a side without an action', () => {
    expect(p.swipeOutcome(80, 72, both)).toBe('right');
    expect(p.swipeOutcome(-80, 72, both)).toBe('left');
    expect(p.swipeOutcome(50, 72, both)).toBeNull();
    expect(p.swipeOutcome(30, 72, both, 1)).toBe('right');
    expect(p.swipeOutcome(30, 72, both, -1)).toBeNull();
    expect(p.swipeOutcome(5, 72, both, 2)).toBeNull();
    expect(p.swipeOutcome(-200, 72, { left: false, right: true })).toBeNull();
  });

  it('rubber-bands past the threshold and resists a blocked side', () => {
    expect(p.swipeOffset(50, 72, both)).toBe(50);
    expect(p.swipeOffset(172, 72, both)).toBeCloseTo(107);
    expect(p.swipeOffset(-200, 72, { left: false, right: true })).toBe(-16);
  });

  it('horizontal only when clearly more sideways than vertical', () => {
    expect(p.isHorizontal(30, 5)).toBe(true);
    expect(p.isHorizontal(30, 28)).toBe(false);
    expect(p.isHorizontal(6, 0)).toBe(false);
  });
});

describe('quick case transitions', () => {
  it('offers only the steps the status allows', () => {
    expect(p.quickActionsFor('DOCUMENTS_REVIEW')).toEqual(['REQUEST_CHANGES']);
    expect(p.quickActionsFor('CONTRACT_SIGNED')).toEqual(['CONFIRM_CONTRACT', 'REJECT_SIGNATURE']);
    expect(p.quickActionsFor('APPOINTMENT_SCHEDULED')).toEqual(['MARK_LODGED']);
    expect(p.quickActionsFor('DECISION_PENDING')).toEqual(['APPROVE', 'REJECT']);
    expect(p.quickActionsFor('DOCUMENTS_PENDING')).toEqual([]);
    expect(p.quickActionsFor('APPROVED')).toEqual([]);
  });

  it('maps to the /actions bodies and the next status', () => {
    expect(p.actionBody('APPROVE')).toEqual({ action: 'DECIDE', decision: 'APPROVED' });
    expect(p.actionBody('REJECT', ' Maliyyə ')).toEqual({ action: 'DECIDE', decision: 'REJECTED', reason: 'Maliyyə' });
    expect(p.actionBody('REQUEST_CHANGES', 'Pasport aydın deyil')).toEqual({ action: 'REQUEST_CHANGES', note: 'Pasport aydın deyil' });
    expect(p.actionBody('MARK_LODGED')).toEqual({ action: 'MARK_LODGED' });
    expect(p.nextStatusOf('EMBASSY_REVIEW', 'REQUEST_CHANGES')).toBe('EMBASSY_DOCUMENTS');
    expect(p.nextStatusOf('DOCUMENTS_REVIEW', 'REQUEST_CHANGES')).toBe('DOCUMENTS_PENDING');
    expect(p.nextStatusOf('CONTRACT_SIGNED', 'CONFIRM_CONTRACT')).toBe('EMBASSY_DOCUMENTS');
  });
});
