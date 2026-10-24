import { describe, expect, it } from 'vitest';
import { LEAD_SCORING_DEFAULTS, leadScoringSchema, quizFitOf, scoreLead, sourceKeyOf, type LeadInput } from '../../src/lib/marketing/leadScoring.js';
import { COST_DEFAULTS, computeCost, costCalculatorSchema, feesFor, needsBlockedAccount } from '../../src/lib/marketing/costCalculator.js';
import { normaliseCountry, normaliseOrigin } from '../../src/lib/marketing/originMap.js';
import { formConfigSchema, sectionsOf, sectionsSchema, slugify, videoEmbedUrl, DEFAULT_FORM_CONFIG } from '../../src/lib/marketing/landing.js';
import { sectionOf } from '../../src/lib/marketing/visitors.js';

const NOW = new Date('2026-10-24T12:00:00Z');
const HOUR = 60 * 60 * 1000;

const lead = (over: Partial<LeadInput> = {}): LeadInput => ({
  kind: 'contact',
  source: null,
  sector: null,
  workersNeeded: null,
  email: 'ali@test.local',
  phone: null,
  message: 'Salam',
  createdAt: new Date(NOW.getTime() - HOUR),
  quizResult: null,
  estimate: null,
  visitor: null,
  ...over,
});

const reasonOf = (r: ReturnType<typeof scoreLead>, code: string, key?: string) => r.reasons.find((x) => x.code === code && (key === undefined || x.key === key));

describe('lead scoring: source', () => {
  it('maps inquiry source / kind / sector to a source rule', () => {
    expect(sourceKeyOf({ kind: 'contact', source: 'event:abc', sector: null })).toBe('event');
    expect(sourceKeyOf({ kind: 'company', source: 'landing:surucu-isi', sector: null })).toBe('landing');
    expect(sourceKeyOf({ kind: 'contact', source: 'cost-calculator', sector: 'x' })).toBe('calculator');
    expect(sourceKeyOf({ kind: 'contact', source: 'quiz', sector: 'AI advisor' })).toBe('quiz');
    expect(sourceKeyOf({ kind: 'contact', source: null, sector: 'AI advisor' })).toBe('advisor');
    expect(sourceKeyOf({ kind: 'contact', source: null, sector: 'Live chat' })).toBe('livechat');
    expect(sourceKeyOf({ kind: 'company', source: null, sector: 'Logistik' })).toBe('company');
    expect(sourceKeyOf({ kind: 'contact', source: null, sector: null })).toBe('contact');
    expect(sourceKeyOf({ kind: 'weird', source: null, sector: null })).toBe('other');
  });
});

