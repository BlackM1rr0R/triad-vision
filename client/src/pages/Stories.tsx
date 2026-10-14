import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, EyeOff, FileSignature, ShieldCheck, Stamp, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { TestimonialCard, VisaSticker } from '@/components/cards';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { DetailModal } from '@/components/ui/DetailModal';
import { RouteFlags } from '@/components/ui/Flag';
import { useCopy } from '@/components/about/shared';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { VisaCategory, VisaSample } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCompany } from '@/i18n/pagesCompany';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesCompany);

const labelsOf = (v: VisaCategory) => v.visaLabel.split('/').map((s) => s.trim());

/* ───────────────────────── Gallery with filter + detail ───────────────────────── */
const Gallery = ({ samples, visas }: { samples: VisaSample[]; visas: VisaCategory[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const copy = useCopy();
  const laws = copy<{ code: string; title: string }[]>('aboutPage.compliance.laws');
  const types = useMemo(() => [...new Set(samples.map((s) => s.visaLabel))], [samples]);
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<VisaSample | null>(null);
  const list = filter === 'all' ? samples : samples.filter((s) => s.visaLabel === filter);
  const related = open ? visas.filter((v) => labelsOf(v).includes(open.visaLabel)) : [];
  const basis = open ? laws.find((l) => l.code === open.visaLabel) : undefined;

  const chip = (active: boolean) =>
    clsx('rounded-full border px-4 py-2 text-sm font-semibold transition', active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-navy-900 hover:border-brand-400');

  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('storiesPage.gallery.eyebrow')} title={t('storiesPage.gallery.title')} subtitle={t('storiesPage.gallery.subtitle')} />
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('storiesPage.gallery.visaType')}>
            <button type="button" className={chip(filter === 'all')} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              {t('storiesPage.gallery.all')}
            </button>
            {types.map((x) => (
              <button key={x} type="button" className={chip(filter === x)} aria-pressed={filter === x} onClick={() => setFilter(x)}>
                {x} <span className="opacity-60">{samples.filter((s) => s.visaLabel === x).length}</span>
              </button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-sm text-muted">
            <EyeOff className="size-4 text-brand-600" /> {t('storiesPage.gallery.privacy')}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-8 sm:gap-x-8">
          {list.map((s) => (
            <button key={s.id} type="button" onClick={() => setOpen(s)} className="rounded-xl text-left" aria-label={`${tr(s.profession)} · ${s.visaLabel}`}>
              <VisaSticker sample={s} />
            </button>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted" aria-live="polite">
          {t('storiesPage.gallery.count', { count: list.length })}
        </p>
      </div>

      <DetailModal open={!!open} onClose={() => setOpen(null)} title={open ? tr(open.profession) : ''} eyebrow={open ? `${open.visaLabel} · ${tr(open.dateLabel)}` : undefined} icon={<Stamp className="size-6" />}>
        {open && (
          <div className="space-y-5">
            <div className="grid place-items-center rounded-2xl bg-surface py-6">
              <VisaSticker sample={open} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {[
                [t('storiesPage.gallery.profession'), tr(open.profession)],
                [t('storiesPage.gallery.visaType'), open.visaLabel],
                [t('storiesPage.gallery.date'), tr(open.dateLabel)],
                [t('storiesPage.gallery.basis'), basis?.title ?? open.visaLabel],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line p-3">
                  <dt className="text-xs font-semibold text-muted">{k}</dt>
                  <dd className="mt-1 font-semibold text-navy-900">{v}</dd>
                </div>
              ))}
            </dl>
            {related.length > 0 && (
              <div>
                <h4 className="text-xs font-bold tracking-widest text-brand-600 uppercase">{t('storiesPage.gallery.direction')}</h4>
                <ul className="mt-2 space-y-2">
                  {related.map((v) => (
                    <li key={v.id}>
                      <Link to={`/visas/${v.slug}`} onClick={() => setOpen(null)} className="group flex items-center justify-between gap-3 rounded-xl border border-line p-3 font-semibold text-navy-900 transition hover:border-brand-400">
                        {tr(v.title)}
                        <ArrowUpRight className="size-4 text-navy-900/40 group-hover:text-brand-600" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DetailModal>
    </section>
  );
};

/* ───────────────────────── Breakdown chart (single series) ───────────────────────── */
const Breakdown = ({ samples }: { samples: VisaSample[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-60px' });
  const rows = useMemo(() => {
    const m = new Map<string, VisaSample[]>();
    samples.forEach((s) => m.set(s.visaLabel, [...(m.get(s.visaLabel) ?? []), s]));
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [samples]);
  const max = Math.max(1, ...rows.map((r) => r[1].length));
  const steps = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <section className="section bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('storiesPage.chart.eyebrow')} title={t('storiesPage.chart.title')} subtitle={t('storiesPage.chart.subtitle')} />
        <Reveal>
          <div ref={ref} className="card grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
            <figure>
              <figcaption className="sr-only">{t('storiesPage.chart.caption')}</figcaption>
              <div className="relative mt-8 h-60 sm:h-64" aria-hidden>
                {/* gridlines */}
                {steps.map((s) => (
                  <div key={s} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${(s / max) * 100}%` }}>
                    <span className="absolute -top-2.5 left-0 bg-white pr-1 text-[0.65rem] text-muted">{s}</span>
                  </div>
                ))}
                <div className="absolute inset-0 left-6 flex items-end justify-around gap-3 sm:gap-6">
                  {rows.map(([label, list], i) => (
                    <div key={label} className="relative flex h-full w-full max-w-20 items-end">
                      <span
                        className="relative w-full rounded-t-md bg-brand-600"
                        style={{ height: on ? `${(list.length / max) * 100}%` : '0%', transition: `height 1s cubic-bezier(0.22,1,0.36,1) ${0.15 + i * 0.12}s` }}
                      >
                        <span className="absolute inset-x-0 -top-6 text-center font-display text-sm font-bold text-navy-900">{list.length}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="ml-6 flex justify-around gap-3 border-t-2 border-navy-900 pt-2 sm:gap-6" aria-hidden>
                {rows.map(([label]) => (
                  <span key={label} className="w-full max-w-20 text-center font-mono text-xs font-bold text-navy-900">
                    {label}
                  </span>
                ))}
              </div>
            </figure>
            <table className="w-full self-start text-sm">
              <caption className="pb-3 text-left font-display text-base font-bold text-navy-900">{t('storiesPage.chart.professions')}</caption>
              <tbody>
                {rows.map(([label, list]) => (
                  <tr key={label} className="border-t border-line">
                    <th scope="row" className="py-3 pr-3 text-left align-top">
                      <span className="inline-block rounded-md bg-navy-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{label}</span>
                    </th>
                    <td className="py-3 align-top text-muted">
                      <span className="font-semibold text-navy-900">
                        {list.length} {t('storiesPage.chart.samples')}
                      </span>
                      <span className="block">{list.map((s) => tr(s.profession)).join(', ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

/* ───────────────────────── Privacy principles ───────────────────────── */
const PRIVACY_ICONS = [FileSignature, EyeOff, Undo2];
const PrivacyStrip = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ title: string; text: string }[]>('storiesPage.privacy.items');
  return (
    <section className="section-sm bg-navy-950 text-white">
      <div className="container-x grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:gap-14">
        <div>
          <span className="eyebrow text-brand-400">
            <ShieldCheck className="size-4" /> {t('storiesPage.privacy.eyebrow')}
          </span>
          <h2 className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">{t('storiesPage.privacy.title')}</h2>
        </div>
        <Stagger className="grid gap-4 sm:grid-cols-3">
          {items.map((it, i) => {
            const I = PRIVACY_ICONS[i] ?? ShieldCheck;
            return (
              <StaggerItem key={it.title}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <I className="size-6 text-brand-400" />
                  <h3 className="mt-3 font-display font-bold">{it.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">{it.text}</p>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
};

export default function Stories() {
  const { t } = useTranslation();
  usePageTitle(t('storiesPage.hero.title'));
  const { data } = useSiteContent();
  const samples = data?.samples ?? [];
  const candidates = data?.testimonials.filter((x) => x.kind === 'candidate') ?? [];

  return (
    <>
      <PageHero title={t('storiesPage.hero.title')} subtitle={t('storiesPage.hero.subtitle')} image="https://images.unsplash.com/photo-1587330979470-3595ac045ab0?auto=format&fit=crop&w=2000&q=70" />

      {samples.length > 0 && <Gallery samples={samples} visas={data?.visaCategories ?? []} />}
      {samples.length > 0 && <Breakdown samples={samples} />}

      {candidates.length > 0 && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow={t('storiesPage.testimonials.eyebrow')} title={t('storiesPage.testimonials.title')} subtitle={t('storiesPage.testimonials.subtitle')} />
            <div className="grid-cards md:grid-cols-2">
              {candidates.map((x, i) => (
                <Reveal key={x.id} delay={(i % 2) * 0.1}>
                  <TestimonialCard item={x} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <PrivacyStrip />

      <section className="section">
        <div className="container-x">
          <Reveal>
            <div className="relative isolate overflow-hidden rounded-3xl border border-brand-100 bg-brand-50 px-6 py-12 text-center sm:px-12 sm:py-16 lg:rounded-[2rem]">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(47,123,255,0.18),transparent_60%)]" />
              <RouteFlags size="lg" className="justify-center" />
              <h2 className="mx-auto mt-6 max-w-2xl font-display text-2xl leading-tight font-extrabold text-navy-900 sm:text-4xl">{t('storiesPage.cta.title')}</h2>
              <p className="mx-auto mt-4 max-w-xl text-muted">{t('storiesPage.cta.text')}</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/eligibility" className="btn-primary group px-6 py-3.5">
                  {t('storiesPage.cta.primary')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                </Link>
                <Link to="/register" className="btn-ghost px-6 py-3.5">
                  {t('storiesPage.cta.secondary')}
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
