import { describe, expect, it } from 'vitest';
import { levelOf, RISK_RULES, scoreRisk, type RiskCheckIn } from '../../src/lib/checkIns/risk.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-24T10:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY);

const ci = (over: Partial<RiskCheckIn>): RiskCheckIn => ({
  audience: 'WORKER',
  offsetDays: 30,
  sentAt: ago(10),
  answer: null,
  topics: null,
  answeredAt: null,
  resolvedAt: null,
  createdAt: ago(10),
  ...over,
});

describe('churn risk scoring', () => {
  it('is 0 / LOW without answers or with OK answers only', () => {
    expect(scoreRisk([], null, now)).toEqual({ score: 0, level: 'LOW', reasons: [] });
    expect(scoreRisk([ci({ answer: 'OK', answeredAt: ago(9) })], null, now).score).toBe(0);
  });

  it('weighs worker problems, open problems and topics (each topic once)', () => {
    const r = scoreRisk([ci({ answer: 'ISSUE', topics: ['SALARY', 'HOUSING'], answeredAt: ago(5) })], null, now);
    expect(r.score).toBe(RISK_RULES.workerIssue + RISK_RULES.openIssue + 10 + 8);
    expect(r.level).toBe('MEDIUM');
    expect(r.reasons.map((x) => x.code)).toEqual(['WORKER_ISSUE', 'OPEN_ISSUE', 'TOPIC', 'TOPIC']);
    const resolved = scoreRisk([ci({ answer: 'ISSUE', topics: ['SALARY', 'HOUSING'], answeredAt: ago(5), resolvedAt: ago(1) })], null, now);
    expect(resolved.score).toBe(r.score - RISK_RULES.openIssue);
  });

  it('an employer problem weighs more; worker + employer problems with homesickness are HIGH', () => {
    const w = scoreRisk([ci({ answer: 'ISSUE', answeredAt: ago(5), resolvedAt: ago(4) })], null, now).score;
    const e = scoreRisk([ci({ audience: 'EMPLOYER', answer: 'ISSUE', answeredAt: ago(5), resolvedAt: ago(4) })], null, now).score;
    expect(e).toBeGreaterThan(w);
    const both = scoreRisk(
      [ci({ answer: 'ISSUE', topics: ['HOMESICK'], answeredAt: ago(6) }), ci({ audience: 'EMPLOYER', answer: 'ISSUE', topics: ['TEAM'], answeredAt: ago(5) })],
      null,
      now,
    );
    expect(both.level).toBe('HIGH');
    expect(both.reasons[0]).toMatchObject({ code: 'EMPLOYER_ISSUE', points: RISK_RULES.employerIssue });
  });

  it('old answers count half; unanswered check-ins add up to a cap; the trend moves the score', () => {
    const recent = scoreRisk([ci({ answer: 'ISSUE', answeredAt: ago(10), resolvedAt: ago(9) })], null, now).score;
    const old = scoreRisk([ci({ answer: 'ISSUE', answeredAt: ago(200), createdAt: ago(200), resolvedAt: ago(199) })], null, now).score;
    expect(old).toBe(Math.round(recent / 2));
    const silent = scoreRisk([ci({ sentAt: ago(20) }), ci({ sentAt: ago(30) }), ci({ sentAt: ago(40) }), ci({ sentAt: ago(50) }), ci({ sentAt: ago(2) })], null, now);
    expect(silent.reasons).toEqual([{ code: 'NO_ANSWER', points: RISK_RULES.noAnswerMax, params: { count: 4 } }]);
    const worse = scoreRisk([ci({ answer: 'OK', answeredAt: ago(60) }), ci({ answer: 'ISSUE', answeredAt: ago(3), resolvedAt: ago(2) })], null, now);
    expect(worse.reasons.some((x) => x.code === 'TREND_WORSE')).toBe(true);
    const better = scoreRisk([ci({ answer: 'ISSUE', answeredAt: ago(60), resolvedAt: ago(50) }), ci({ answer: 'OK', answeredAt: ago(3) })], null, now);
    expect(better.reasons.some((x) => x.code === 'TREND_BETTER' && x.points < 0)).toBe(true);
  });

  it('the probation end within 30 days adds points (more when there were problems); deterministic', () => {
    expect(scoreRisk([], new Date(now.getTime() + 10 * DAY), now).reasons).toEqual([{ code: 'PROBATION_SOON', points: RISK_RULES.probationQuiet, params: { days: 10 } }]);
    expect(scoreRisk([], new Date(now.getTime() + 40 * DAY), now).reasons).toEqual([]);
    const input = [ci({ answer: 'ISSUE', topics: ['LANGUAGE'], answeredAt: ago(5) })];
    const a = scoreRisk(input, new Date(now.getTime() + 5 * DAY), now);
    expect(a.reasons.find((x) => x.code === 'PROBATION_SOON')?.points).toBe(RISK_RULES.probationWithIssues);
    expect(scoreRisk(input, new Date(now.getTime() + 5 * DAY), now)).toEqual(a);
    expect([levelOf(0), levelOf(RISK_RULES.medium), levelOf(RISK_RULES.high), levelOf(100)]).toEqual(['LOW', 'MEDIUM', 'HIGH', 'HIGH']);
  });
});
