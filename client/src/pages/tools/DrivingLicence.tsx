import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, BookOpen, Briefcase, CalendarClock, CheckCircle2, ExternalLink, FileText, Info, Truck, Wallet } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Traveller } from '@/components/illustrations';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { PathLink, useGuidePath } from '@/components/guides/shared';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDrivingLicence } from '@/i18n/pagesDrivingLicence';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesDrivingLicence);

const AS_OF = '11.2026';

const SOURCES = [
  { label: '§ 29 FeV', href: 'https://www.gesetze-im-internet.de/fev_2010/__29.html' },
  { label: '§ 31 FeV', href: 'https://www.gesetze-im-internet.de/fev_2010/__31.html' },
  { label: 'Anlage 11 FeV', href: 'https://www.gesetze-im-internet.de/fev_2010/anlage_11.html' },
  { label: '§ 21 StVG', href: 'https://www.gesetze-im-internet.de/stvg/__21.html' },
  { label: 'BKrFQG', href: 'https://www.gesetze-im-internet.de/bkrfqg_2020/' },
  { label: 'service.berlin.de: Umschreibung (Drittstaat)', href: 'https://service.berlin.de/dienstleistung/327537/' },
  { label: 'IHK: beschleunigte Grundqualifikation', href: 'https://www.ihk.de/schwerin/bildung/sachkundepruefungen-und-unterrichtungsverfahren/beschleunigte-grundqualifikation-berufskraftfahrer-infos-termine-3032122' },
];

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

/**
 * /driving-licence-germany — guide for Azerbaijani licence holders: the 6-month rule (§ 29 FeV), why a theory
 * and a practical test are needed (Azerbaijan is not in Anlage 11 FeV, § 31), documents, costs (estimates) and
 * the truck driver path (C/CE + Berufskraftfahrerqualifikation). Static content, server-rendered.
 */
export default function DrivingLicencePage() {
  const { t } = useTranslation();
  usePageTitle(t('dl.heroTitle'));
  const driverGuide = useGuidePath('driver-jobs');
  const faq = t('dl.faq.items', { returnObjects: true }) as unknown as { q: string; a: string }[];
  const steps = t('dl.steps.items', { returnObjects: true }) as unknown as { t: string; d: string }[];
  const costs = t('dl.costs.items', { returnObjects: true }) as unknown as { label: string; value: string }[];

  return (
    <>
      <PageHero title={t('dl.heroTitle')} subtitle={t('dl.heroSubtitle')} illustration={<Traveller />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />

      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <div className="space-y-5">
            <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-6" aria-labelledby="dl-sum-h">
              <h2 id="dl-sum-h" className="font-display text-xl font-semibold text-ink">
                {t('dl.summary.title')}
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
                {list(t('dl.summary.items', { returnObjects: true })).map((s) => (
                  <li key={s.slice(0, 30)} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {s}
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="dl-val-h">
              <h2 id="dl-val-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <CalendarClock className="size-5 text-primary" aria-hidden /> {t('dl.validity.title')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('dl.validity.text')}</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('dl.validity.extension')}</p>
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-bg p-3 text-sm text-danger-fg">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('dl.validity.after')}
              </p>
            </section>
            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="dl-exam-h">
              <h2 id="dl-exam-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <BookOpen className="size-5 text-primary" aria-hidden /> {t('dl.exam.title')}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">{t('dl.exam.text')}</p>
            </section>
          </div>

          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6 lg:sticky lg:top-24" aria-labelledby="dl-steps-h">
            <h2 id="dl-steps-h" className="font-display text-xl font-semibold text-ink">
              {t('dl.steps.title')}
            </h2>
            <ol className="mt-4 space-y-3">
              {(Array.isArray(steps) ? steps : []).map((s, i) => (
                <li key={s.t} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-contrast">{i + 1}</span>
                  <span>
                    <span className="block font-semibold text-ink">{s.t}</span>
                    <span className="block text-sm leading-snug text-muted">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-6 md:grid-cols-2">
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="dl-docs-h">
            <h2 id="dl-docs-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <FileText className="size-5 text-primary" aria-hidden /> {t('dl.docs.title')}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-ink">
              {list(t('dl.docs.items', { returnObjects: true })).map((d) => (
                <li key={d.slice(0, 30)} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {d}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="dl-cost-h">
            <h2 id="dl-cost-h" className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Wallet className="size-5 text-primary" aria-hidden /> {t('dl.costs.title')}
            </h2>
            <dl className="mt-3 divide-y divide-line text-sm">
              {(Array.isArray(costs) ? costs : []).map((c) => (
                <div key={c.label} className="flex items-start justify-between gap-3 py-2">
                  <dt className="text-ink">{c.label}</dt>
                  <dd className="shrink-0 font-semibold text-ink tabular-nums">{c.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm font-semibold text-ink">{t('dl.costs.total')}</p>
            <p className="mt-1 text-xs text-muted">{t('dl.costs.note')}</p>
          </section>
        </div>
      </section>

      <section className="section" aria-labelledby="dl-truck-h">
        <div className="container-x max-w-4xl">
          <div className="rounded-3xl border border-line bg-card p-5 sm:p-7">
            <h2 id="dl-truck-h" className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
              <Truck className="size-6 text-primary" aria-hidden /> {t('dl.truck.title')}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink">{t('dl.truck.text')}</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
              {list(t('dl.truck.items', { returnObjects: true })).map((d) => (
                <li key={d.slice(0, 30)} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {d}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {driverGuide && (
                <PathLink path={driverGuide} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                  <BookOpen className="size-4" aria-hidden /> {t('dl.truck.guide')} <ArrowRight className="size-4" aria-hidden />
                </PathLink>
              )}
              <Link to="/jobs" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
                <Briefcase className="size-4" aria-hidden /> {t('dl.truck.jobs')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="pb-12" aria-labelledby="dl-src-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="dl-src-h" className="font-display text-xl font-semibold">
            {t('dl.sources')}
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
          <p className="text-xs text-muted">{t('dl.asOf', { date: AS_OF })}</p>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('dl.disclaimer')}
          </p>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading title={t('dl.faq.title')} />
          </div>
          <Accordion items={Array.isArray(faq) ? faq : []} />
          <FaqJsonLd items={Array.isArray(faq) ? faq : []} lng={currentSiteLocale()} />
        </div>
      </section>
      <RelatedGuides tool="/driving-licence-germany" />
      <div className="pt-16 sm:pt-20 lg:pt-28">
        <PageCta icon={<Truck className="size-7" />} title={t('dl.cta.title')} text={t('dl.cta.text')} primary={{ to: '/register', label: t('dl.cta.primary') }} secondary={{ to: '/jobs', label: t('dl.cta.secondary') }} />
      </div>
    </>
  );
}
