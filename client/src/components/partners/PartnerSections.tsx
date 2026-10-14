import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInView } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Check, ExternalLink, MapPinOff, MousePointerClick, Plus, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { TestimonialCard } from '@/components/cards';
import { useCopy } from '@/components/about/shared';
import { useL10n } from '@/lib/l10n';
import type { Office, Partner, PartnerSector, Testimonial } from '@/lib/types';
import { CityLine, SECTORS, SECTOR_ICON, SectorBadge, Wordmark, initials, sectorOf } from './parts';
import { GermanyMap, useCityGroups } from './GermanyMap';

type Open = (p: Partner) => void;

/* ───────────────────────── Featured partners ───────────────────────── */
export const FeaturedPartners = ({ partners, onOpen }: { partners: Partner[]; onOpen: Open }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  if (!partners.length) return null;
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.featured.eyebrow')} title={t('partnersPage.featured.title')} subtitle={t('partnersPage.featured.subtitle')} />
        <Stagger className="grid-cards grid-cols-1 md:grid-cols-2">
          {partners.map((p, i) => (
            <StaggerItem key={p.id}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white transition duration-300 hover:border-brand-200 hover:shadow-[0_30px_60px_-25px_rgba(21,101,232,0.4)]">
                <div className={clsx('relative flex h-36 items-center justify-between gap-4 overflow-hidden px-6 sm:h-44 sm:px-8', i % 2 ? 'bg-navy-900' : 'bg-surface')}>
                  <span aria-hidden className={clsx('pointer-events-none absolute -right-4 -bottom-10 font-display text-[9rem] leading-none font-black select-none', i % 2 ? 'text-white/[0.05]' : 'text-navy-900/[0.04]')}>
                    {initials(p.name)}
                  </span>
                  <Wordmark partner={p} size="lg" className={clsx('relative min-w-0', i % 2 && !p.logo && 'text-white')} />
                  <SectorBadge sector={sectorOf(p)} dark={i % 2 === 1} />
                </div>
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <CityLine city={p.city} />
                  {p.description && <p className="mt-3 flex-1 text-[0.95rem] leading-relaxed text-muted">{tr(p.description)}</p>}
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => onOpen(p)} className="btn-primary btn-sm">
                      {t('partnersPage.card.more')} <ArrowRight className="size-4" />
                    </button>
                    {p.website && (
                      <a href={p.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline">
                        {t('partnersPage.card.visit')} <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Sector chart (single series, one hue) ───────────────────────── */
const SectorChart = ({ partners }: { partners: Partner[] }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const on = useInView(ref, { once: true, margin: '-60px' });
  const rows = useMemo(() => {
    const counts = new Map<PartnerSector, number>();
    partners.forEach((p) => counts.set(sectorOf(p), (counts.get(sectorOf(p)) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [partners]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const total = partners.length;

  return (
    <figure ref={ref} className="card card-pad">
      <figcaption>
        <h3 className="font-display text-lg font-bold text-navy-900">{t('partnersPage.chart.title')}</h3>
        <p className="mt-1 text-sm text-muted">{t('partnersPage.chart.subtitle')}</p>
      </figcaption>
      <table className="mt-5 w-full border-separate border-spacing-y-2.5 text-sm">
        <caption className="sr-only">{t('partnersPage.chart.caption')}</caption>
        <tbody>
          {rows.map(([s, n], i) => {
            const I = SECTOR_ICON[s];
            return (
              <tr key={s}>
                <th scope="row" className="w-[42%] pr-3 text-left font-semibold text-navy-900">
                  <span className="flex items-center gap-2">
                    <I className="size-4 shrink-0 text-brand-600" />
                    <span className="truncate">{t(`partnersPage.sector.${s}`)}</span>
                  </span>
                </th>
                <td>
                  <span className="flex items-center gap-3">
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-brand-50">
                      <span
                        className="block h-full rounded-full bg-brand-600"
                        style={{ width: on ? `${(n / max) * 100}%` : '0%', transition: `width 1s cubic-bezier(0.22,1,0.36,1) ${0.15 + i * 0.12}s` }}
                      />
                    </span>
                    <span className="w-14 shrink-0 text-right font-display font-bold text-navy-900 tabular-nums">
                      {n} <span className="text-xs font-medium text-muted">· {Math.round((n / total) * 100)}%</span>
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 border-t border-line pt-3 text-right text-sm text-muted">
        {t('partnersPage.chart.total')}: <span className="font-display font-bold text-navy-900">{total}</span>
      </p>
    </figure>
  );
};

/* ───────────────────────── Map explorer + chart ───────────────────────── */
export const MapExplorer = ({ partners, office, onOpen }: { partners: Partner[]; office?: Office; onOpen: Open }) => {
  const { t } = useTranslation();
  const { groups, unlocated } = useCityGroups(partners);
  const [selected, setSelected] = useState<string | null>(null);
  const current = groups.find((g) => g.city === selected) ?? null;

  return (
    <section className="section bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.map.eyebrow')} title={t('partnersPage.map.title')} subtitle={t('partnersPage.map.subtitle')} />
        <div className="grid items-start gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <Reveal>
            <div className="rounded-3xl border border-line bg-[radial-gradient(circle_at_50%_40%,#ffffff,#eef3fb)] p-4 sm:p-8">
              <GermanyMap groups={groups} office={office} selected={selected} onSelect={(c) => setSelected((s) => (s === c ? null : c))} />
            </div>
          </Reveal>
          <div className="space-y-5">
            <Reveal>
              <div className="card card-pad min-h-[180px]" aria-live="polite">
                {current ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-display text-xl font-extrabold text-navy-900">{current.city}</h3>
                      <button type="button" onClick={() => setSelected(null)} className="grid size-8 place-items-center rounded-full bg-surface text-navy-900 hover:bg-brand-50" aria-label={t('common.close')}>
                        <X className="size-4" />
                      </button>
                    </div>
                    <ul className="mt-4 space-y-2">
                      {current.partners.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => onOpen(p)} className="group flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand-400">
                            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-navy-900 font-display text-xs font-bold text-white">{initials(p.name)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-bold text-navy-900">{p.name}</span>
                              <span className="text-xs text-muted">{t(`partnersPage.sector.${sectorOf(p)}`)}</span>
                            </span>
                            <ArrowUpRight className="size-4 shrink-0 text-navy-900/30 group-hover:text-brand-600" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center py-6 text-center text-muted">
                    <MousePointerClick className="size-8 text-brand-500" />
                    <p className="mt-3 text-sm font-semibold">{t('partnersPage.map.pick')}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      {groups.map((g) => (
                        <button key={g.city} type="button" onClick={() => setSelected(g.city)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-navy-900 transition hover:border-brand-400 hover:text-brand-700">
                          {g.city}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {unlocated.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      <MapPinOff className="size-3.5" /> {t('partnersPage.map.unlocated')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {unlocated.map((p) => (
                        <button key={p.id} type="button" onClick={() => onOpen(p)} className="rounded-md bg-surface px-2.5 py-1 text-xs font-semibold text-navy-900 hover:bg-brand-50">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <SectorChart partners={partners} />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── Directory with filters ───────────────────────── */
export const PartnerDirectory = ({ partners, onOpen }: { partners: Partner[]; onOpen: Open }) => {
  const { t } = useTranslation();
  const [sector, setSector] = useState<PartnerSector | 'all'>('all');
  const [q, setQ] = useState('');
  const present = useMemo(() => SECTORS.filter((s) => partners.some((p) => sectorOf(p) === s)), [partners]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => (sector === 'all' || sectorOf(p) === sector) && (!needle || p.name.toLowerCase().includes(needle) || (p.city ?? '').toLowerCase().includes(needle)));
  }, [partners, sector, q]);

  const chip = (active: boolean) =>
    clsx('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition', active ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-navy-900 hover:border-brand-400');

  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.directory.eyebrow')} title={t('partnersPage.directory.title')} />
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('partnersPage.card.sector')}>
            <button type="button" className={chip(sector === 'all')} aria-pressed={sector === 'all'} onClick={() => setSector('all')}>
              {t('partnersPage.directory.all')} <span className="opacity-60">{partners.length}</span>
            </button>
            {present.map((s) => {
              const I = SECTOR_ICON[s];
              return (
                <button key={s} type="button" className={chip(sector === s)} aria-pressed={sector === s} onClick={() => setSector(s)}>
                  <I className="size-4" /> {t(`partnersPage.sector.${s}`)} <span className="opacity-60">{partners.filter((p) => sectorOf(p) === s).length}</span>
                </button>
              );
            })}
          </div>
          <label className="relative block w-full lg:w-80">
            <span className="sr-only">{t('partnersPage.directory.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('partnersPage.directory.search')} className="input py-3 pl-10" />
          </label>
        </div>
        <p className="mb-4 text-sm text-muted" aria-live="polite">
          {t('partnersPage.directory.count', { count: list.length })}
        </p>

        {list.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {list.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpen(p)}
                className="group flex min-w-0 items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left transition duration-300 hover:-translate-y-1 hover:border-brand-400 hover:shadow-lg sm:flex-col sm:items-stretch sm:p-5"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface transition group-hover:bg-brand-50 sm:h-16 sm:w-full">
                  {p.logo ? <Wordmark partner={p} size="sm" className="max-w-full px-2" /> : <span className="font-display text-lg font-black text-navy-900/70 group-hover:text-brand-600 sm:text-xl">{initials(p.name)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-display font-bold text-navy-900">{p.name}</span>
                    <Plus className="size-4 shrink-0 text-navy-900/30 transition group-hover:rotate-90 group-hover:text-brand-600" />
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:mt-2 sm:flex-col sm:items-start">
                    <SectorBadge sector={sectorOf(p)} />
                    <CityLine city={p.city} className="text-xs" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="text-muted">{t('partnersPage.directory.empty')}</p>
            <button
              type="button"
              className="btn-ghost btn-sm mt-4"
              onClick={() => {
                setQ('');
                setSector('all');
              }}
            >
              {t('partnersPage.directory.reset')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

/* ───────────────────────── Commitments ───────────────────────── */
export const CommitmentsSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ metric: string; title: string; text: string }[]>('partnersPage.why.items');
  return (
    <section className="section relative isolate overflow-hidden bg-navy-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_0%,rgba(47,123,255,0.25),transparent_45%)]" />
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.why.eyebrow')} title={t('partnersPage.why.title')} subtitle={t('partnersPage.why.subtitle')} light />
        <Stagger className="grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <StaggerItem key={it.title} className="bg-navy-950">
              <div className="h-full p-6 sm:p-8">
                <p className="font-display text-4xl font-extrabold text-transparent bg-gradient-to-r from-white to-brand-400 bg-clip-text sm:text-5xl">{it.metric}</p>
                <h3 className="mt-4 font-display text-lg font-bold">{it.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/65">{it.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Partnership models ───────────────────────── */
export const ModelsSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ name: string; tag: string; text: string; bestFor: string; features: string[] }[]>('partnersPage.models.items');
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.models.eyebrow')} title={t('partnersPage.models.title')} subtitle={t('partnersPage.models.subtitle')} center />
        <Stagger className="grid-cards lg:grid-cols-3">
          {items.map((m, i) => {
            const hi = i === 1;
            return (
              <StaggerItem key={m.name}>
                <div className={clsx('flex h-full flex-col rounded-3xl p-6 sm:p-8', hi ? 'bg-navy-900 text-white shadow-2xl shadow-navy-900/30 lg:-my-4 lg:py-12' : 'border border-line bg-white')}>
                  <span className={clsx('self-start rounded-full px-3 py-1 text-xs font-bold', hi ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}>{m.tag}</span>
                  <h3 className={clsx('mt-4 font-display text-2xl font-extrabold', hi ? 'text-white' : 'text-navy-900')}>{m.name}</h3>
                  <p className={clsx('mt-3 text-sm leading-relaxed', hi ? 'text-white/75' : 'text-muted')}>{m.text}</p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {m.features.map((f) => (
                      <li key={f} className="flex items-start gap-3 text-sm">
                        <span className={clsx('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', hi ? 'bg-brand-500 text-white' : 'bg-success/15 text-success')}>
                          <Check className="size-3" strokeWidth={3} />
                        </span>
                        <span className={hi ? 'text-white/90' : 'text-navy-900'}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={clsx('mt-6 rounded-xl p-4 text-sm', hi ? 'bg-white/[0.07]' : 'bg-surface')}>
                    <span className={clsx('block text-xs font-bold tracking-wider uppercase', hi ? 'text-brand-400' : 'text-brand-600')}>{t('partnersPage.models.bestFor')}</span>
                    <span className={clsx('mt-1 block', hi ? 'text-white/85' : 'text-navy-900')}>{m.bestFor}</span>
                  </div>
                  <Link to="/cooperation" className={clsx('mt-6', hi ? 'btn-white' : 'btn-ghost')}>
                    {t('partnersPage.models.choose')} <ArrowRight className="size-4" />
                  </Link>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Steps for companies ───────────────────────── */
export const CompanyStepsSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ title: string; text: string; deliverable: string }[]>('partnersPage.steps.items');
  return (
    <section className="section bg-surface">
      <div className="container-x grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading eyebrow={t('partnersPage.steps.eyebrow')} title={t('partnersPage.steps.title')} subtitle={t('partnersPage.steps.subtitle')} />
        </div>
        <ol className="relative space-y-4">
          <span aria-hidden className="absolute top-4 bottom-4 left-[1.45rem] w-0.5 bg-gradient-to-b from-brand-500 via-brand-400/40 to-transparent sm:left-[1.7rem]" />
          {items.map((s, i) => (
            <Reveal key={s.title} y={24}>
              <li className="relative flex gap-4 sm:gap-5">
                <span className="relative z-[1] grid size-12 shrink-0 place-items-center rounded-2xl bg-white font-display text-base font-extrabold text-brand-600 shadow-md ring-1 ring-line sm:size-14 sm:text-lg">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0 flex-1 rounded-2xl border border-line bg-white p-5">
                  <h3 className="font-display text-lg font-bold text-navy-900">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
                  <p className="mt-3 inline-flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700">
                    <Check className="mt-px size-3.5 shrink-0" strokeWidth={3} />
                    <span>
                      {t('partnersPage.steps.deliverable')}: {s.deliverable}
                    </span>
                  </p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
};

/* ───────────────────────── Company testimonials ───────────────────────── */
export const CompanyVoices = ({ items }: { items: Testimonial[] }) => {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section className="section pb-0 sm:pb-0 lg:pb-0">
      <div className="container-x">
        <SectionHeading eyebrow={t('partnersPage.testimonials.eyebrow')} title={t('partnersPage.testimonials.title')} />
        <div className="grid-cards md:grid-cols-2">
          {items.map((x, i) => (
            <Reveal key={x.id} delay={(i % 2) * 0.1}>
              <TestimonialCard item={x} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── Closing CTA: "your logo here" ───────────────────────── */
export const PartnersCta = ({ partners }: { partners: Partner[] }) => {
  const { t } = useTranslation();
  const tiles = partners.slice(0, 7);
  return (
    <section className="section">
      <div className="container-x">
        <Reveal>
          <div className="grid items-center gap-8 rounded-3xl bg-gradient-to-br from-brand-600 to-navy-900 p-6 text-white sm:p-10 lg:grid-cols-2 lg:gap-12 lg:rounded-[2rem] lg:p-14">
            <div>
              <h2 className="font-display text-2xl leading-tight font-extrabold text-balance sm:text-4xl">{t('partnersPage.cta.title')}</h2>
              <p className="mt-4 max-w-lg text-white/80">{t('partnersPage.cta.text')}</p>
              <Link to="/cooperation" className="btn-white group mt-7 w-full px-6 py-3.5 sm:w-auto">
                {t('partnersPage.cta.button')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-hidden>
              {tiles.map((p) => (
                <span key={p.id} className="grid h-16 min-w-0 place-items-center rounded-xl bg-white/10 px-2 font-display text-[0.7rem] font-black tracking-tight text-white/70 uppercase sm:text-xs">
                  <span className="max-w-full truncate">{p.name}</span>
                </span>
              ))}
              <span className="grid h-16 place-items-center rounded-xl border-2 border-dashed border-de-gold/80 text-de-gold">
                <Plus className="size-6" />
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
