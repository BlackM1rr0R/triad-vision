import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BookOpen, Building2, CalendarDays, CheckCircle2, Clock, ExternalLink, GraduationCap, Handshake, Info, Languages, Landmark, MessagesSquare, Scale, Users, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Employer } from '@/components/illustrations';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { PathLink, useGuidePath } from '@/components/guides/shared';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesEmployerGuideAz } from '@/i18n/pagesEmployerGuideAz';
import { useBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';
import { HOLIDAY_YEARS, holidayDays, holidayRange, holidaysFor } from '@/lib/employerGuideAz/holidays';

registerCopy(pagesEmployerGuideAz);

const AS_OF = '11.2026';
const PUBLISHED = '2026-11-16';
/** Fee of the fast-track procedure, § 47 Abs. 1 Nr. 15 AufenthV. */
const FEE_81A = 411;
/** National (D) visa fee. */
const VISA_FEE = 75;

const SOURCES = [
  { label: 'anerkennung-in-deutschland.de', href: 'https://www.anerkennung-in-deutschland.de' },
  { label: 'anabin (KMK)', href: 'https://anabin.kmk.org' },
  { label: 'ZAB: Zeugnisbewertung', href: 'https://www.kmk.org/zab/zeugnisbewertungen.html' },
  { label: 'make-it-in-germany.com', href: 'https://www.make-it-in-germany.com/de/unternehmen' },
  { label: '§ 81a AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__81a.html' },
  { label: '§ 31a AufenthV', href: 'https://www.gesetze-im-internet.de/aufenthv/__31a.html' },
  { label: '§ 47 AufenthV (Gebühren)', href: 'https://www.gesetze-im-internet.de/aufenthv/__47.html' },
  { label: 'Deutsche Botschaft Baku', href: 'https://baku.diplo.de' },
  { label: 'Nazirlər Kabineti, Qərar № 362 (02.12.2025)', href: 'https://nk.gov.az/uploads/doc/docs/692e89d45e806.pdf' },
  { label: 'ÖSD: SDSK Baku', href: 'https://www.osd.at/en/?p=28803' },
  { label: 'Goethe-Institut: Deutschprüfungen in Aserbaidschan', href: 'https://www.goethe.de/ins/ge/de/kul/pro/kbn/dpa.html' },
];

const GLOSSARY = [
  ['anerkennung', 'Anerkennung'],
  ['anabin', 'anabin'],
  ['zeugnisbewertung', 'Zeugnisbewertung'],
  ['anpassungslehrgang', 'Anpassungslehrgang'],
  ['beschleunigtes-fachkraefteverfahren', 'Beschleunigtes Fachkräfteverfahren'],
  ['vorabzustimmung', 'Vorabzustimmung'],
  ['zustimmung-der-bundesagentur', 'Zustimmung der BA'],
  ['blaue-karte-eu', 'Blaue Karte EU'],
  ['ausbildung', 'Ausbildung'],
  ['sprachzertifikat', 'Sprachzertifikat'],
  ['nationales-visum', 'Nationales Visum'],
  ['botschaft', 'Botschaft'],
] as const;

const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
/** Article JSON for a script element: <, >, & and the line / paragraph separators (U+2028, U+2029) as JSON unicode escapes. */
const UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
const articleJson = (o: object) => JSON.stringify(o).replace(UNSAFE, (c) => `${String.fromCharCode(92)}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const Card = ({ id, icon, title, children, className }: { id: string; icon: ReactNode; title: string; children: ReactNode; className?: string }) => (
  <section id={id} className={clsx('scroll-mt-24 rounded-3xl border border-line bg-card p-5 sm:p-7', className)} aria-labelledby={`${id}-h`}>
    <h2 id={`${id}-h`} className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
      <span className="text-primary">{icon}</span> {title}
    </h2>
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">{children}</div>
  </section>
);

const Table = ({ caption, head, rows }: { caption?: string; head: string[]; rows: string[][] }) => (
  <div className="-mx-1 overflow-x-auto px-1">
    <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-b border-line-strong">
          {head.map((h) => (
            <th key={h} scope="col" className="py-2 pr-3 font-semibold text-ink">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.join('|')} className="border-b border-line align-top">
            {r.map((c, i) => (i === 0 ? <th key={i} scope="row" className="py-2 pr-3 font-semibold text-ink">{c}</th> : <td key={i} className="py-2 pr-3 text-ink">{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * /employer-guide-azerbaijan (German first: /de/employer-guide-azerbaijan) — guide for German employers hiring
 * from Azerbaijan: education system and its typical DQR/EQF orientation, recognition (anabin, ZAB, reference
 * occupations), typical professions, German exams available in Baku, work culture, Azerbaijani public holidays
 * 2026–2027 (lib/employerGuideAz/holidays.ts), a respectful note on religion, visa routes with the § 81a fast
 * track, what Triad Vision does and does not do, FAQ and a CTA to the employer request form. Static content,
 * server-rendered, with Article + FAQPage JSON-LD.
 */
export default function EmployerGuideAzerbaijanPage() {
  const { t } = useTranslation();
  usePageTitle(t('ega.heroTitle'));
  const brand = useBrand();
  const lng = currentSiteLocale();
  const shortGuide = useGuidePath('employer-azerbaijan');
  const [year, setYear] = useState(HOLIDAY_YEARS[0]);
  const vars = { fee: FEE_81A, visaFee: VISA_FEE };
  const faq = arr<{ q: string; a: string }>(t('ega.faq.items', { returnObjects: true, ...vars }));
  const eduRows = arr<{ stage: string; name: string; text: string }>(t('ega.edu.rows', { returnObjects: true }));
  const gradeRows = arr<{ points: string; letter: string; meaning: string }>(t('ega.edu.grading.rows', { returnObjects: true }));
  const mapRows = arr<{ qual: string; level: string; route: string }>(t('ega.edu.mapping.rows', { returnObjects: true }));
  const visaRows = arr<{ route: string; who: string; key: string }>(t('ega.visa.rows', { returnObjects: true, ...vars }));
  const timeline = arr<{ t: string; d: string }>(t('ega.visa.timeline', { returnObjects: true, ...vars }));
  const toc: [string, string][] = [
    ['ega-edu', t('ega.edu.title')],
    ['ega-jobs', t('ega.jobs.title')],
    ['ega-lang', t('ega.language.title')],
    ['ega-culture', t('ega.culture.title')],
    ['ega-holidays', t('ega.holidays.title')],
    ['ega-visa', t('ega.visa.title')],
    ['ega-triad', t('ega.triad.title', { brand: brand.name })],
  ];
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t('ega.heroTitle'),
    description: t('ega.heroSubtitle'),
    inLanguage: lng,
    datePublished: PUBLISHED,
    dateModified: PUBLISHED,
    author: { '@type': 'Organization', name: brand.name },
    publisher: { '@type': 'Organization', name: brand.name },
    about: ['Fachkräfteeinwanderung', 'Aserbaidschan', 'Anerkennung ausländischer Berufsqualifikationen'],
  };

  return (
    <>
      <PageHero title={t('ega.heroTitle')} subtitle={t('ega.heroSubtitle')} illustration={<Employer />} crumb={{ to: '/for-employers', label: t('siteNav.footer.employers') }}>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Clock className="size-4" aria-hidden /> {t('ega.readingTime')} · {t('ega.asOf', { date: AS_OF })}
        </p>
      </PageHero>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: articleJson(article) }} />

      <section className="section">
        <div className="container-x grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <nav aria-label={t('ega.toc')} className="rounded-3xl border border-line bg-card p-5 lg:sticky lg:top-24">
            <p className="text-sm font-semibold text-ink">{t('ega.toc')}</p>
            <ol className="mt-2 space-y-1 text-sm">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="inline-flex min-h-9 items-center text-link hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-6">
            <Card id="ega-facts" icon={<Landmark className="size-6" aria-hidden />} title={t('ega.facts.title')}>
              <ul className="space-y-2">
                {arr<string>(t('ega.facts.items', { returnObjects: true })).map((s) => (
                  <li key={s.slice(0, 30)} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {s}
                  </li>
                ))}
              </ul>
            </Card>

            <Card id="ega-edu" icon={<GraduationCap className="size-6" aria-hidden />} title={t('ega.edu.title')}>
              <p>{t('ega.edu.intro')}</p>
              <ol className="space-y-3">
                {eduRows.map((r) => (
                  <li key={r.name} className="rounded-2xl bg-sunken p-4">
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">{r.stage}</p>
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="mt-1">{r.text}</p>
                  </li>
                ))}
              </ol>
              <h3 className="pt-2 font-display text-lg font-semibold">{t('ega.edu.grading.title')}</h3>
              <p>{t('ega.edu.grading.text')}</p>
              <Table
                caption={t('ega.edu.grading.title')}
                head={[t('ega.edu.grading.columns.points'), t('ega.edu.grading.columns.letter'), t('ega.edu.grading.columns.meaning')]}
                rows={gradeRows.map((r) => [r.points, r.letter, r.meaning])}
              />
              <h3 className="pt-2 font-display text-lg font-semibold">{t('ega.edu.mapping.title')}</h3>
              <p>{t('ega.edu.mapping.intro')}</p>
              <Table
                caption={t('ega.edu.mapping.title')}
                head={[t('ega.edu.mapping.columns.qual'), t('ega.edu.mapping.columns.level'), t('ega.edu.mapping.columns.route')]}
                rows={mapRows.map((r) => [r.qual, r.level, r.route])}
              />
              <p className="flex items-start gap-2 rounded-2xl border border-line bg-sunken p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('ega.edu.mapping.anabin')}
              </p>
              <p className="flex flex-wrap gap-x-4 gap-y-1">
                <a href="https://www.anerkennung-in-deutschland.de" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
                  anerkennung-in-deutschland.de <ExternalLink className="size-3" aria-hidden />
                </a>
                <a href="https://anabin.kmk.org" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
                  anabin.kmk.org <ExternalLink className="size-3" aria-hidden />
                </a>
                <Link to="/anerkennung" className="inline-flex min-h-11 items-center gap-1 font-semibold text-link hover:underline">
                  <Scale className="size-4" aria-hidden /> {t('ega.anerkennungTool')}
                </Link>
              </p>
            </Card>

            <Card id="ega-jobs" icon={<Building2 className="size-6" aria-hidden />} title={t('ega.jobs.title')}>
              <p>{t('ega.jobs.intro')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {arr<string>(t('ega.jobs.items', { returnObjects: true })).map((s) => (
                  <li key={s.slice(0, 30)}>{s}</li>
                ))}
              </ul>
              <p>{t('ega.jobs.proof')}</p>
            </Card>

            <Card id="ega-lang" icon={<Languages className="size-6" aria-hidden />} title={t('ega.language.title')}>
              <p>{t('ega.language.intro')}</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {arr<string>(t('ega.language.exams', { returnObjects: true })).map((s) => (
                  <li key={s.slice(0, 30)}>{s}</li>
                ))}
              </ul>
              <p>{t('ega.language.tip')}</p>
            </Card>

            <Card id="ega-culture" icon={<MessagesSquare className="size-6" aria-hidden />} title={t('ega.culture.title')}>
              <ul className="space-y-2">
                {arr<string>(t('ega.culture.items', { returnObjects: true })).map((s) => (
                  <li key={s.slice(0, 30)} className="flex gap-2">
                    <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {s}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{t('ega.culture.caveat')}</p>
            </Card>

            <Card id="ega-holidays" icon={<CalendarDays className="size-6" aria-hidden />} title={t('ega.holidays.title')}>
              <p>{t('ega.holidays.intro')}</p>
              <div className="flex gap-2" role="group" aria-label={t('ega.holidays.year')}>
                {HOLIDAY_YEARS.map((y) => (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={year === y}
                    onClick={() => setYear(y)}
                    className={clsx(
                      'min-h-11 rounded-full border px-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none sm:min-h-9',
                      year === y ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
              <Table
                caption={`${t('ega.holidays.title')} ${year}`}
                head={[t('ega.holidays.columns.date'), t('ega.holidays.columns.holiday'), t('ega.holidays.columns.days'), t('ega.holidays.columns.status')]}
                rows={holidaysFor(year).map((h) => [holidayRange(h), t(`ega.holidays.names.${h.key}`), String(holidayDays(h)), t(`ega.holidays.status.${h.status}`)])}
              />
              <p className="text-xs text-muted">{t('ega.holidays.note')}</p>
              <h3 className="pt-2 font-display text-lg font-semibold">{t('ega.religion.title')}</h3>
              <p>{t('ega.religion.text')}</p>
            </Card>

            <Card id="ega-visa" icon={<Scale className="size-6" aria-hidden />} title={t('ega.visa.title')}>
              <p>{t('ega.visa.intro')}</p>
              <Table caption={t('ega.visa.title')} head={[t('ega.visa.columns.route'), t('ega.visa.columns.who'), t('ega.visa.columns.key')]} rows={visaRows.map((r) => [r.route, r.who, r.key])} />
              <h3 className="pt-2 font-display text-lg font-semibold">{t('ega.visa.timelineTitle')}</h3>
              <ol className="space-y-3">
                {timeline.map((s, i) => (
                  <li key={s.t} className="flex gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-contrast">{i + 1}</span>
                    <span>
                      <span className="block font-semibold text-ink">{s.t}</span>
                      <span className="block text-muted">{s.d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="rounded-2xl bg-sunken p-3 font-semibold">{t('ega.visa.timelineNote')}</p>
            </Card>

            <Card id="ega-triad" icon={<Handshake className="size-6" aria-hidden />} title={t('ega.triad.title', { brand: brand.name })}>
              <div className="grid gap-4 md:grid-cols-2">
                <ul className="space-y-2">
                  {arr<string>(t('ega.triad.does', { returnObjects: true })).map((s) => (
                    <li key={s.slice(0, 30)} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {s}
                    </li>
                  ))}
                </ul>
                <ul className="space-y-2">
                  {arr<string>(t('ega.triad.doesNot', { returnObjects: true })).map((s) => (
                    <li key={s.slice(0, 30)} className="flex gap-2">
                      <XCircle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden /> {s}
                    </li>
                  ))}
                </ul>
              </div>
              {shortGuide && (
                <PathLink path={shortGuide} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-link hover:underline">
                  <BookOpen className="size-4" aria-hidden /> {t('ega.more')}
                </PathLink>
              )}
            </Card>

            <section aria-labelledby="ega-gloss-h" className="rounded-3xl border border-line bg-card p-5 sm:p-6">
              <h2 id="ega-gloss-h" className="text-sm font-semibold text-ink">
                {t('ega.glossary')}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {GLOSSARY.map(([slug, label]) => (
                  <li key={slug}>
                    <Link to={`/glossary/${slug}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3 text-xs font-semibold text-ink hover:bg-sunken" translate="no">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading title={t('ega.faq.title')} />
          </div>
          <Accordion items={faq} />
          <FaqJsonLd items={faq} lng={lng} />
        </div>
      </section>

      <section className="py-10" aria-labelledby="ega-src-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="ega-src-h" className="font-display text-xl font-semibold">
            {t('ega.sources')}
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  {s.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('ega.asOf', { date: AS_OF })}</p>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('ega.disclaimer')}
          </p>
        </div>
      </section>

      <div className="pt-6">
        <PageCta
          icon={<Handshake className="size-7" />}
          title={t('ega.cta.title')}
          text={t('ega.cta.text')}
          primary={{ to: '/cooperation#form', label: t('ega.cta.primary') }}
          secondary={{ to: '/booking', label: t('ega.cta.secondary') }}
        />
      </div>
    </>
  );
}
