import { describe, expect, it } from 'vitest';
import { expiryCounts, missingRequired, qualityScore, stagesDue } from '../../src/lib/dataQuality/score.js';

// Data-quality score of active cases (lib/dataQuality/score.ts → /admin/data-quality).

const NOW = new Date('2026-11-16T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);
const clean = { missingProfile: [], missingDocs: 0, expiredDocs: 0, expiringDocs: 0, passportExpiry: inDays(800) };

describe('data-quality score', () => {
  it('a complete case scores 100 with no issues', () => {
    expect(qualityScore(clean, NOW)).toEqual({ score: 100, issues: [], grade: 'good' });
  });

  it('subtracts penalties per category, each capped', () => {
    const r = qualityScore({ ...clean, missingProfile: ['phone', 'address'], missingDocs: 1 }, NOW);
    expect(r.score).toBe(100 - 10 - 8);
    expect(r.issues.map((i) => i.key)).toEqual(['PROFILE', 'DOCS_MISSING']);
    // 20 missing profile fields are capped at −30, 10 missing documents at −40.
    expect(qualityScore({ ...clean, missingProfile: Array(20).fill('x') }, NOW).score).toBe(70);
    expect(qualityScore({ ...clean, missingDocs: 10 }, NOW).score).toBe(60);
    expect(qualityScore({ ...clean, expiredDocs: 5 }, NOW).score).toBe(70);
    expect(qualityScore({ ...clean, expiringDocs: 5 }, NOW).score).toBe(85);
  });

  it('passport expiry: unknown −10, within 6 months −10, expired −20', () => {
    expect(qualityScore({ ...clean, passportExpiry: null }, NOW).issues).toEqual([{ key: 'PASSPORT_EXPIRY_MISSING', count: 1, penalty: 10 }]);
    expect(qualityScore({ ...clean, passportExpiry: inDays(100) }, NOW).score).toBe(90);
    expect(qualityScore({ ...clean, passportExpiry: inDays(200) }, NOW).score).toBe(100);
    expect(qualityScore({ ...clean, passportExpiry: inDays(-1) }, NOW).issues[0].key).toBe('PASSPORT_EXPIRED');
  });

  it('never goes below 0 and grades poor / fair / good', () => {
    const worst = qualityScore({ missingProfile: Array(9).fill('x'), missingDocs: 9, expiredDocs: 9, expiringDocs: 9, passportExpiry: inDays(-5) }, NOW);
    expect(worst.score).toBe(0);
    expect(worst.grade).toBe('poor');
    expect(qualityScore({ ...clean, missingDocs: 3 }, NOW).grade).toBe('fair'); // 76
    expect(qualityScore({ ...clean, missingDocs: 1 }, NOW).grade).toBe('good'); // 92
  });

  it('splits document validity into expired / expiring within 60 days', () => {
    expect(expiryCounts([inDays(-1), inDays(0), inDays(10), inDays(59), inDays(61), null], NOW)).toEqual({ expired: 2, expiring: 2 });
  });

  it('counts required requirements of the stages due without a non-rejected document', () => {
    const reqs = [
      { required: true, stage: 'INITIAL', documents: [] },
      { required: true, stage: 'INITIAL', documents: [{ status: 'REJECTED' }] },
      { required: true, stage: 'INITIAL', documents: [{ status: 'PENDING' }] },
      { required: false, stage: 'INITIAL', documents: [] },
      { required: true, stage: 'EMBASSY', documents: [] },
    ];
    expect(missingRequired(reqs, stagesDue('DOCUMENTS_PENDING'))).toBe(2);
    expect(missingRequired(reqs, stagesDue('EMBASSY_DOCUMENTS'))).toBe(3);
    expect(stagesDue('CONTRACT_SENT')).toEqual(['INITIAL']);
  });
});
