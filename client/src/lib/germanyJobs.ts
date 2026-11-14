/*
 * Almaniya iş bazası (/jobs/germany): shared bits of the search page and the "apply via Triad Vision" form.
 * Pure (no imports): the Bundesagentur link builder is unit-tested from the server suite
 * (server/tests/unit/germanyJobsLink.test.ts).
 */

export type GermanyJobType = 'job' | 'ausbildung';
export type GermanyJobTime = 'any' | 'full' | 'part';

/** Radius options (km) — the steps the BA Jobbörse offers; 0 = only the place itself. */
export const RADII = [0, 10, 15, 25, 50, 100, 200] as const;
export const DEFAULT_RADIUS = 25;

export interface GermanyJobSearch {
  q: string;
  where: string;
  radius: number;
  type: GermanyJobType;
  time: GermanyJobTime;
  remote: boolean;
  visa: boolean;
  page: number;
}

export type GermanyJobSource = 'arbeitnow' | 'careerjet' | 'jooble' | 'adzuna';

/** Normalised listing of GET /api/germany-jobs/search (server lib/germanyJobs/common.ts). */
export interface GermanyJob {
  id: string;
  source: GermanyJobSource;
  title: string;
  company: string | null;
  location: string | null;
  snippet: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string | null;
  salaryPeriod: 'year' | 'month' | 'week' | 'day' | 'hour' | null;
  salaryPredicted: boolean;
  created: string | null;
  contractTime: 'full_time' | 'part_time' | null;
  contractType: 'permanent' | 'contract' | null;
  remote: boolean | null;
  visaSponsorship: boolean | null;
  tags: string[];
  url: string;
}

export interface GermanyJobSourceInfo {
  id: GermanyJobSource;
  name: string;
  url: string;
  ok?: boolean;
  total?: number;
}

export interface GermanyJobResults {
  items: GermanyJob[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  sources: GermanyJobSourceInfo[];
}

/** Public search page of the official BA Jobbörse (a plain link — their API is never called). */
export const BA_SEARCH_URL = 'https://www.arbeitsagentur.de/jobsuche/suche';
/** BA "Angebotsart": 1 = Arbeit, 4 = Ausbildung / duales Studium. */
export const BA_OFFER_TYPE: Record<GermanyJobType, string> = { job: '1', ausbildung: '4' };

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);

/**
 * https://www.arbeitsagentur.de/jobsuche/suche?angebotsart=1&was=Koch&wo=Berlin&umkreis=25 — the URL the BA
 * Jobbörse's own search form produces (was / wo / umkreis / angebotsart). Values are percent-encoded (%20, not
 * "+"); the radius only goes with a place, and "only the place itself" (0) leaves it to the BA default.
 */
export const baJobboerseUrl = ({ q, where, radius, type }: { q?: string | null; where?: string | null; radius?: number | null; type?: GermanyJobType | null }) => {
  const parts: string[] = [`angebotsart=${BA_OFFER_TYPE[type ?? 'job'] ?? '1'}`];
  const was = clean(q);
  const wo = clean(where);
  if (was) parts.push(`was=${encodeURIComponent(was)}`);
  if (wo) {
    parts.push(`wo=${encodeURIComponent(wo)}`);
    const r = Number(radius);
    if (Number.isInteger(r) && r > 0 && (RADII as readonly number[]).includes(r)) parts.push(`umkreis=${r}`);
  }
  return `${BA_SEARCH_URL}?${parts.join('&')}`;
};

/** Search state from the page URL (?q&where&radius&type&time&remote&visa&page) — unknown values fall back to defaults. */
export const searchFromParams = (p: URLSearchParams): GermanyJobSearch => {
  const radius = Number(p.get('radius'));
  const page = Number(p.get('page'));
  const type = p.get('type');
  const time = p.get('time');
  return {
    q: clean(p.get('q')),
    where: clean(p.get('where')),
    radius: (RADII as readonly number[]).includes(radius) && p.get('radius') !== null ? radius : DEFAULT_RADIUS,
    type: type === 'ausbildung' ? 'ausbildung' : 'job',
    time: time === 'full' || time === 'part' ? time : 'any',
    remote: p.get('remote') === '1',
    visa: p.get('visa') === '1',
    page: Number.isInteger(page) && page >= 1 && page <= 20 ? page : 1,
  };
};

/** The page URL's query for a search (defaults left out, so URLs stay short and shareable). */
export const searchToParams = (s: Partial<GermanyJobSearch>) => {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.where) p.set('where', s.where);
  if (s.where && s.radius !== undefined && s.radius !== DEFAULT_RADIUS) p.set('radius', String(s.radius));
  if (s.type === 'ausbildung') p.set('type', 'ausbildung');
  if (s.time && s.time !== 'any') p.set('time', s.time);
  if (s.remote) p.set('remote', '1');
  if (s.visa) p.set('visa', '1');
  if (s.page && s.page > 1) p.set('page', String(s.page));
  return p;
};

/** True for an http(s) link someone could paste as "the job ad". */
export const isListingUrl = (raw: string) => {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
};

/** Short host label of a listing link ("arbeitsagentur.de", "stepstone.de"). */
export const listingHost = (raw: string) => {
  try {
    return new URL(raw.trim()).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
