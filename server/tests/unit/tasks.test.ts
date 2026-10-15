import { describe, expect, it } from 'vitest';
import { mentionedIds, parseTaskRef, plainText, taskKey, taskPermissions } from '../../src/lib/tasks/core.js';
import { formatTaskDue, taskTexts } from '../../src/lib/tasks/texts.js';

describe('task keys', () => {
  it('formats and parses task references', () => {
    expect(taskKey(7)).toBe('T-0007');
    expect(taskKey(12345)).toBe('T-12345');
    expect(parseTaskRef('T-0012')).toEqual({ number: 12 });
    expect(parseTaskRef('t12')).toEqual({ number: 12 });
    expect(parseTaskRef('12')).toEqual({ number: 12 });
    expect(parseTaskRef('clx123abc')).toEqual({ id: 'clx123abc' });
  });
});

describe('mentions', () => {
  it('extracts unique user ids and renders plain text', () => {
    const body = 'Hi @[Ann Lee](user:u1) and @[Bob](user:u2), again @[Ann Lee](user:u1)! @[x](user:bad id)';
    expect(mentionedIds(body)).toEqual(['u1', 'u2']);
    expect(plainText(body)).toBe('Hi @Ann Lee and @Bob, again @Ann Lee! @[x](user:bad id)');
    expect(plainText('a'.repeat(400), 10)).toBe('aaaaaaaaa…');
  });
});

describe('permissions', () => {
  const task = { createdById: 'c', assignees: [{ userId: 'a' }] };
  it('separates managers, assignees and other staff', () => {
    expect(taskPermissions({ id: 'c', role: 'STAFF' }, task)).toMatchObject({ edit: true, delete: true, assign: true, status: true });
    expect(taskPermissions({ id: 'a', role: 'STAFF' }, task)).toMatchObject({ edit: false, delete: false, assign: false, status: true, checklist: true });
    expect(taskPermissions({ id: 'x', role: 'STAFF' }, task)).toMatchObject({ edit: false, status: false, comment: true, take: false });
    expect(taskPermissions({ id: 'x', role: 'ADMIN' }, task)).toMatchObject({ edit: true, delete: true });
    expect(taskPermissions({ id: 'x', role: 'STAFF' }, { createdById: null, assignees: [] })).toMatchObject({ take: true, edit: false });
  });
});

describe('texts', () => {
  it('has every message in all four languages', () => {
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      const tx = taskTexts(l);
      const p = { key: 'T-0001', title: 'X', actor: 'A', due: 'D', excerpt: 'E' };
      for (const m of [tx.assigned(p), tx.comment(p), tx.mention(p), tx.dueSoon(p), tx.dueNow(p), tx.overdue(p), tx.status({ ...p, status: 'DONE' })]) {
        expect(m.title.length).toBeGreaterThan(3);
        expect(m.body.length).toBeGreaterThan(3);
      }
      expect(tx.digest({ rows: [{ key: 'T-1', title: 'a', due: 'd', overdue: true }] }).body).toContain('T-1');
      expect(Object.keys(tx.statusLabel)).toHaveLength(5);
    }
  });

  it('formats deadlines in Baku time with Azerbaijani month names', () => {
    const d = new Date('2026-10-15T14:30:00Z');
    expect(formatTaskDue(d, 'az')).toBe('15 okt 2026, 18:30 (Bakı)');
    expect(formatTaskDue(d, 'en')).toBe('15 Oct 2026, 18:30 (Baku)');
    expect(formatTaskDue(d, 'ru')).toContain('18:30 (Баку)');
  });
});
