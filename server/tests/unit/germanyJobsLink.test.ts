import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { dedupeKey, plainText } from '../../src/lib/germanyJobs/common.js';
import { joobleRadius } from '../../src/lib/germanyJobs/jooble.js';

/**
 * Almaniya iş bazası: the Bundesagentur Jobbörse link builder and the URL state of /jobs/germany
 * (client/src/lib/germanyJobs.ts — the client has no test runner, so the module is loaded by URL here), plus
 * pure helpers of the server providers.
 */

type Search = { q: string; where: string; radius: number; type: 'job' | 'ausbildung'; time: 'any' | 'full' | 'part'; remote: boolean; visa: boolean; page: number };
interface ClientLib {
  baJobboerseUrl: (s: { q?: string | null; where?: string | null; radius?: number | null; type?: 'job' | 'ausbildung' | null }) => string;
  searchFromParams: (p: URLSearchParams) => Search;
  searchToParams: (s: Partial<Search>) => URLSearchParams;
  isListingUrl: (s: string) => boolean;
  listingHost: (s: string) => string;
}

let m: ClientLib;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/germanyJobs.ts');
  m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as ClientLib;
});

describe('baJobboerseUrl (public BA Jobbörse search, never their API)', () => {
  it('builds the public search URL with was / wo / umkreis / angebotsart', () => {
    expect(m.baJobboerseUrl({ q: 'Koch', where: 'Berlin', radius: 25, type: 'job' })).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=Koch&wo=Berlin&umkreis=25');
    expect(m.baJobboerseUrl({ q: 'Pflege', where: 'Hamburg', radius: 50, type: 'ausbildung' })).toBe(
      'https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=4&was=Pflege&wo=Hamburg&umkreis=50',
    );
  });

  it('percent-encodes values (%20, umlauts, slashes) and trims whitespace', () => {
    const url = m.baJobboerseUrl({ q: '  Kaufmann/-frau  Einzelhandel ', where: 'München', radius: 10, type: 'job' });
    expect(url).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=Kaufmann%2F-frau%20Einzelhandel&wo=M%C3%BCnchen&umkreis=10');
    expect(new URL(url).hostname).toBe('www.arbeitsagentur.de');
    expect(url).not.toContain('rest.arbeitsagentur.de');
  });

  it('leaves out empty values; the radius only goes with a place and only allowed steps', () => {
    expect(m.baJobboerseUrl({})).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1');
    expect(m.baJobboerseUrl({ q: 'Fahrer', radius: 25 })).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=Fahrer');
    expect(m.baJobboerseUrl({ where: 'Köln', radius: 0 })).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&wo=K%C3%B6ln');
    expect(m.baJobboerseUrl({ where: 'Köln', radius: 33 })).toBe('https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&wo=K%C3%B6ln');
    expect(m.baJobboerseUrl({ q: 'x'.repeat(300) }).length).toBeLessThan(200);
  });
});

describe('page URL state', () => {
  it('round-trips a search and drops defaults', () => {
    const s = m.searchFromParams(new URLSearchParams('q=Koch&where=Berlin&radius=50&type=ausbildung&time=full&remote=1&visa=1&page=3'));
    expect(s).toEqual({ q: 'Koch', where: 'Berlin', radius: 50, type: 'ausbildung', time: 'full', remote: true, visa: true, page: 3 });
    expect(m.searchToParams(s).toString()).toBe('q=Koch&where=Berlin&radius=50&type=ausbildung&time=full&remote=1&visa=1&page=3');
    expect(m.searchToParams({ q: 'Koch', radius: 25, type: 'job', time: 'any', page: 1 }).toString()).toBe('q=Koch');
  });

  it('ignores unknown values', () => {
    expect(m.searchFromParams(new URLSearchParams('radius=33&type=x&time=y&page=99'))).toMatchObject({ radius: 25, type: 'job', time: 'any', page: 1, remote: false });
  });

  it('accepts only http(s) listing links', () => {
    expect(m.isListingUrl('https://www.stepstone.de/stellenangebote--Koch-123.html')).toBe(true);
    expect(m.isListingUrl('javascript:alert(1)')).toBe(false);
    expect(m.isListingUrl('not a url')).toBe(false);
    expect(m.listingHost('https://www.arbeitsagentur.de/jobsuche/jobdetail/1')).toBe('arbeitsagentur.de');
  });
});

describe('provider helpers', () => {
  it('plainText strips HTML (scripts included) and decodes entities', () => {
    expect(plainText('<p>Koch &amp; <strong>Team</strong></p><script>alert(1)</script>')).toBe('Koch & Team');
    expect(plainText('a'.repeat(50), 10)).toHaveLength(10);
  });

  it('dedupeKey: same listing across providers despite case, umlauts and location detail', () => {
    expect(dedupeKey({ title: 'Koch (m/w/d)', company: 'Müller GmbH', location: 'Berlin, Mitte' })).toBe(dedupeKey({ title: 'koch m/w/d', company: 'Mueller GmbH', location: 'Berlin' }));
    expect(dedupeKey({ title: 'Koch', company: 'A', location: 'Berlin' })).not.toBe(dedupeKey({ title: 'Koch', company: 'B', location: 'Berlin' }));
  });

  it('joobleRadius picks the nearest allowed step', () => {
    expect(joobleRadius(25)).toBe(26);
    expect(joobleRadius(0)).toBe(0);
    expect(joobleRadius(200)).toBe(80);
  });
});
