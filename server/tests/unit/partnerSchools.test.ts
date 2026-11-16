import { describe, expect, it } from 'vitest';
import { canRecord, categoryOf, isSchool, levelAfterConfirm, recordData, recordInput, recordInputError } from '../../src/lib/partners/schools';

describe('partner schools: categories', () => {
  it('treats unknown values as AGENCY and only language schools may record', () => {
    expect(categoryOf('SCHOOL')).toBe('SCHOOL');
    expect(categoryOf('LANGUAGE_SCHOOL')).toBe('LANGUAGE_SCHOOL');
    expect(categoryOf('school')).toBe('AGENCY');
    expect(categoryOf(null)).toBe('AGENCY');
    expect(isSchool('AGENCY')).toBe(false);
    expect(isSchool('SCHOOL')).toBe(true);
    expect(isSchool('LANGUAGE_SCHOOL')).toBe(true);
    expect(canRecord('SCHOOL')).toBe(false);
    expect(canRecord('LANGUAGE_SCHOOL')).toBe(true);
    expect(canRecord(undefined)).toBe(false);
  });
});

describe('partner schools: German level after a confirmed record', () => {
  it('raises the level only for a passed exam above the current level', () => {
    expect(levelAfterConfirm(null, { kind: 'EXAM', level: 'B1', passed: true })).toBe('B1');
    expect(levelAfterConfirm('none', { kind: 'EXAM', level: 'a2', passed: true })).toBe('A2');
    expect(levelAfterConfirm('A2', { kind: 'EXAM', level: 'B1', passed: true })).toBe('B1');
  });
  it('never lowers or repeats the level', () => {
    expect(levelAfterConfirm('B2', { kind: 'EXAM', level: 'B1', passed: true })).toBeNull();
    expect(levelAfterConfirm('B1', { kind: 'EXAM', level: 'B1', passed: true })).toBeNull();
  });
  it('ignores failed exams, attendance and unknown levels', () => {
    expect(levelAfterConfirm('A1', { kind: 'EXAM', level: 'B1', passed: false })).toBeNull();
    expect(levelAfterConfirm('A1', { kind: 'EXAM', level: 'B1', passed: null })).toBeNull();
    expect(levelAfterConfirm('A1', { kind: 'ATTENDANCE', level: 'B1', passed: true })).toBeNull();
    expect(levelAfterConfirm('A1', { kind: 'EXAM', level: 'X9', passed: true })).toBeNull();
    expect(levelAfterConfirm('A1', { kind: 'EXAM', level: null, passed: true })).toBeNull();
  });
});

describe('partner schools: record input', () => {
  it('parses multipart strings for an exam', () => {
    const r = recordInput.parse({ kind: 'EXAM', level: 'B1', examDate: '2026-10-01', provider: 'GOETHE', passed: 'true', courseName: '' });
    expect(r).toMatchObject({ kind: 'EXAM', level: 'B1', passed: true });
    expect(recordInputError(r, new Date('2026-11-16T00:00:00Z'))).toBeNull();
    const data = recordData(r);
    expect(data).toMatchObject({ kind: 'EXAM', level: 'B1', provider: 'GOETHE', passed: true, courseName: null });
    expect((data as { examDate: Date }).examDate.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
  it('rejects exams in the future, bad levels and attendance outside 0–100', () => {
    const future = recordInput.parse({ kind: 'EXAM', level: 'A2', examDate: '2027-01-10', provider: 'TELC', passed: false });
    expect(recordInputError(future, new Date('2026-11-16T00:00:00Z'))).toBe('EXAM_DATE_IN_FUTURE');
    expect(recordInput.safeParse({ kind: 'EXAM', level: 'none', examDate: '2026-10-01', provider: 'TELC', passed: true }).success).toBe(false);
    expect(recordInput.safeParse({ kind: 'ATTENDANCE', attendancePct: 101 }).success).toBe(false);
    expect(recordInput.safeParse({ kind: 'ATTENDANCE', attendancePct: -1 }).success).toBe(false);
    expect(recordInput.safeParse({ kind: 'OTHER' }).success).toBe(false);
  });
  it('checks the attendance period order', () => {
    const ok = recordInput.parse({ kind: 'ATTENDANCE', attendancePct: '87', periodFrom: '2026-09-01', periodTo: '2026-10-31' });
    expect(ok).toMatchObject({ attendancePct: 87 });
    expect(recordInputError(ok)).toBeNull();
    const bad = recordInput.parse({ kind: 'ATTENDANCE', attendancePct: 50, periodFrom: '2026-10-31', periodTo: '2026-09-01' });
    expect(recordInputError(bad)).toBe('PERIOD_INVALID');
  });
});