describe('lead scoring: rules', () => {
  const s = LEAD_SCORING_DEFAULTS;

  it('a bare contact form message is COLD; reasons explain every point', () => {
    const r = scoreLead(lead(), s, NOW);
    // source 10 + recency d1 10 + email 5
    expect(r.score).toBe(25);
    expect(r.level).toBe('COLD');
    expect(reasonOf(r, 'source', 'contact')?.points).toBe(10);
    expect(reasonOf(r, 'recency', 'd1')?.points).toBe(10);
    expect(reasonOf(r, 'contact', 'email')?.points).toBe(5);
    expect(r.reasons.reduce((a, x) => a + x.points, 0)).toBe(r.score);
  });

  it('contact completeness: phone and a real message add points', () => {
    const r = scoreLead(lead({ phone: '+994 50 111 22 33', message: 'Almaniyada sürücü kimi işləmək istəyirəm, B1 səviyyəm var.' }), s, NOW);
    expect(reasonOf(r, 'contact', 'phone')?.points).toBe(10);
    expect(reasonOf(r, 'contact', 'message')?.points).toBe(5);
    expect(r.score).toBe(40);
    expect(r.level).toBe('WARM');
  });

  it('company inquiries score by workers needed, capped', () => {
    const small = scoreLead(lead({ kind: 'company', workersNeeded: 5 }), s, NOW);
    expect(reasonOf(small, 'company')).toMatchObject({ points: 15, n: 5 });
    const big = scoreLead(lead({ kind: 'company', workersNeeded: 500 }), s, NOW);
    expect(reasonOf(big, 'company')?.points).toBe(25);
    // source company 20 + company 25 + d1 10 + email 5
    expect(big.score).toBe(60);
    expect(big.level).toBe('HOT');
  });

  it('quiz fit from the inquiry wins over the visitor counters', () => {
    expect(quizFitOf({ fit: 'medium' }, { quiz_high: 1 })).toBe('medium');
    expect(quizFitOf(null, { quiz_low: 2, quiz_high: 1 })).toBe('high');
    expect(quizFitOf(null, {})).toBeNull();
    const r = scoreLead(lead({ source: 'quiz', quizResult: { path: 'driver', fit: 'high', score: 82 } }), s, NOW);
    expect(reasonOf(r, 'quiz', 'high')?.points).toBe(20);
  });

  it('visitor events count up to eventRepeat times and the visitor part is capped', () => {
    const visitor = { events: { cost_calc: 5, booking_done: 1, quiz_done: 1, landing_view: 3, unknown: 9 }, pageViews: 40, lastSeenAt: new Date(NOW.getTime() - HOUR) };
    const r = scoreLead(lead({ visitor }), s, NOW);
    expect(reasonOf(r, 'event', 'cost_calc')).toMatchObject({ n: 5 });
    const visitorPoints = r.reasons.filter((x) => x.code === 'event' || x.code === 'pageViews').reduce((a, x) => a + x.points, 0);
    expect(visitorPoints).toBe(s.visitorCap);
    expect(reasonOf(r, 'event', 'unknown')).toBeUndefined();
    // uncapped: cost 20 (2×10) + booking 20 + quiz 8 + landing 6 + views 10 = 64 → cap 35
    const uncapped = scoreLead(lead({ visitor }), { ...s, visitorCap: 100 }, NOW);
    expect(uncapped.reasons.filter((x) => x.code === 'event' || x.code === 'pageViews').reduce((a, x) => a + x.points, 0)).toBe(64);
  });

  it('recency buckets use the latest activity of inquiry or visitor', () => {
    const old = new Date(NOW.getTime() - 40 * 24 * HOUR);
    expect(reasonOf(scoreLead(lead({ createdAt: old }), s, NOW), 'recency', 'older')?.points).toBe(-10);
    expect(reasonOf(scoreLead(lead({ createdAt: new Date(NOW.getTime() - 3 * 24 * HOUR) }), s, NOW), 'recency', 'd7')?.points).toBe(5);
    const back = scoreLead(lead({ createdAt: old, visitor: { events: {}, pageViews: 0, lastSeenAt: new Date(NOW.getTime() - HOUR) } }), s, NOW);
    expect(reasonOf(back, 'recency', 'd1')).toBeDefined();
  });

  it('the score stays within 0..100 and thresholds are configurable', () => {
    const negative = { ...s, sources: { ...s.sources, contact: -100 } };
    expect(scoreLead(lead(), negative, NOW).score).toBe(0);
    const generous = { ...s, sources: { ...s.sources, contact: 100 } };
    expect(scoreLead(lead(), generous, NOW).score).toBe(100);
    const strict = { ...s, thresholds: { warm: 80, hot: 95 } };
    expect(scoreLead(lead({ phone: '+994501112233', message: 'x'.repeat(50) }), strict, NOW).level).toBe('COLD');
  });

  it('settings validation refuses WARM ≥ HOT and unknown keys', () => {
    expect(leadScoringSchema.safeParse(LEAD_SCORING_DEFAULTS).success).toBe(true);
    expect(leadScoringSchema.safeParse({ ...LEAD_SCORING_DEFAULTS, thresholds: { warm: 60, hot: 60 } }).success).toBe(false);
    expect(leadScoringSchema.safeParse({ ...LEAD_SCORING_DEFAULTS, extra: 1 }).success).toBe(false);
  });
});

