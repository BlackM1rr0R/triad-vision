import { describe, expect, it } from 'vitest';
import { canTransition, isOverdue, orderKey, parseOrderKey } from '../../src/lib/translations/core.js';
import { formatMoney, translationNotice } from '../../src/lib/translations/texts.js';

// Archived translation orders: Triad Vision no longer offers translation / apostille (no client ordering).

describe('translation order helpers', () => {
  it('formats and parses order numbers', () => {
    expect(orderKey(7)).toBe('TR-0007');
    expect(orderKey(12345)).toBe('TR-12345');
    expect(parseOrderKey('TR-0007')).toBe(7);
    expect(parseOrderKey('tr12')).toBe(12);
    expect(parseOrderKey('42')).toBe(42);
    expect(parseOrderKey('Aliyev')).toBeNull();
  });

  it('allows only the defined status transitions', () => {
    expect(canTransition('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'READY')).toBe(true);
    expect(canTransition('READY', 'DELIVERED')).toBe(true);
    expect(canTransition('NEW', 'CANCELLED')).toBe(true);
    expect(canTransition('NEW', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('QUOTED', 'ACCEPTED')).toBe(false); // only the client accepts
    expect(canTransition('ACCEPTED', 'READY')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'NEW')).toBe(false);
  });

  it('is overdue only while being worked on', () => {
    const now = new Date('2030-01-10T10:00:00Z');
    const past = new Date('2030-01-09T10:00:00Z');
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: 'ACCEPTED', dueAt: past }, now)).toBe(true);
    expect(isOverdue({ status: 'READY', dueAt: past }, now)).toBe(false);
    expect(isOverdue({ status: 'IN_PROGRESS', dueAt: null }, now)).toBe(false);
  });

  it('has notification texts in all four languages and never offers the service again', () => {
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      for (const kind of ['READY', 'DELIVERED', 'CANCELLED', 'ASSIGNED', 'OVERDUE'] as const) {
        const t = translationNotice(kind, l, { number: 'TR-0001', client: 'A B', due: '1', note: 'x' });
        expect(t.title, `${l} ${kind}`).toContain('TR-0001');
      }
    }
    expect(translationNotice('READY', 'de', { number: 'TR-0002', delivery: 'PICKUP' }).body).toContain('abholen');
    expect(translationNotice('READY', 'en', { number: 'TR-0002', delivery: 'DIGITAL' }).body).not.toContain('download');
    expect(translationNotice('CANCELLED', 'az', { number: 'TR-0003' }).body).toContain('özünüz etdirirsiniz');
    expect(formatMoney(12000, 'EUR', 'de')).toContain('120');
  });
});
