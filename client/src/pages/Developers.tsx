import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BriefcaseBusiness, Handshake } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesDevelopers } from '@/i18n/pagesDevelopers';
import { useBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesDevelopers);

const SECTIONS = ['overview', 'key', 'limit', 'endpoints', 'filters', 'example', 'apply', 'errors', 'cors', 'terms'] as const;

const Code = ({ children, label }: { children: string; label?: string }) => (
  <pre className="mt-3 overflow-x-auto rounded-2xl border border-line bg-sunken p-4 text-xs leading-relaxed text-ink" aria-label={label} tabIndex={0}>
    <code>{children}</code>
  </pre>
);

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
    <h2 id={`${id}-h`} className="font-display text-xl font-semibold text-ink sm:text-2xl">
      {title}
    </h2>
    <div className="mt-2 text-sm leading-relaxed text-ink sm:text-base">{children}</div>
  </section>
);

/** /developers — documentation of the public partner vacancy API (server/src/routes/publicApi.ts). */
export default function DevelopersPage() {
  const { t } = useTranslation();
  const brand = useBrand();
  usePageTitle(t('devApi.heroTitle'));
  const base = `https://${brand.domain}/api/public/v1`;
  const titles: Record<(typeof SECTIONS)[number], string> = {
    overview: t('devApi.overviewTitle'),
    key: t('devApi.keyTitle'),
    limit: t('devApi.limitTitle'),
    endpoints: t('devApi.endpointsTitle'),
    filters: t('devApi.filtersTitle'),
    example: t('devApi.exampleTitle'),
    apply: t('devApi.applyTitle'),
    errors: t('devApi.errorsTitle'),
    cors: t('devApi.corsTitle'),
    terms: t('devApi.termsTitle'),
  };
  const curl = `curl -H "Authorization: Bearer tvp_YOUR_KEY" \\\n  "${base}/vacancies?profession=LKW-Fahrer&germanLevel=B1&lng=de&pageSize=10"`;
  const js = `const res = await fetch('${base}/vacancies?lng=en', {\n  headers: { Authorization: \`Bearer \${process.env.TV_API_KEY}\` },\n});\nif (res.status === 429) await wait(Number(res.headers.get('Retry-After')) * 1000);\nconst { items, total } = await res.json();`;
  const response = `{
  "apiVersion": "1.0",
  "page": 1,
  "pageSize": 10,
  "total": 1,
  "items": [
    {
      "id": "clx…",
      "slug": "lkw-fahrer-ce-bonn",
      "language": "de",
      "title": "LKW-Fahrer CE (m/w/d)",
      "description": "…",
      "requirements": ["Führerschein CE", "Deutsch A2"],
      "benefits": ["Unterkunft wird gestellt"],
      "profession": "Berufskraftfahrer",
      "professionKey": "truck_driver",
      "city": "Bonn",
      "country": "DE",
      "germanLevel": "A2",
      "salary": { "min": 2800, "max": 3400, "currency": "EUR", "period": "MONTH", "gross": true },
      "employmentType": "FULL_TIME",
      "positions": 3,
      "datePosted": "2026-11-02T09:00:00.000Z",
      "validThrough": null,
      "companyName": null,
      "url": "https://${brand.domain}/jobs/lkw-fahrer-ce-bonn",
      "applyUrl": "https://${brand.domain}/jobs/lkw-fahrer-ce-bonn?ref=YOUR-CODE&src=tvp_AbCd1234"
    }
  ]
}`;

  return (
    <>
      <PageHero title={t('devApi.heroTitle')} subtitle={t('devApi.heroSubtitle')} crumb={{ to: '/cooperation', label: t('devApi.contactCta') }} />
      <div className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[14rem_1fr] lg:items-start">
          <nav aria-label={t('devApi.toc')} className="rounded-2xl border border-line bg-card p-4 lg:sticky lg:top-24">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{t('devApi.toc')}</p>
            <ol className="mt-2 space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <li key={s}>
                  <a href={`#${s}`} className="text-primary hover:underline">
                    {titles[s]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="min-w-0 space-y-10">
            <Section id="overview" title={titles.overview}>
              <p>{t('devApi.overview')}</p>
            </Section>
            <Section id="key" title={titles.key}>
              <p>{t('devApi.key')}</p>
              <p className="mt-3 font-semibold text-ink">{t('devApi.keyHeader')}</p>
              <Code>{'Authorization: Bearer tvp_…'}</Code>
              <p className="mt-2 text-xs text-muted">{t('devApi.keyAlt')}</p>
              <Code>{'X-API-Key: tvp_…'}</Code>
              <p className="mt-3">{t('devApi.keyRequest', { phone: brand.phone })}</p>
            </Section>
            <Section id="limit" title={titles.limit}>
              <p>{t('devApi.limit')}</p>
            </Section>
            <Section id="endpoints" title={titles.endpoints}>
              <ul className="space-y-3">
                {(
                  [
                    ['GET', '/vacancies', t('devApi.epList')],
                    ['GET', '/vacancies/{slug}', t('devApi.epOne')],
                    ['GET', '/schema.json', t('devApi.epSchema')],
                  ] as const
                ).map(([m, p, d]) => (
                  <li key={p} className="rounded-xl border border-line bg-card p-3">
                    <code className="text-xs break-all text-ink">
                      <span className="mr-2 rounded bg-primary px-1.5 py-0.5 font-semibold text-primary-contrast">{m}</span>
                      {base}
                      {p}
                    </code>
                    <p className="mt-1 text-sm">{d}</p>
                  </li>
                ))}
              </ul>
            </Section>
            <Section id="filters" title={titles.filters}>
              <dl className="space-y-2">
                {(['profession', 'city', 'germanLevel', 'lng', 'page'] as const).map((f) => (
                  <div key={f} className="grid gap-1 sm:grid-cols-[9rem_1fr]">
                    <dt>
                      <code className="text-xs font-semibold text-ink">{f === 'page' ? 'page, pageSize' : f}</code>
                    </dt>
                    <dd>{t(`devApi.filters.${f}`)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
            <Section id="example" title={titles.example}>
              <Code label="curl">{curl}</Code>
              <Code label="JavaScript">{js}</Code>
              <p className="mt-4 font-semibold text-ink">{t('devApi.responseTitle')}</p>
              <Code label="JSON">{response}</Code>
            </Section>
            <Section id="apply" title={titles.apply}>
              <p>{t('devApi.apply')}</p>
            </Section>
            <Section id="errors" title={titles.errors}>
              <ul className="list-disc space-y-1 pl-5">
                {(['e401', 'e403', 'e404', 'e429'] as const).map((e) => (
                  <li key={e}>{t(`devApi.errors.${e}`)}</li>
                ))}
              </ul>
              <Code>{'{ "error": "TOO_MANY_REQUESTS" }'}</Code>
            </Section>
            <Section id="cors" title={titles.cors}>
              <p>{t('devApi.cors')}</p>
            </Section>
            <Section id="terms" title={titles.terms}>
              <p>{t('devApi.terms')}</p>
            </Section>
            <div className="flex flex-wrap gap-3">
              <Link to="/cooperation" className={buttonClass({ size: 'lg' })}>
                <Handshake className="size-4" aria-hidden /> {t('devApi.contactCta')}
              </Link>
              <Link to="/jobs" className={buttonClass({ variant: 'outline', size: 'lg' })}>
                <BriefcaseBusiness className="size-4" aria-hidden /> {t('devApi.jobsCta')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
