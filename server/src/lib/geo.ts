import { cached } from './cache.js';
import { brandSync } from './brand/index.js';
import { PRIVATE_PREFIXES, SEO_LOCALES, SITE_NAME, STATIC_PAGES, textIn, type SeoLocale } from './seoCatalogue.js';
import { collapse, getSeoData, indexable, liveJobs, pageUrl, pick, robotsRules, siteOrigin, type SeoData } from './seo.js';
import { guidePath } from './guides/service.js';

/**
 * Generative-engine (GEO) files: /llms.txt, /llms-full.txt, /.well-known/ai.txt and /ai/{summary,faq,service}.json.
 * Everything is generated from the same cached public SEO data as the sitemap (published categories, open
 * vacancies, published articles and guides, FAQ). Vacancies never carry the employer's name.
 */

export const LANG_NAME: Record<SeoLocale, string> = { az: 'Azerbaijani', de: 'German', en: 'English', ru: 'Russian', tr: 'Turkish', uk: 'Ukrainian' };

const MAX_JOBS = 60;
const MAX_POSTS = 40;
const MAX_GUIDES = 80;

/** Pages every AI answer about the agency should be able to cite, in the order of the file. */
const KEY_PAGES: { path: string; what: string }[] = [
  { path: '/', what: 'Home' },
  { path: '/visas', what: 'Visa categories' },
  { path: '/jobs', what: 'Open vacancies in Germany' },
  { path: '/guides', what: 'Guides' },
  { path: '/news', what: 'News and articles' },
  { path: '/tools', what: 'Free calculators and checks' },
  { path: '/faq', what: 'Frequently asked questions' },
  { path: '/about', what: 'About Triad Vision' },
  { path: '/contact', what: 'Contact' },
  { path: '/for-workers', what: 'For workers' },
  { path: '/for-employers', what: 'For employers' },
];

/** What the agency does and does not do (business rules), in plain English. */
export const CAPABILITIES = [
  'Recruiting and placing workers from Azerbaijan with employers in Germany (employer names are not published on the website).',
  'Preparing the documents for German work and skilled-worker visa applications and guiding the candidate through the process.',
  'A public job board with open vacancies in Germany, and information on visa categories, Ausbildung (vocational training) and relocation.',
  'Free online calculators and checks (salary gross to net, cost of moving, start date, eligibility).',
  'Guides and information sessions in Azerbaijani, German, English, Russian, Turkish and Ukrainian.',
] as const;

export const NOT_OFFERED = [
  'We do not offer apostille services.',
  'We do not offer translation services.',
  'We do not book embassy appointments: we prepare the documents, the client applies, and the embassy decides on the visa.',
] as const;

const contactOf = (data: SeoData) => {
  const c = (data.settings.contact && typeof data.settings.contact === 'object' ? data.settings.contact : {}) as Record<string, unknown>;
  const phone = typeof c.phone === 'string' && c.phone.trim() ? c.phone.trim() : brandSync().phone;
  const email = typeof c.email === 'string' && c.email.trim() ? c.email.trim() : undefined;
  return { phone, email };
};

const line = (title: string, url: string, note?: string) => `- [${collapse(title)}](${url})${note ? `: ${collapse(note)}` : ''}`;

