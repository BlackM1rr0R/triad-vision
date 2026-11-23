import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { vacancyRequestMatches, requestTypeOf } = await import('../../src/lib/vacancyRequests/matching.js');
const { requestIdFromToken, requestToken, requestInputSchema } = await import('../../src/lib/vacancyRequests/service.js');
const { REQUEST_MAIL } = await import('../../src/lib/vacancyRequests/texts.js');

const L = (de: string) => ({ az: de, de, en: de, ru: de });
const vac = (over: Record<string, unknown> = {}) => ({ id: 'v1', title: L('LKW-Fahrer'), city: 'Hamburg', sector: 'logistics', profession: 'LKW-Fahrer', employmentType: 'FULL_TIME', ...over }) as never;
const req = (over: Record<string, unknown> = {}) => ({ type: 'WORK', sector: null, profession: null, city: null, ...over }) as never;

describe('vacancy requests: matching', () => {
  it('maps the employment type to WORK / AUSBILDUNG', () => {
    expect(requestTypeOf('AUSBILDUNG')).toBe('AUSBILDUNG');
    expect(requestTypeOf('SEASONAL')).toBe('WORK');
    expect(requestTypeOf('FULL_TIME')).toBe('WORK');
  });

  it('type must match', () => {
    expect(vacancyRequestMatches(req({ type: 'AUSBILDUNG', sector: 'logistics' }), vac())).toBe(false);
    expect(vacancyRequestMatches(req({ type: 'AUSBILDUNG', sector: 'logistics' }), vac({ employmentType: 'AUSBILDUNG' }))).toBe(true);
  });

  it('profession (canonical key) wins over the sector', () => {
    expect(vacancyRequestMatches(req({ profession: 'truck_driver' }), vac())).toBe(true);
    expect(vacancyRequestMatches(req({ profession: 'truck_driver', sector: 'logistics' }), vac({ profession: 'Koch', title: L('Koch'), sector: 'logistics' }))).toBe(false);
    expect(vacancyRequestMatches(req({ profession: 'cook' }), vac())).toBe(false);
  });

  it('sector only, and no profession / sector = any vacancy of the type', () => {
    expect(vacancyRequestMatches(req({ sector: 'logistics' }), vac())).toBe(true);
    expect(vacancyRequestMatches(req({ sector: 'construction' }), vac())).toBe(false);
    expect(vacancyRequestMatches(req(), vac({ sector: 'healthcare' }))).toBe(true);
  });

  it('a profession + sector request also fits a vacancy without a known profession in that sector', () => {
    const unknown = vac({ profession: 'Hilfskraft', title: L('Hilfskraft Lager'), sector: 'logistics' });
    expect(vacancyRequestMatches(req({ profession: 'truck_driver', sector: 'logistics' }), unknown)).toBe(true);
    expect(vacancyRequestMatches(req({ profession: 'truck_driver' }), unknown)).toBe(false);
  });

  it('free text is found in the title', () => {
    expect(vacancyRequestMatches(req({ profession: 'Hilfskraft' }), vac({ profession: null, title: L('Lager Hilfskraft (m/w/d)') }))).toBe(true);
    expect(vacancyRequestMatches(req({ profession: 'Gärtner' }), vac({ profession: null, title: L('Lager Hilfskraft (m/w/d)') }))).toBe(false);
  });

  it('city is matched loosely (Bundesland, umlauts); a vacancy without a city fits', () => {
    expect(vacancyRequestMatches(req({ sector: 'logistics', city: 'Hamburg' }), vac())).toBe(true);
    expect(vacancyRequestMatches(req({ sector: 'logistics', city: 'München' }), vac())).toBe(false);
    expect(vacancyRequestMatches(req({ sector: 'logistics', city: 'Bayern' }), vac({ city: 'Nürnberg' }))).toBe(true);
    expect(vacancyRequestMatches(req({ sector: 'logistics', city: 'Hamburg' }), vac({ city: null }))).toBe(true);
  });

  it('the vacancy a request was made from always fits', () => {
    expect(vacancyRequestMatches(req({ type: 'AUSBILDUNG', sector: 'healthcare', sourceVacancyId: 'v1' }), vac())).toBe(true);
  });
});

describe('vacancy requests: token, input, texts', () => {
  it('the cancel token verifies only for its own request', () => {
    const t = requestToken('req_1');
    expect(requestIdFromToken(t)).toBe('req_1');
    expect(requestIdFromToken(`req_2.${t.split('.')[1]}`)).toBeNull();
    expect(requestIdFromToken('garbage')).toBeNull();
    expect(requestIdFromToken('')).toBeNull();
  });

  it('input: type required, sector from the list, empty strings become null', () => {
    expect(requestInputSchema.safeParse({}).success).toBe(false);
    expect(requestInputSchema.safeParse({ type: 'WORK', sector: 'space' }).success).toBe(false);
    expect(requestInputSchema.parse({ type: 'AUSBILDUNG', sector: 'healthcare', city: '', note: '  ' })).toMatchObject({ type: 'AUSBILDUNG', city: null, note: null });
  });

  it('every site language has the texts', () => {
    for (const lng of ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const) {
      const m = REQUEST_MAIL[lng];
      expect(m.noticeSubject('X')).toContain('X');
      expect(m.noticeBody('Y', 2)).toContain('Y');
      expect(m.cta.length).toBeGreaterThan(2);
    }
  });
});
