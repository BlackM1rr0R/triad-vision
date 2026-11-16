import { describe, expect, it } from 'vitest';
import { BUILTIN_TEMPLATES, DEFAULT_ITEMS, KEY_RE, dueFor, dueState, mergeTemplates, templateInput } from '../../src/lib/employerArrivalTemplates';

const row = (over: Partial<Parameters<typeof mergeTemplates>[0][number]> & { key: string }) => ({
  labelDe: 'Label',
  labelEn: null,
  labelAz: null,
  labelRu: null,
  anchor: 'ARRIVAL',
  offsetDays: null,
  visibleToWorker: true,
  active: true,
  sortOrder: 500,
  ...over,
});

describe('employer arrival checklist templates', () => {
  it('has one built-in per default item, in order, with the original eight keeping their sort order', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.key)).toEqual([...DEFAULT_ITEMS]);
    const sorted = [...BUILTIN_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => t.key);
    expect(sorted).toEqual([...DEFAULT_ITEMS]);
    const original = { HOUSING: 10, ANMELDUNG: 20, BANK_ACCOUNT: 30, HEALTH_INSURANCE: 40, TAX_ID: 50, FIRST_DAY: 60, WORKWEAR: 70, SAFETY_BRIEFING: 80 };
    for (const [k, v] of Object.entries(original)) expect(BUILTIN_TEMPLATES.find((t) => t.key === k)?.sortOrder).toBe(v);
    for (const k of DEFAULT_ITEMS) expect(KEY_RE.test(k), k).toBe(true);
  });

  it('computes due dates relative to arrival and first work day', () => {
    const anchors = { arrival: new Date('2027-01-10T14:30:00Z'), firstDay: new Date('2027-01-18T00:00:00Z') };
    const t = (k: string) => BUILTIN_TEMPLATES.find((x) => x.key === k)!;
    expect(dueFor(t('HOUSING'), anchors)?.toISOString().slice(0, 10)).toBe('2026-12-27');
    expect(dueFor(t('ANMELDUNG'), anchors)?.toISOString().slice(0, 10)).toBe('2027-01-17');
    expect(dueFor(t('FIRST_DAY'), anchors)?.toISOString().slice(0, 10)).toBe('2027-01-18');
    expect(dueFor(t('BUDDY'), anchors)?.toISOString().slice(0, 10)).toBe('2027-01-11');
    expect(dueFor(t('HOUSING'), { arrival: null, firstDay: anchors.firstDay })).toBeNull();
    expect(dueFor({ anchor: 'ARRIVAL', offsetDays: null }, anchors)).toBeNull();
  });

  it('merges admin overrides and additions; FIRST_DAY always counts from the first work day', () => {
    const merged = mergeTemplates([
      row({ key: 'HOUSING', labelDe: 'Wohnung (WG) organisiert', anchor: 'FIRST_DAY', offsetDays: -10, active: false, sortOrder: 10 }),
      row({ key: 'FIRST_DAY', anchor: 'ARRIVAL', offsetDays: 5, sortOrder: 60 }),
      row({ key: 'PARKING', labelDe: 'Parkausweis', labelEn: 'Parking permit', offsetDays: 2, sortOrder: 95 }),
    ]);
    const housing = merged.find((t) => t.key === 'HOUSING')!;
    expect(housing).toMatchObject({ builtIn: true, active: false, anchor: 'FIRST_DAY', offsetDays: -10, labels: { de: 'Wohnung (WG) organisiert', en: null } });
    expect(merged.find((t) => t.key === 'FIRST_DAY')).toMatchObject({ anchor: 'FIRST_DAY', offsetDays: 0 });
    expect(merged.find((t) => t.key === 'PARKING')).toMatchObject({ builtIn: false, labels: { de: 'Parkausweis', en: 'Parking permit' } });
    expect(merged.at(-1)?.key).toBe('PARKING');
    expect(merged.find((t) => t.key === 'BANK_ACCOUNT')?.labels).toBeNull();
  });

  it('classifies due states', () => {
    const now = new Date('2027-01-10T12:00:00Z');
    expect(dueState({ done: true, dueDate: new Date('2027-01-01') }, now)).toBe('done');
    expect(dueState({ done: false, dueDate: null }, now)).toBe('none');
    expect(dueState({ done: false, dueDate: new Date('2027-01-09') }, now)).toBe('overdue');
    expect(dueState({ done: false, dueDate: new Date('2027-01-12') }, now)).toBe('soon');
    expect(dueState({ done: false, dueDate: new Date('2027-01-30') }, now)).toBe('ok');
  });

  it('validates admin input', () => {
    expect(templateInput.safeParse({ labelDe: 'X', offsetDays: 500 }).success).toBe(false);
    expect(templateInput.safeParse({ labelDe: '' }).success).toBe(false);
    expect(templateInput.parse({ labelDe: 'Spind', labelEn: '' })).toMatchObject({ labelEn: null, anchor: 'ARRIVAL', active: true });
    expect(KEY_RE.test('parking')).toBe(false);
  });
});