const shorten = (s: string, max: number) => {
  const t = collapse(s);
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

export const faqItems = (data: SeoData, lng: SeoLocale) =>
  data.faqs.map((f) => ({ question: collapse(pick(f.question, lng)), answer: pick(f.answer, lng).trim() })).filter((f) => f.question && f.answer);

const newestUpdate = (data: SeoData): Date | null => {
  const t = [...data.visas, ...data.services, ...data.posts, ...data.jobs].map((r) => r.updatedAt.getTime());
  return t.length ? new Date(Math.max(...t)) : null;
};

/** /llms.txt (compact) and /llms-full.txt (adds full visa summaries, services and the English FAQ). */
export const renderLlms = (data: SeoData, full: boolean): string => {
  const origin = siteOrigin();
  const { phone, email } = contactOf(data);
  const out: string[] = [];
  out.push(`# ${SITE_NAME}`, '');
  out.push(
    `> ${SITE_NAME} is an agency that places workers from Azerbaijan with employers in Germany: it recruits and prepares candidates and prepares the documents for work and skilled-worker visas. Website: ${origin}/`,
    '',
  );
  out.push('## Facts', '');
  out.push(`- Languages: ${SEO_LOCALES.map((l) => `${LANG_NAME[l]} (${l === 'az' ? `${origin}/, default, no prefix` : `${origin}/${l}/`})`).join('; ')}`);
  out.push(`- Phone: ${phone}`);
  if (email) out.push(`- E-mail: ${email}`);
  for (const rule of NOT_OFFERED) out.push(`- ${rule}`);
  out.push('- Employer names are never published on the public website; vacancies are listed without the company name.');
  out.push(`- Machine-readable: ${origin}/ai/summary.json, ${origin}/ai/service.json, ${origin}/ai/faq.json, ${origin}/.well-known/ai.txt, ${origin}/sitemap.xml`);
  out.push('');

  out.push('## Key pages', '');
  for (const p of KEY_PAGES) {
    if (!STATIC_PAGES[p.path]) continue;
    out.push(`- ${p.what}: ${SEO_LOCALES.map((l) => `[${l}](${pageUrl(p.path, l)})`).join(' · ')}`);
  }
  out.push('');

  const calculators = ['/salary-calculator', '/calculator', '/cost-calculator', '/tax-refund-calculator'].filter((p) => STATIC_PAGES[p]);
  if (calculators.length) {
    out.push('## Calculators and tools', '');
    for (const p of calculators) out.push(line(textIn(STATIC_PAGES[p]!.name, 'en'), pageUrl(p, 'en'), textIn(STATIC_PAGES[p]!.description, 'en')));
    out.push('');
  }

  const visas = indexable(data.visas);
  if (visas.length) {
    out.push('## Visa categories', '');
    for (const v of visas) out.push(line(pick(v.title, 'en'), pageUrl(`/visas/${v.slug}`, 'en'), full ? pick(v.summary, 'en') : shorten(pick(v.summary, 'en'), 140)));
    out.push('');
  }

  if (full) {
    const services = indexable(data.services);
    if (services.length) {
      out.push('## Services', '');
      for (const s of services) out.push(line(pick(s.title, 'en'), pageUrl(`/services/${s.slug}`, 'en'), pick(s.summary, 'en')));
      out.push('');
    }
  }

  const jobs = liveJobs(data);
  if (jobs.length) {
    out.push('## Open vacancies (employer names are not published)', '');
    for (const j of jobs.slice(0, MAX_JOBS)) {
      const note = [j.city, j.positions > 0 ? `${j.positions} position${j.positions === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
      out.push(line(pick(j.title, 'en'), pageUrl(`/jobs/${j.slug}`, 'en'), note));
    }
    out.push('');
  }

  const guides = (data.guides ?? []).slice(0, MAX_GUIDES);
  if (guides.length) {
    out.push('## Guides', '');
    for (const g of guides) out.push(line(`${g.title} [${g.locale}]`, pageUrl(guidePath(g.slug), g.locale as SeoLocale), shorten(g.description, 160)));
    out.push('');
  }

  const posts = indexable(data.posts).slice(0, MAX_POSTS);
  if (posts.length) {
    out.push('## Articles', '');
    for (const p of posts) out.push(line(pick(p.title, 'en'), pageUrl(`/news/${p.slug}`, 'en'), shorten(pick(p.excerpt, 'en'), 160)));
    out.push('');
  }

  if (full) {
    const faq = faqItems(data, 'en');
    if (faq.length) {
      out.push('## Frequently asked questions', '');
      for (const f of faq) out.push(`### ${f.question}`, '', f.answer, '');
    }
  }
  return `${out.join('\n').trimEnd()}\n`;
};

/** AI crawler permissions: the same policy as robots.txt (everything public allowed, private areas excluded). */
export const renderAiTxt = (): string => {
  const origin = siteOrigin();
  return [
    `# ai.txt for ${origin}`,
    '# AI crawlers and assistants may read, index, quote and summarise the public pages of this site,',
    '# with attribution and a link to the source page. Same policy as /robots.txt (private areas are disallowed there).',
    '',
    'User-Agent: *',
    'Allow: /',
    ...PRIVATE_PREFIXES.flatMap((p) => robotsRules(p).map((r) => `Disallow: ${r}`)),
    '',
    '# Permissions',
    'Training: allowed with attribution',
    'Retrieval: allowed',
    'Summarisation: allowed',
    'Citation: allowed (link to the source page)',
    '',
    `Robots: ${origin}/robots.txt`,
    `Sitemap: ${origin}/sitemap.xml`,
    `LLMs: ${origin}/llms.txt`,
    `Summary: ${origin}/ai/summary.json`,
    `FAQ: ${origin}/ai/faq.json`,
    `Service: ${origin}/ai/service.json`,
    '',
  ].join('\n');
};

export const buildSummary = (data: SeoData) => {
  const origin = siteOrigin();
  const { phone, email } = contactOf(data);
  return {
    name: SITE_NAME,
    url: `${origin}/`,
    description: 'Agency that places workers from Azerbaijan with employers in Germany and prepares the documents for their work and skilled-worker visas.',
    contact: { phone, ...(email ? { email } : {}), page: pageUrl('/contact', 'en') },
    languages: SEO_LOCALES.map((l) => ({ code: l, name: LANG_NAME[l], url: pageUrl('/', l), default: l === 'az' })),
    services: CAPABILITIES,
    notOffered: NOT_OFFERED,
    endpoints: {
      llms: `${origin}/llms.txt`,
      llmsFull: `${origin}/llms-full.txt`,
      faq: `${origin}/ai/faq.json`,
      service: `${origin}/ai/service.json`,
      sitemap: `${origin}/sitemap.xml`,
    },
    updatedAt: newestUpdate(data)?.toISOString() ?? null,
  };
};

export const buildService = (data: SeoData) => {
  const origin = siteOrigin();
  return {
    // name + capabilities: the fields AI discovery checkers read (geo-optimizer: name >= 3 chars, non-empty list)
    name: `${SITE_NAME} — recruitment and visa-document preparation`,
    provider: { name: SITE_NAME, url: `${origin}/` },
    serviceType: 'Recruitment and visa-document preparation for workers from Azerbaijan placed with employers in Germany',
    areaServed: ['Azerbaijan', 'Türkiye', 'Ukraine', 'Germany'],
    capabilities: CAPABILITIES,
    limitations: NOT_OFFERED,
    audiences: [
      { audience: 'Workers and candidates', url: pageUrl('/for-workers', 'en') },
      { audience: 'Employers in Germany', url: pageUrl('/for-employers', 'en') },
    ],
    visaCategories: indexable(data.visas).map((v) => ({ name: pick(v.title, 'en'), url: pageUrl(`/visas/${v.slug}`, 'en') })),
    services: indexable(data.services).map((s) => ({ name: pick(s.title, 'en'), url: pageUrl(`/services/${s.slug}`, 'en') })),
    contact: { ...contactOf(data), page: pageUrl('/contact', 'en') },
  };
};

export const buildFaq = (data: SeoData, lng: SeoLocale) => ({
  name: `${SITE_NAME} FAQ`,
  inLanguage: lng,
  url: pageUrl('/faq', lng),
  items: faqItems(data, lng),
});

export const getLlms = (full: boolean) => cached(`geo:llms:${full ? 'full' : 'short'}`, async () => renderLlms(await getSeoData(), full));
