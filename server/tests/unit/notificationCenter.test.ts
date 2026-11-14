import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CATEGORIES, categoryCounts, categoryWhere, notificationCategory } from '../../src/lib/notificationCenter';

describe('notificationCategory', () => {
  it.each([
    ['NEW_MESSAGE', 'message'],
    ['STAFF_MESSAGE', 'message'],
    ['TASK_MENTION', 'message'],
    ['PROBLEM_REPLY', 'message'],
    ['DOCUMENT_ACCEPTED', 'document'],
    ['DOCS_CHANGES_REQUESTED', 'document'],
    ['PASSPORT_EXPIRY_WARNING', 'document'],
    ['SIGNATURE_STATUS', 'document'],
    ['TASK_ASSIGNED', 'task'],
    ['TASK_STATUS', 'task'],
    ['TIMER_IDLE', 'task'],
    ['PAYMENT', 'finance'],
    ['QUOTE_ACCEPTED', 'finance'],
    ['PARTNER_COMMISSION_PAID', 'finance'],
    ['APPROVED', 'case'],
    ['CASE_STATUS_CHANGED', 'case'],
    ['APPOINTMENT_SCHEDULED', 'case'],
    ['RECOGNITION_STATUS', 'case'],
    ['STAFF', 'system'],
    ['SECURITY_ALERT', 'system'],
    ['CAMPAIGN', 'system'],
    ['new_message', 'message'],
  ])('%s → %s', (type, cat) => expect(notificationCategory(type)).toBe(cat));
});

describe('categoryWhere', () => {
  it('excludes the tokens of earlier categories so filters never overlap', () => {
    const w = categoryWhere('case') as { AND: { OR?: unknown[]; NOT?: { OR: unknown[] } }[] };
    expect(w.AND).toHaveLength(2);
    expect(JSON.stringify(w.AND[0])).toContain('"CASE"');
    expect(JSON.stringify(w.AND[1].NOT)).toContain('"MESSAGE"');
    expect(JSON.stringify(w.AND[1].NOT)).toContain('"PAYMENT"');
  });

  it('the first category has no exclusion, system excludes every token', () => {
    expect((categoryWhere('message') as { AND: unknown[] }).AND).toHaveLength(1);
    const sys = JSON.stringify(categoryWhere('system'));
    for (const t of ['MESSAGE', 'DOCUMENT', 'TASK', 'PAYMENT', 'CASE']) expect(sys).toContain(`"${t}"`);
  });
});

describe('categoryCounts', () => {
  it('adds up the type groups per category, every category present', () => {
    const rows = categoryCounts(
      [
        { type: 'NEW_MESSAGE', count: 3 },
        { type: 'STAFF_MESSAGE', count: 1 },
        { type: 'APPROVED', count: 2 },
        { type: 'STAFF', count: 4 },
      ],
      [
        { type: 'NEW_MESSAGE', count: 2 },
        { type: 'STAFF', count: 1 },
      ],
    );
    expect(rows.map((r) => r.key)).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(rows.find((r) => r.key === 'message')).toEqual({ key: 'message', total: 4, unread: 2 });
    expect(rows.find((r) => r.key === 'case')).toEqual({ key: 'case', total: 2, unread: 0 });
    expect(rows.find((r) => r.key === 'system')).toEqual({ key: 'system', total: 4, unread: 1 });
  });
});