describe('cost calculator', () => {
  const prices = { translation: 35, apostille: 45 };
  const fees = COST_DEFAULTS.defaults;

  it('itemises one family and separates the refundable blocked account', () => {
    const r = computeCost({ ...fees, blockedAccount: 11904 }, prices, { adults: 2, children: 1, documents: 6, apostilles: 3, recognition: true, language: true }, COST_DEFAULTS.rates);
    const item = (k: string) => r.items.find((i) => i.key === k);
    expect(item('visaFee')?.amount).toEqual([187.5, 187.5]); // 2 × 75 + 37.5
    expect(item('translation')).toMatchObject({ amount: [210, 210], qty: 6, unitPrice: 35 });
    expect(item('apostille')?.amount).toEqual([135, 135]);
    expect(item('recognition')?.amount).toEqual([400, 400]);
    expect(item('language')?.amount).toEqual([850, 850]);
    expect(item('healthInsurance')?.amount).toEqual([450, 450]);
    expect(item('flight')?.amount).toEqual([750, 750]);
    expect(item('serviceFee')?.amount).toEqual([800, 1500]);
    expect(item('blockedAccount')).toMatchObject({ amount: [11904, 11904], refundable: true });
    const fixed = 187.5 + 210 + 135 + 400 + 850 + 450 + 750;
    expect(r.oneTime).toEqual([fixed + 800, fixed + 1500]);
    expect(r.refundable).toEqual([11904, 11904]);
    expect(r.total).toEqual([fixed + 800 + 11904, fixed + 1500 + 11904]);
    expect(r.converted.oneTime.AZN).toEqual([Math.round((fixed + 800) * 1.9), Math.round((fixed + 1500) * 1.9)]);
  });

  it('leaves out items that cost nothing (no recognition, no language, no blocked account)', () => {
    const r = computeCost(fees, prices, { adults: 1, children: 0, documents: 0, apostilles: 0, recognition: false, language: false }, COST_DEFAULTS.rates);
    expect(r.items.map((i) => i.key)).toEqual(['visaFee', 'healthInsurance', 'flight', 'serviceFee']);
    expect(r.refundable).toEqual([0, 0]);
  });

  it('category overrides and the blocked-account heuristic', () => {
    expect(needsBlockedAccount('§20a Chancenkarte')).toBe(true);
    expect(needsBlockedAccount('§16a')).toBe(true);
    expect(needsBlockedAccount('§18b')).toBe(false);
    const s = { ...COST_DEFAULTS, categories: { 'lkw-fahrer': { flight: 300, blockedAccount: 0 }, chancenkarte: { blockedAccount: 0 } } };
    expect(feesFor({ slug: 'lkw-fahrer', visaLabel: '§18a' }, s).flight).toBe(300);
    expect(feesFor({ slug: 'other', visaLabel: '§20a Chancenkarte' }, s).blockedAccount).toBe(COST_DEFAULTS.blockedAccountAmount);
    // an explicit 0 on the category beats the heuristic
    expect(feesFor({ slug: 'chancenkarte', visaLabel: '§20a' }, s).blockedAccount).toBe(0);
  });

  it('validates the service fee range', () => {
    expect(costCalculatorSchema.safeParse(COST_DEFAULTS).success).toBe(true);
    expect(costCalculatorSchema.safeParse({ ...COST_DEFAULTS, defaults: { ...fees, serviceFeeMin: 2000, serviceFeeMax: 1000 } }).success).toBe(false);
    expect(costCalculatorSchema.safeParse({ ...COST_DEFAULTS, categories: { x: { serviceFeeMin: 5000 } } }).success).toBe(false);
  });
});

