import crypto from 'node:crypto';
import type { JobChannelStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { open, seal } from '../secretBox.js';
import { escapeHtml, siteOrigin } from '../seo.js';
import { SITE_NAME } from '../seoCatalogue.js';
import { occupationByCode } from './occupations.js';
import { XML_DECL, el, elText, esc } from './xml.js';

/**
 * Job feeds: vacancies on external job boards.
 *
 *   - indeed / stepstone / generic: XML feeds the boards pull from /feeds/<channel>.xml?token=… (routes/jobFeeds.ts),
 *     built from OPEN, published, not expired vacancies whose distribution has the channel switched on.
 *     Each build is cached for 10 minutes and records the per-vacancy channel status (published / error / expired).
 *   - ba: HR-BA-XML file for the Bundesagentur für Arbeit Jobbörse (lib/jobFeeds/ba.ts), downloaded by an admin
 *     for manual upload; the automatic upload stays off until partner id + certificate are entered.
 *
 * Overview of the formats and what each board requires: deploy/README-jobfeeds.md.
 */

export const CHANNELS = ['indeed', 'stepstone', 'generic', 'ba'] as const;
export type Channel = (typeof CHANNELS)[number];
export const FEED_CHANNELS = ['indeed', 'stepstone', 'generic'] as const;
export type FeedChannel = (typeof FEED_CHANNELS)[number];
export const FEED_LANGUAGES = ['de', 'en', 'az', 'ru'] as const;
export type FeedLanguage = (typeof FEED_LANGUAGES)[number];

export const FEED_TTL_MS = 10 * 60 * 1000;
const CONFIG_ID = 'default';

// ─── Config + token ─────────────────────────────────────────────────────

export const newFeedToken = () => crypto.randomBytes(24).toString('base64url');

/** The singleton config row, created with a fresh token on first use. */
export const ensureFeedConfig = async () => {
  const existing = await prisma.jobFeedConfig.findUnique({ where: { id: CONFIG_ID } });
  if (existing) return existing;
  try {
    return await prisma.jobFeedConfig.create({ data: { id: CONFIG_ID, tokenSealed: seal(newFeedToken()) } });
  } catch (err) {
    // Two first requests at once: the other one created it.
    if ((err as { code?: string }).code === 'P2002') return prisma.jobFeedConfig.findUniqueOrThrow({ where: { id: CONFIG_ID } });
    throw err;
  }
};

export const feedTokenOf = (cfg: { tokenSealed: string }) => open(cfg.tokenSealed);

const digest = (s: string) => crypto.createHash('sha256').update(s).digest();

/** Constant-time check of a feed token. No config yet (nobody opened the admin page) = feeds are closed. */
export const checkFeedToken = async (given: unknown) => {
  if (typeof given !== 'string' || given.length < 16 || given.length > 200) return false;
  const cfg = await prisma.jobFeedConfig.findUnique({ where: { id: CONFIG_ID }, select: { tokenSealed: true } });
  const token = cfg ? feedTokenOf(cfg) : null;
  if (!token) return false;
  return crypto.timingSafeEqual(digest(given), digest(token));
};

export const rotateFeedToken = async () => {
  await ensureFeedConfig();
  const cfg = await prisma.jobFeedConfig.update({ where: { id: CONFIG_ID }, data: { tokenSealed: seal(newFeedToken()), tokenRotatedAt: new Date() } });
  clearFeedCache();
  return cfg;
};

export const feedUrls = (token: string) => {
  const origin = siteOrigin();
  const q = `token=${encodeURIComponent(token)}`;
  return Object.fromEntries(FEED_CHANNELS.map((c) => [c, `${origin}/feeds/${c}.xml?${q}`])) as Record<FeedChannel, string>;
};

// ─── Vacancies ──────────────────────────────────────────────────────────

export const feedInclude = {
  company: { select: { name: true, website: true } },
  distribution: true,
} satisfies Prisma.VacancyInclude;
export type FeedVacancy = Prisma.VacancyGetPayload<{ include: typeof feedInclude }>;

/** Live on the public board: OPEN, publication date reached, not past closesAt. */
export const liveVacancyWhere = (now = new Date()): Prisma.VacancyWhereInput => ({
  status: 'OPEN',
  OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
  AND: [{ OR: [{ closesAt: null }, { closesAt: { gt: now } }] }],
});

export const isLive = (v: { status: string; publishedAt: Date | null; closesAt: Date | null }, now = new Date()) =>
  v.status === 'OPEN' && (!v.publishedAt || v.publishedAt <= now) && (!v.closesAt || v.closesAt > now);

export const channelsOf = (d: { channels: Prisma.JsonValue } | null | undefined): Channel[] =>
  Array.isArray(d?.channels) ? (d.channels.filter((c) => typeof c === 'string' && (CHANNELS as readonly string[]).includes(c)) as Channel[]) : [];

/** Every vacancy with a distribution row (live or not), newest first. */
export const distributedVacancies = () =>
  prisma.vacancy.findMany({ where: { distribution: { isNot: null } }, include: feedInclude, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: 5000 });

// ─── Text ───────────────────────────────────────────────────────────────

const LANG_FALLBACK: Record<FeedLanguage, FeedLanguage[]> = {
  de: ['de', 'en', 'az', 'ru'],
  en: ['en', 'de', 'az', 'ru'],
  az: ['az', 'de', 'en', 'ru'],
  ru: ['ru', 'de', 'en', 'az'],
};

export const feedLanguage = (v: string | null | undefined): FeedLanguage => ((FEED_LANGUAGES as readonly string[]).includes(v ?? '') ? (v as FeedLanguage) : 'de');

/** One language of an L10n JSON value: the wanted one, then German, English, Azerbaijani, Russian. */
export const textIn = (value: unknown, lang: FeedLanguage): string => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const v = value as Record<string, unknown>;
  for (const l of LANG_FALLBACK[lang]) if (typeof v[l] === 'string' && (v[l] as string).trim()) return (v[l] as string).trim();
  return '';
};

