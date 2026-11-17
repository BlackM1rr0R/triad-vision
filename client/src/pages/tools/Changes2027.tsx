import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowRight, CalendarClock, CheckCircle2, ExternalLink, HelpCircle, Info, PartyPopper } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryLinks, useLng, dmy } from '@/components/tools/calc/CalcShared';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';

/** Payload of GET /api/changes-2027 (server lib/changes2027/content.ts: built from the data freshness registry). */
type Status = 'enacted' | 'decided' | 'expected' | 'proposed';
type Audience = 'workers' | 'families' | 'employers' | 'households' | 'commuters' | 'newcomers' | 'drivers';
interface ChangeView {
  id: string;
  title: string;
  text: string;
  before: string;
  after: string;
  from: string;
  status: Status;
  statusName: string;
  statusLabel: string;
  affects: Audience[];
  implemented: boolean;
  source: { label: string; url: string };
  tools: { path: string; label: string }[];
  glossary: { slug: string; term: string }[];
}
interface ChangesPage {
  lng: string;
  date: string;
  asOf: string;
  holidayPlanner: string;
  texts: {
    h1: string;
    intro: string;
    labels: Record<'before' | 'after' | 'from' | 'status' | 'affects' | 'source' | 'tools' | 'glossary' | 'all' | 'filter' | 'asOf' | 'implemented' | 'faq' | 'also' | 'disclaimer' | 'toc', string>;
    status: Record<Status, string>;
    statusHelp: Record<Status, string>;
    affects: Record<Audience, string>;
    also: string[];
    faq: { q: string; a: string }[];
  };
  items: ChangeView[];
}

const STATUS_STYLE: Record<Status, string> = {
  enacted: 'border-success-border bg-success-bg text-success-fg',
  decided: 'border-primary/30 bg-primary/10 text-ink',
  expected: 'border-warning-border bg-warning-bg text-warning-fg',
  proposed: 'border-line bg-sunken text-muted',
};
const STATUSES: Status[] = ['enacted', 'decided', 'expected', 'proposed'];

/**
 * /changes-2027 — "What changes in Germany on 1 January 2027": every dated change of the data freshness registry
 * (old → new value, status exactly as the registry states, who is affected, official source, related calculators).
 * All figures and texts come from GET /api/changes-2027 (server-rendered, SSR key 'changes-2027'); the crawlable
 * body and the Article + FAQPage JSON-LD are built by the server from the same data (lib/changes2027/seo.ts).
 */
export default function Changes2027Page() {
  const { t } = useTranslation();
  const lng = useLng();
  const q = useQuery({
    queryKey: ['changes-2027', lng],
    queryFn: async () => (await api.get<ChangesPage>('/changes-2027', { params: { lng } })).data,
    staleTime: 60 * 60_000,
  });
  const d = q.data;
  usePageTitle(d?.texts.h1 ?? '');
  const [who, setWho] = useState<Audience | 'all'>('all');
  const audiences = useMemo(() => [...new Set((d?.items ?? []).flatMap((i) => i.affects))], [d]);
  const items = (d?.items ?? []).filter((i) => who === 'all' || i.affects.includes(who));

  if (!d) {
    return (
      <>
        <PageHero title="2027" crumb={{ to: '/tools', label: t('siteNav.tools') }} />
        <section className="section">
          <div className="container-x grid place-items-center py-16">{q.isError ? <p className="text-muted">{t('common.error', 'Error')}</p> : <Spinner />}</div>
        </section>
      </>
    );
  }
  const L = d.texts.labels;

  return (
    <>
      <PageHero title={d.texts.h1} subtitle={d.texts.intro} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-5xl space-y-6">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <CalendarClock className="size-4" aria-hidden />
            {L.asOf}: <time dateTime={d.asOf}>{dmy(d.asOf)}</time>
          </p>

          {/* Status legend */}
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STATUSES.map((s) => (
              <div key={s} className={clsx('rounded-2xl border p-3 text-sm', STATUS_STYLE[s])}>
                <dt className="font-semibold">{d.texts.status[s]}</dt>
                <dd className="mt-0.5 text-xs opacity-90">{d.texts.statusHelp[s]}</dd>
              </div>
            ))}
          </dl>

          {/* Audience filter */}
          <div role="group" aria-label={L.filter} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{L.filter}:</span>
            {(['all', ...audiences] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={who === a}
                onClick={() => setWho(a)}
                className={clsx('min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors', who === a ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}
              >
                {a === 'all' ? L.all : d.texts.affects[a]}
              </button>
            ))}
          </div>

          <ul className="space-y-4" aria-live="polite">
            {items.map((i) => (
              <li key={i.id} id={i.id} className="scroll-mt-24 rounded-3xl border border-line bg-card p-4 shadow-[var(--tv-shadow-raised)] sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink sm:text-xl">{i.title}</h2>
                  <span className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[i.status])} title={d.texts.statusHelp[i.status]}>
                    {i.statusName}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
                  <div className="rounded-2xl bg-sunken p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{L.before}</p>
                    <p className="mt-1 font-semibold text-ink tabular-nums" translate="no">{i.before}</p>
                  </div>
                  <ArrowRight className="mx-auto size-5 rotate-90 self-center text-muted sm:rotate-0" aria-hidden />
                  <div className={clsx('rounded-2xl border p-3', i.status === 'enacted' || i.status === 'decided' ? 'border-primary/30 bg-primary/5' : 'border-dashed border-line')}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {L.after} {i.from !== d.date && `(${dmy(i.from)})`}
                    </p>
                    <p className="mt-1 font-semibold text-ink tabular-nums" translate="no">{i.after}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink">{i.text}</p>
                <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{L.status}:</span> {i.statusLabel}
                  </span>
                </p>
                {i.implemented && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm text-success-fg">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {L.implemented}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">{L.affects}:</span>
                  {i.affects.map((a) => (
                    <span key={a} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-ink">
                      {d.texts.affects[a]}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-ink">{L.tools}:</span>
                  {i.tools.map((x) => (
                    <Link key={x.path} to={x.path} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-link hover:bg-sunken">
                      {x.label} <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  ))}
                </div>
                {i.glossary.length > 0 && (
                  <div className="mt-3">
                    <GlossaryLinks terms={i.glossary.map((g) => ({ slug: g.slug, label: g.term }))} />
                  </div>
                )}
                <p className="mt-3 text-sm">
                  <span className="font-semibold text-ink">{L.source}:</span>{' '}
                  <a href={i.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                    {i.source.label} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </p>
              </li>
            ))}
          </ul>

          <div className="rounded-3xl border border-line bg-card p-4 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">{L.also}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
              {d.texts.also.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <Link to="/holiday-planner" className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
              <PartyPopper className="size-4" aria-hidden /> {d.holidayPlanner}
            </Link>
          </div>

          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{L.disclaimer}</span>
          </p>
        </div>
      </section>

      {/* FAQ: the FAQPage JSON-LD comes from the server head (lib/seo.ts), so none is rendered here. */}
      <section className="section bg-sunken" aria-labelledby="changes-faq-h">
        <div className="container-x max-w-3xl">
          <h2 id="changes-faq-h" className="h-section section-head flex items-center gap-2 text-ink">
            <HelpCircle className="size-6 text-primary" aria-hidden /> {L.faq}
          </h2>
          <div className="space-y-3">
            {d.texts.faq.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line bg-card p-4">
                <h3 className="font-display text-base font-semibold text-ink">{f.q}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <RelatedGuides tool="/changes-2027" />
    </>
  );
}