describe('origin normalisation', () => {
  it('recognises common spellings of AZ / TR / UA cities and implies the country', () => {
    expect(normaliseOrigin('Baku', null)).toMatchObject({ country: 'AZ', cityKey: 'baku', city: 'Bakı' });
    expect(normaliseOrigin('BAKI şəhəri', 'Azərbaycan')).toMatchObject({ cityKey: 'baku' });
    expect(normaliseOrigin('Гянджа', null)).toMatchObject({ country: 'AZ', cityKey: 'ganja' });
    expect(normaliseOrigin('Gence', null)?.cityKey).toBe('ganja');
    expect(normaliseOrigin('İstanbul', null)).toMatchObject({ country: 'TR', cityKey: 'istanbul' });
    expect(normaliseOrigin('ISTANBUL', null)?.cityKey).toBe('istanbul');
    expect(normaliseOrigin('Kiev', null)).toMatchObject({ country: 'UA', cityKey: 'kyiv' });
    expect(normaliseOrigin('Львів', null)?.cityKey).toBe('lviv');
    expect(normaliseOrigin('Odessa, Ukraine', null)?.cityKey).toBe('odesa');
  });

  it('falls back to the nationality (country centre) and ignores other countries', () => {
    expect(normaliseOrigin('Qusar kəndi', 'Azerbaijan')).toMatchObject({ country: 'AZ', cityKey: null });
    expect(normaliseOrigin(null, 'Türkiye')).toMatchObject({ country: 'TR', cityKey: null });
    expect(normaliseOrigin('Berlin', 'Germany')).toBeNull();
    expect(normaliseCountry('Republic of Azerbaijan')).toBe('AZ');
    expect(normaliseCountry('Turkmenistan')).toBeNull();
  });
});

describe('landing pages', () => {
  it('validates sections and drops broken ones when reading', () => {
    const ok = [
      { id: 'a', type: 'hero', data: { title: 'Sürücü işi', subtitle: '', image: '/uploads/x.webp', ctaLabel: 'Müraciət', ctaTarget: '#form' } },
      { id: 'b', type: 'video', data: { title: '', url: 'https://youtu.be/dQw4w9WgXcQ' } },
    ];
    expect(sectionsSchema.safeParse(ok).success).toBe(true);
    expect(sectionsSchema.safeParse([{ id: 'a', type: 'hero', data: { image: 'javascript:alert(1)' } }]).success).toBe(false);
    expect(sectionsSchema.safeParse([{ id: 'a', type: 'video', data: { url: 'https://evil.example/v' } }]).success).toBe(false);
    expect(sectionsSchema.safeParse([ok[0], ok[0]]).success).toBe(false); // duplicate id
    expect(sectionsOf([...ok, { id: 'c', type: 'nope', data: {} }, null])).toHaveLength(2);
  });

  it('video URLs become privacy-friendly embeds', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789?dnt=1');
    expect(videoEmbedUrl('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('form config needs a name and a way to reach the person', () => {
    expect(formConfigSchema.safeParse(DEFAULT_FORM_CONFIG).success).toBe(true);
    const noContact = { ...DEFAULT_FORM_CONFIG, fields: { ...DEFAULT_FORM_CONFIG.fields, email: { show: false, required: false }, phone: { show: false, required: false } } };
    expect(formConfigSchema.safeParse(noContact).success).toBe(false);
  });

  it('slugify handles Azerbaijani letters', () => {
    expect(slugify('Almaniyada sürücü işi — Şəki 2026')).toBe('almaniyada-surucu-isi-seki-2026');
  });

  it('visitor page sections are a bounded allow-list', () => {
    expect(sectionOf('/visas/lkw-fahrer')).toBe('visas');
    expect(sectionOf('/cost-calculator?x=1')).toBe('cost-calculator');
    expect(sectionOf('/account/documents')).toBeNull();
    expect(sectionOf(undefined)).toBeNull();
    expect(sectionOf('/de/visas/x')).toBe('visas');
    expect(sectionOf('/tr/cost-calculator')).toBe('cost-calculator');
  });
});