export const listIn = (value: unknown, lang: FeedLanguage): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const v = value as Record<string, unknown>;
  for (const l of LANG_FALLBACK[lang]) {
    const list = v[l];
    if (Array.isArray(list) && list.some((x) => typeof x === 'string' && x.trim())) return list.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim());
  }
  return [];
};

const LABELS: Record<FeedLanguage, { requirements: string; benefits: string; client: string; perMonth: string; from: string; upTo: string }> = {
  de: { requirements: 'Anforderungen', benefits: 'Wir bieten', client: 'für einen Kunden', perMonth: 'pro Monat', from: 'ab', upTo: 'bis' },
  en: { requirements: 'Requirements', benefits: 'Benefits', client: 'for a client', perMonth: 'per month', from: 'from', upTo: 'up to' },
  az: { requirements: 'Tələblər', benefits: 'Üstünlüklər', client: 'müştəri üçün', perMonth: 'aylıq', from: 'min.', upTo: 'maks.' },
  ru: { requirements: 'Требования', benefits: 'Мы предлагаем', client: 'для клиента', perMonth: 'в месяц', from: 'от', upTo: 'до' },
};

const paragraphsHtml = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
const listHtml = (heading: string, items: string[]) => (items.length ? `<h3>${escapeHtml(heading)}</h3><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '');
const listText = (heading: string, items: string[]) => (items.length ? `\n\n${heading}:\n${items.map((i) => `- ${i}`).join('\n')}` : '');

const fmtEur = (n: number, lang: FeedLanguage) => new Intl.NumberFormat(lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-GB').format(n);
export const salaryText = (min: number | null, max: number | null, lang: FeedLanguage) => {
  const L = LABELS[lang];
  if (min == null && max == null) return '';
  if (min != null && max != null) return min === max ? `${fmtEur(min, lang)} EUR ${L.perMonth}` : `${fmtEur(Math.min(min, max), lang)} - ${fmtEur(Math.max(min, max), lang)} EUR ${L.perMonth}`;
  return min != null ? `${L.from} ${fmtEur(min, lang)} EUR ${L.perMonth}` : `${L.upTo} ${fmtEur(max!, lang)} EUR ${L.perMonth}`;
};

/** Apply URL of a channel: the override or the public job page, with UTM parameters (existing ones are kept). */
export const applyUrlFor = (v: { slug: string }, d: { applyUrl: string | null; language: string } | null, channel: Channel) => {
  const lang = feedLanguage(d?.language);
  const base = d?.applyUrl && /^https?:\/\//i.test(d.applyUrl) ? d.applyUrl : `${siteOrigin()}${lang === 'az' ? '' : `/${lang}`}/jobs/${encodeURIComponent(v.slug)}`;
  try {
    const u = new URL(base);
    const set = (k: string, val: string) => {
      if (!u.searchParams.has(k)) u.searchParams.set(k, val);
    };
    set('utm_source', channel === 'ba' ? 'arbeitsagentur' : channel);
    set('utm_medium', 'job_feed');
    set('utm_campaign', v.slug);
    return u.toString();
  } catch {
    return base;
  }
};

// ─── Normalised job ─────────────────────────────────────────────────────

export interface FeedJob {
  vacancyId: string;
  slug: string;
  language: FeedLanguage;
  title: string;
  descriptionText: string;
  descriptionHtml: string;
  requirements: string[];
  benefits: string[];
  company: string;
  companyHidden: boolean;
  city: string | null;
  postalCode: string | null;
  country: 'DE';
  url: string;
  datePosted: Date;
  updatedAt: Date;
  validThrough: Date | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salary: string;
  positions: number;
  sector: string | null;
  profession: string | null;
  germanLevel: string | null;
  minExperience: number | null;
  drivingLicence: string | null;
  occupationCode: string | null;
  occupationName: string | null;
  weeklyHours: number | null;
  limited: boolean;
  limitedUntil: Date | null;
  startDate: Date | null;
  baTitleCode: string | null;
}

export const employerLabel = (v: FeedVacancy, lang: FeedLanguage) => {
  const d = v.distribution;
  const hidden = d ? d.hideEmployer : !v.showCompany;
  if (!hidden && v.company?.name) return { name: v.company.name, hidden: false };
  return { name: d?.employerLabel?.trim() || `${SITE_NAME} (${LABELS[lang].client})`, hidden: true };
};

export const toFeedJob = (v: FeedVacancy, channel: Channel): FeedJob => {
  const d = v.distribution;
  const lang = feedLanguage(d?.language);
  const L = LABELS[lang];
  const title = textIn(v.title, lang).replace(/\s+/g, ' ');
  const description = textIn(v.description, lang);
  const requirements = listIn(v.requirements, lang);
  const benefits = listIn(v.benefits, lang);
  const employer = employerLabel(v, lang);
  const occ = occupationByCode(d?.occupationCode);
  return {
    vacancyId: v.id,
    slug: v.slug,
    language: lang,
    title,
    descriptionText: `${description}${listText(L.requirements, requirements)}${listText(L.benefits, benefits)}`.trim(),
    descriptionHtml: paragraphsHtml(description) + listHtml(L.requirements, requirements) + listHtml(L.benefits, benefits),
    requirements,
    benefits,
    company: employer.name,
    companyHidden: employer.hidden,
    city: v.city?.trim() || null,
    postalCode: d?.postalCode?.trim() || null,
    country: 'DE',
    url: applyUrlFor(v, d, channel),
    datePosted: v.publishedAt ?? v.createdAt,
    updatedAt: v.updatedAt,
    validThrough: v.closesAt,
    employmentType: v.employmentType,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    salary: salaryText(v.salaryMin, v.salaryMax, lang),
    positions: v.positions,
    sector: v.sector,
    profession: v.profession,
    germanLevel: v.germanLevel,
    minExperience: v.minExperience,
    drivingLicence: v.drivingLicence,
    occupationCode: d?.occupationCode ?? null,
    occupationName: occ ? occ.de : null,
    weeklyHours: d?.weeklyHours ?? null,
    limited: d?.limited ?? false,
    limitedUntil: d?.limitedUntil ?? null,
    startDate: d?.startDate ?? null,
    baTitleCode: d?.baTitleCode?.trim() || null,
  };
};

/** Required fields per feed channel (error codes; the admin UI translates them). BA has its own list (ba.ts). */
export const validateFeedJob = (job: FeedJob, channel: FeedChannel): string[] => {
  const errors: string[] = [];
  if (!job.title) errors.push('TITLE_MISSING');
  if (job.descriptionText.length < 30) errors.push('DESCRIPTION_TOO_SHORT');
  if (channel !== 'generic' && !job.city) errors.push('CITY_MISSING');
  return errors;
};

// ─── Feed XML ───────────────────────────────────────────────────────────

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const isoSeconds = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;

const INDEED_JOBTYPE: Record<string, string> = { FULL_TIME: 'fulltime', PART_TIME: 'parttime', SEASONAL: 'temporary', AUSBILDUNG: 'fulltime' };
const EXPERIENCE: Record<FeedLanguage, (n: number) => string> = {
  de: (n) => `${n}+ Jahre`,
  en: (n) => `${n}+ years`,
  az: (n) => `${n}+ il`,
  ru: (n) => `${n}+ лет`,
};

/** Contact address Indeed asks for in <email> (Setting "contact".email); blank when none is set. */
const contactEmail = async () => {
  const s = await prisma.setting.findUnique({ where: { key: 'contact' } });
  const email = s && s.value && typeof s.value === 'object' && !Array.isArray(s.value) ? (s.value as Record<string, unknown>).email : null;
  return typeof email === 'string' ? email : '';
};

/**
 * Indeed XML feed (docs.indeed.com → Job Sync XML feed reference): <source> with one <job> per vacancy, every
 * used element present in every job (blank when unknown), dates ISO-8601, salary free text with currency + period.
 */
export const buildIndeedXml = (jobs: FeedJob[], opts: { email: string; now?: Date }) => {
  const origin = siteOrigin();
  const now = opts.now ?? new Date();
  const items = jobs.map((j) =>
    [
      '<job>',
      el('title', j.title),
      el('date', isoSeconds(j.datePosted)),
      el('referencenumber', j.vacancyId),
      el('requisitionid', j.slug),
      el('url', j.url),
      el('company', j.company),
      el('sourcename', SITE_NAME),
      el('city', j.city ?? ''),
      el('state', ''),
      el('country', j.country),
      el('postalcode', j.postalCode ?? ''),
      el('streetaddress', ''),
      el('email', opts.email),
      el('description', j.descriptionHtml),
      el('salary', j.salary),
      el('education', ''),
      el('jobtype', INDEED_JOBTYPE[j.employmentType] ?? 'fulltime'),
      el('category', j.occupationName ?? j.sector ?? ''),
      el('experience', j.minExperience ? EXPERIENCE[j.language](j.minExperience) : ''),
      el('expirationdate', j.validThrough ? isoDate(j.validThrough) : ''),
      el('remotetype', ''),
      '</job>',
    ].join('\n'),
  );
  return [XML_DECL, '<source>', el('publisher', SITE_NAME), el('publisherurl', `${origin}/`), el('lastBuildDate', now.toUTCString()), ...items, '</source>', ''].join('\n');
};

/**
 * Generic job XML (also served as the StepStone feed: StepStone's own import format is only documented for
 * contracted partners, so this structured feed is what a StepStone account manager or a multiposting tool maps).
 * `<job>` carries every field we have: structured location, salary, contract, KldB occupation, requirements.
 */
export const buildGenericXml = (jobs: FeedJob[], opts: { channel: 'stepstone' | 'generic'; now?: Date }) => {
  const now = opts.now ?? new Date();
  const items = jobs.map((j) =>
    [
      `<job id="${esc(j.vacancyId)}">`,
      elText('reference', j.vacancyId),
      elText('slug', j.slug),
      elText('language', j.language),
      el('title', j.title),
      `<company hidden="${j.companyHidden}">${el('name', j.company)}</company>`,
      el('url', j.url),
      el('applyUrl', j.url),
      elText('datePosted', isoSeconds(j.datePosted)),
      elText('dateModified', isoSeconds(j.updatedAt)),
      elText('validThrough', j.validThrough ? isoSeconds(j.validThrough) : ''),
      `<location>${el('city', j.city ?? '')}${el('postalCode', j.postalCode ?? '')}${elText('country', j.country)}</location>`,
      elText('employmentType', j.employmentType),
      elText('contractType', j.limited ? 'temporary' : 'permanent'),
      elText('contractEnd', j.limitedUntil ? isoDate(j.limitedUntil) : ''),
      elText('startDate', j.startDate ? isoDate(j.startDate) : ''),
      elText('weeklyHours', j.weeklyHours ?? ''),
      elText('positions', j.positions),
      `<salary currency="EUR" period="MONTH">${elText('min', j.salaryMin ?? '')}${elText('max', j.salaryMax ?? '')}${el('text', j.salary)}</salary>`,
      `<occupation kldb="${esc(j.occupationCode)}">${el('name', j.occupationName ?? j.profession ?? '')}</occupation>`,
      elText('sector', j.sector ?? ''),
      elText('germanLevel', j.germanLevel ?? ''),
      elText('minExperienceYears', j.minExperience ?? ''),
      el('drivingLicence', j.drivingLicence ?? ''),
      el('description', j.descriptionHtml),
      el('descriptionText', j.descriptionText),
      `<requirements>${j.requirements.map((r) => el('item', r)).join('')}</requirements>`,
      `<benefits>${j.benefits.map((b) => el('item', b)).join('')}</benefits>`,
      '</job>',
    ].join('\n'),
  );
  return [
    XML_DECL,
    `<jobs version="1.0" channel="${opts.channel}" generated="${isoSeconds(now)}" count="${jobs.length}">`,
    `<publisher>${el('name', SITE_NAME)}${el('url', `${siteOrigin()}/`)}</publisher>`,
    ...items,
    '</jobs>',
    '',
  ].join('\n');
};

// ─── Build + status bookkeeping ─────────────────────────────────────────

export interface BuildResult {
  xml: string;
  included: FeedJob[];
  errors: { vacancyId: string; slug: string; errors: string[] }[];
}

/** Writes the per-vacancy status of one channel after a build / export. */
export const recordChannelStates = async (
  channel: Channel,
  rows: { vacancyId: string; status: JobChannelStatus; error?: string | null; exported?: boolean }[],
) => {
  const now = new Date();
  for (const r of rows) {
    const data = { status: r.status, error: r.error ?? null, ...(r.exported ? { lastExportAt: now } : {}) };
    await prisma.vacancyChannelState.upsert({
      where: { vacancyId_channel: { vacancyId: r.vacancyId, channel } },
      create: { vacancyId: r.vacancyId, channel, ...data },
      update: data,
    });
  }
};

/** Vacancies with the channel switched on, and the live ones among them. */
export const buildChannel = async (channel: Channel, now = new Date()): Promise<{ vacancies: FeedVacancy[]; live: FeedVacancy[] }> => {
  const all = (await distributedVacancies()).filter((v) => channelsOf(v.distribution).includes(channel));
  return { vacancies: all, live: all.filter((v) => isLive(v, now)) };
};

/**
 * Builds one feed from the database and records the outcome: included → PUBLISHED, left out for missing
 * fields → ERROR, switched on but no longer live → EXPIRED (only if it was published before; otherwise PENDING).
 */
export const buildFeed = async (channel: FeedChannel, now = new Date()): Promise<BuildResult> => {
  const { vacancies, live } = await buildChannel(channel, now);
  const included: FeedJob[] = [];
  const errors: BuildResult['errors'] = [];
  for (const v of live) {
    const job = toFeedJob(v, channel);
    const problems = validateFeedJob(job, channel);
    if (problems.length) errors.push({ vacancyId: v.id, slug: v.slug, errors: problems });
    else included.push(job);
  }
  const xml = channel === 'indeed' ? buildIndeedXml(included, { email: await contactEmail(), now }) : buildGenericXml(included, { channel, now });

  const liveIds = new Set(live.map((v) => v.id));
  const previous = await prisma.vacancyChannelState.findMany({ where: { channel, vacancyId: { in: vacancies.map((v) => v.id) } }, select: { vacancyId: true, status: true } });
  const prevStatus = new Map(previous.map((p) => [p.vacancyId, p.status]));
  await recordChannelStates(channel, [
    ...included.map((j) => ({ vacancyId: j.vacancyId, status: 'PUBLISHED' as const, exported: true })),
    ...errors.map((e) => ({ vacancyId: e.vacancyId, status: 'ERROR' as const, error: e.errors.join(',') })),
    ...vacancies
      .filter((v) => !liveIds.has(v.id))
      .map((v) => {
        const prev = prevStatus.get(v.id);
        return { vacancyId: v.id, status: (prev === 'PUBLISHED' || prev === 'EXPIRED' ? 'EXPIRED' : 'PENDING') as JobChannelStatus };
      }),
  ]);
  await saveFeedStats(channel, included.length, now);
  return { xml, included, errors };
};

const saveFeedStats = async (channel: Channel, items: number, now: Date) => {
  const cfg = await ensureFeedConfig();
  const stats = cfg.feedStats && typeof cfg.feedStats === 'object' && !Array.isArray(cfg.feedStats) ? (cfg.feedStats as Prisma.JsonObject) : {};
  await prisma.jobFeedConfig.update({ where: { id: CONFIG_ID }, data: { feedStats: { ...stats, [channel]: { at: now.toISOString(), items } } } });
};

// ─── Cache ──────────────────────────────────────────────────────────────

const feedCache = new Map<FeedChannel, { at: number; xml: string }>();
const inflight = new Map<FeedChannel, Promise<string>>();

/** The feed XML, rebuilt at most every 10 minutes (concurrent misses share one build). */
export const getFeedXml = async (channel: FeedChannel): Promise<{ xml: string; cached: boolean }> => {
  const hit = feedCache.get(channel);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return { xml: hit.xml, cached: true };
  const pending = inflight.get(channel);
  if (pending) return { xml: await pending, cached: true };
  const p = buildFeed(channel)
    .then((r) => {
      feedCache.set(channel, { at: Date.now(), xml: r.xml });
      return r.xml;
    })
    .finally(() => inflight.delete(channel));
  inflight.set(channel, p);
  return { xml: await p, cached: false };
};

export const clearFeedCache = () => {
  feedCache.clear();
};
