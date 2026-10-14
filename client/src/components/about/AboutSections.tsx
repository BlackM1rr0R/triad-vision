import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUpRight, Building2, Check, CircleDashed, Clock, Compass, FileCheck2, Globe, Handshake, House, Laptop, Minus, Scale, ShieldCheck, Sparkles, Stamp, Target, UserRound, UserSearch, X } from 'lucide-react';
import clsx from 'clsx';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Flag, RouteFlags, type FlagCode } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { LogoMark } from '@/components/ui/Logo';
import { sized, srcSet } from '@/lib/img';
import { useL10n } from '@/lib/l10n';
import type { Office, VisaCategory } from '@/lib/types';
import { Accordion, useCopy } from './shared';
import { OfficeCard, PresenceMap } from './AboutVisuals';

type TT = { title: string; text: string };

const IMG_MISSION = 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=70';

/* ───────────────────────── Mission & vision ───────────────────────── */
export const MissionSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const pillars = copy<TT[]>('aboutPage.mission.pillars');
  return (
    <section className="section">
      <div className="container-x">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow={t('aboutPage.mission.eyebrow')} title={t('aboutPage.mission.title')} />
            <Reveal>
              <p className="-mt-2 text-lg leading-relaxed text-navy-900/80 sm:text-xl">{t('aboutPage.mission.lead')}</p>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Reveal delay={0.05}>
                <div className="h-full rounded-2xl bg-navy-900 p-6 text-white">
                  <Target className="size-7 text-brand-400" />
                  <h3 className="mt-4 font-display text-lg font-bold">{t('aboutPage.mission.missionTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{t('aboutPage.mission.missionText')}</p>
                </div>
              </Reveal>
              <Reveal delay={0.12}>
                <div className="h-full rounded-2xl border border-brand-100 bg-brand-50 p-6">
                  <Compass className="size-7 text-brand-600" />
                  <h3 className="mt-4 font-display text-lg font-bold text-navy-900">{t('aboutPage.mission.visionTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t('aboutPage.mission.visionText')}</p>
                </div>
              </Reveal>
            </div>
          </div>
          <Reveal className="relative">
            <img
              src={sized(IMG_MISSION, 900)}
              srcSet={srcSet(IMG_MISSION, [600, 900, 1200])}
              sizes="(min-width:1024px) 520px, 92vw"
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] w-full rounded-3xl object-cover shadow-2xl sm:aspect-[4/3] lg:aspect-[4/5]"
            />
            <div className="absolute -bottom-6 left-4 right-4 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-xl sm:left-auto sm:right-6 sm:w-80">
              <RouteFlags size="lg" />
              <p className="text-sm font-semibold text-navy-900">{t('aboutPage.presence.eyebrow')}</p>
            </div>
          </Reveal>
        </div>

        <Stagger className="mt-16 grid gap-4 sm:gap-5 md:grid-cols-3 lg:mt-20 lg:gap-6">
          {pillars.map((p, i) => (
            <StaggerItem key={p.title}>
              <div className="relative h-full border-t-2 border-navy-900 pt-6">
                <span className="font-display text-sm font-extrabold text-brand-600">0{i + 1}</span>
                <h3 className="mt-2 font-display text-xl font-bold text-navy-900">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted sm:text-[0.95rem]">{p.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Comparison ───────────────────────── */
// 2 = fully covered, 1 = partly, 0 = not covered / your job. Order matches aboutPage.compare.rows.
const LEVELS: [number, number, number][] = [
  [2, 0, 1],
  [2, 0, 1],
  [2, 0, 0],
  [2, 0, 1],
  [2, 0, 1],
  [2, 0, 0],
  [2, 1, 0],
];

const LevelMark = ({ level, label }: { level: number; label: string }) => (
  <span
    title={label}
    className={clsx(
      'grid size-6 shrink-0 place-items-center rounded-full',
      level === 2 ? 'bg-success text-white' : level === 1 ? 'bg-amber-100 text-warning' : 'bg-slate-100 text-slate-400',
    )}
  >
    {level === 2 ? <Check className="size-3.5" strokeWidth={3} /> : level === 1 ? <Minus className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
    <span className="sr-only">{label}</span>
  </span>
);

export const CompareSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const cols = copy<string[]>('aboutPage.compare.cols');
  const rows = copy<{ label: string; values: string[] }[]>('aboutPage.compare.rows');
  const legend = copy<{ full: string; partial: string; none: string }>('aboutPage.compare.legend');
  const lvlLabel = (l: number) => (l === 2 ? legend.full : l === 1 ? legend.partial : legend.none);

  return (
    <section className="section bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.compare.eyebrow')} title={t('aboutPage.compare.title')} subtitle={t('aboutPage.compare.subtitle')} />

        {/* desktop table */}
        <Reveal className="hidden lg:block">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_8px_30px_-12px_rgba(11,31,68,0.18)]">
            <table className="w-full table-fixed text-left text-sm">
              <thead>
                <tr>
                  <th className="w-[22%] p-5" />
                  {cols.map((c, i) => (
                    <th key={c} scope="col" className={clsx('p-5 font-display text-base font-extrabold', i === 0 ? 'bg-navy-900 text-white' : 'text-navy-900')}>
                      {i === 0 ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="size-4 text-brand-400" /> {c}
                        </span>
                      ) : (
                        c
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.label} className="border-t border-line">
                    <th scope="row" className="p-5 align-top font-display font-bold text-navy-900">
                      {r.label}
                    </th>
                    {r.values.map((v, ci) => (
                      <td key={ci} className={clsx('p-5 align-top', ci === 0 ? 'bg-navy-900 text-white' : 'text-muted')}>
                        <span className="flex items-start gap-3">
                          <LevelMark level={LEVELS[ri]?.[ci] ?? 0} label={lvlLabel(LEVELS[ri]?.[ci] ?? 0)} />
                          <span className={ci === 0 ? 'font-medium' : ''}>{v}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        {/* mobile: one card per row */}
        <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
          {rows.map((r, ri) => (
            <Reveal key={r.label} y={20}>
              <div className="card p-4">
                <p className="font-display font-bold text-navy-900">{r.label}</p>
                <ul className="mt-3 space-y-2.5">
                  {r.values.map((v, ci) => (
                    <li key={ci} className={clsx('flex items-start gap-3 rounded-xl p-2.5 text-sm', ci === 0 ? 'bg-navy-900 text-white' : 'text-muted')}>
                      <LevelMark level={LEVELS[ri]?.[ci] ?? 0} label={lvlLabel(LEVELS[ri]?.[ci] ?? 0)} />
                      <span>
                        <span className={clsx('block text-[0.7rem] font-bold tracking-wider uppercase', ci === 0 ? 'text-brand-400' : 'text-navy-900/60')}>{cols[ci]}</span>
                        {v}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
          {[2, 1, 0].map((l) => (
            <span key={l} className="inline-flex items-center gap-2">
              <LevelMark level={l} label={lvlLabel(l)} /> {lvlLabel(l)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── Placement journey (swimlanes) ───────────────────────── */
// Indicative weeks per stage [min, max]; null = ongoing. Stage 3 (recognition) only when required.
const STAGE_WEEKS: ([number, number] | null)[] = [[1, 2], [2, 4], [2, 12], [1, 4], [3, 8], [1, 2], null];
const OPTIONAL_STAGE = 2;
const SCALE = 12;

export const JourneySection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const stages = copy<{ title: string; candidate: string; company: string; we: string }[]>('aboutPage.journey.stages');
  const totals = STAGE_WEEKS.reduce<[number, number]>((acc, w, i) => (w ? [acc[0] + (i === OPTIONAL_STAGE ? 0 : w[0]), acc[1] + w[1]] : acc), [0, 0]);
  const lanes = [
    { key: 'candidate', icon: UserRound, label: t('aboutPage.journey.candidate') },
    { key: 'company', icon: Building2, label: t('aboutPage.journey.company') },
    { key: 'we', icon: Handshake, label: t('aboutPage.journey.we') },
  ] as const;

  return (
    <section className="section relative isolate overflow-hidden bg-navy-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(47,123,255,0.22),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(47,123,255,0.15),transparent_40%)]" />
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.journey.eyebrow')} title={t('aboutPage.journey.title')} subtitle={t('aboutPage.journey.subtitle')} light />

        <div className="hidden grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-4 border-b border-white/10 pb-3 text-xs font-bold tracking-widest text-white/50 uppercase lg:grid">
          <span />
          {lanes.map((l) => (
            <span key={l.key} className="flex items-center gap-2">
              <l.icon className="size-4 text-brand-400" /> {l.label}
            </span>
          ))}
        </div>

        <ol>
          {stages.map((s, i) => {
            const w = STAGE_WEEKS[i] ?? null;
            return (
              <Reveal key={s.title} y={24} delay={Math.min(i, 3) * 0.05}>
                <li className="grid gap-4 border-b border-white/10 py-6 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] lg:py-7">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-600 font-display text-sm font-bold">{i + 1}</span>
                      <h3 className="font-display text-lg leading-tight font-bold">{s.title}</h3>
                    </div>
                    <div className="mt-3 flex items-center gap-2 pl-12 text-xs text-white/70">
                      <Clock className="size-3.5 text-brand-400" />
                      {w ? `${w[0]}–${w[1]} ${t('aboutPage.journey.weeks')}` : t('aboutPage.journey.ongoing')}
                      {i === OPTIONAL_STAGE && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-semibold">{t('aboutPage.journey.optional')}</span>}
                    </div>
                    {w && (
                      <div className="mt-2 ml-12 h-1.5 rounded-full bg-white/10" aria-hidden>
                        <div className="relative h-full" style={{ marginLeft: `${(w[0] / SCALE) * 100}%`, width: `${((w[1] - w[0]) / SCALE) * 100}%` }}>
                          <span className="absolute inset-0 rounded-full bg-gradient-to-r from-brand-500 to-de-gold" />
                        </div>
                      </div>
                    )}
                  </div>
                  {lanes.map((l) => (
                    <div key={l.key} className={clsx('rounded-xl p-3.5 text-sm leading-relaxed lg:bg-transparent lg:p-0', l.key === 'we' ? 'bg-brand-600/15 text-white' : 'bg-white/[0.04] text-white/75')}>
                      <span className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-bold tracking-wider text-brand-400 uppercase lg:hidden">
                        <l.icon className="size-3.5" /> {l.label}
                      </span>
                      {s[l.key]}
                    </div>
                  ))}
                </li>
              </Reveal>
            );
          })}
        </ol>

        <Reveal>
          <div className="mt-8 flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/70">{t('aboutPage.journey.total')}</p>
            <p className="font-display text-2xl font-extrabold">
              {totals[0]}–{totals[1]} {t('aboutPage.journey.weeks')}
            </p>
            <p className="text-xs text-white/50">{t('aboutPage.journey.indicative')}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

/* ───────────────────────── Team / departments ───────────────────────── */
const TEAM_ICONS = [UserSearch, FileCheck2, Scale, Handshake, House, Laptop];
const placeFlags = (place: string): FlagCode[] => {
  const p = place.toLowerCase();
  const out: FlagCode[] = [];
  if (/bak|баку/.test(p)) out.push('az');
  if (/alman|deutsch|germ|герман/.test(p)) out.push('de');
  return out;
};

export const TeamSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ title: string; place: string; text: string; tasks: string[] }[]>('aboutPage.team.items');
  return (
    <section className="section bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.team.eyebrow')} title={t('aboutPage.team.title')} subtitle={t('aboutPage.team.subtitle')} />
        <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-3">
          {items.map((d, i) => {
            const I = TEAM_ICONS[i] ?? UserSearch;
            const flags = placeFlags(d.place);
            return (
              <StaggerItem key={d.title}>
                <div className="card card-pad group flex h-full flex-col transition duration-300 hover:-translate-y-1 hover:border-brand-200">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-12 place-items-center rounded-xl bg-navy-900 text-white transition group-hover:bg-brand-600">
                      <I className="size-6" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-navy-900">
                      {flags.length ? flags.map((f) => <Flag key={f} code={f} className="w-4" />) : <Globe className="size-3.5 text-brand-600" />}
                      {d.place}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy-900">{d.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{d.text}</p>
                  <ul className="mt-5 flex flex-wrap gap-1.5">
                    {d.tasks.map((x) => (
                      <li key={x} className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Two-country presence ───────────────────────── */
export const PresenceSection = ({ offices }: { offices: Office[] }) => {
  const { t } = useTranslation();
  const copy = useCopy();
  const roles = copy<string[]>('aboutPage.presence.roles');
  return (
    <section className="section bg-navy-950 text-white">
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.presence.eyebrow')} title={t('aboutPage.presence.title')} subtitle={t('aboutPage.presence.subtitle')} light />
        <div className="grid items-start gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
          <Reveal>
            <PresenceMap offices={offices} />
          </Reveal>
          <div className="grid gap-4">
            {offices.slice(0, 2).map((o, i) => (
              <Reveal key={o.address} delay={i * 0.1}>
                <OfficeCard office={o} index={i} role={roles[i] ?? ''} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── Compliance & legal bases ───────────────────────── */
const COMPLIANCE_ICONS = [ShieldCheck, Stamp, FileCheck2, Scale];

export const ComplianceSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<TT[]>('aboutPage.compliance.items');
  const laws = copy<{ code: string; title: string; text: string }[]>('aboutPage.compliance.laws');
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.compliance.eyebrow')} title={t('aboutPage.compliance.title')} subtitle={t('aboutPage.compliance.subtitle')} />
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <Stagger className="grid gap-4 sm:grid-cols-2">
            {items.map((it, i) => {
              const I = COMPLIANCE_ICONS[i] ?? ShieldCheck;
              return (
                <StaggerItem key={it.title}>
                  <div className="h-full rounded-2xl border border-line p-5">
                    <I className="size-7 text-brand-600" />
                    <h3 className="mt-4 font-display font-bold text-navy-900">{it.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{it.text}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
          <Reveal>
            <div className="h-full rounded-3xl bg-surface p-5 sm:p-7">
              <h3 className="font-display text-lg font-extrabold text-navy-900">{t('aboutPage.compliance.lawTitle')}</h3>
              <dl className="mt-5 divide-y divide-line">
                {laws.map((l) => (
                  <div key={l.code} className="flex gap-4 py-3.5">
                    <dt className="w-16 shrink-0">
                      <span className="inline-block rounded-md bg-navy-900 px-2 py-1 font-mono text-xs font-bold text-white">{l.code}</span>
                    </dt>
                    <dd className="min-w-0">
                      <span className="block text-sm font-bold text-navy-900">{l.title}</span>
                      <span className="block text-sm text-muted">{l.text}</span>
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 flex items-start gap-2 text-xs text-muted">
                <CircleDashed className="mt-0.5 size-3.5 shrink-0" /> {t('aboutPage.compliance.lawNote')}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

/* ───────────────────────── Languages ───────────────────────── */
const LEVELS_DE = ['A1', 'A2', 'B1', 'B2'];

export const LanguagesSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  const items = copy<{ code: FlagCode; name: string; text: string }[]>('aboutPage.languages.items');
  return (
    <section className="section bg-surface">
      <div className="container-x grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <SectionHeading eyebrow={t('aboutPage.languages.eyebrow')} title={t('aboutPage.languages.title')} subtitle={t('aboutPage.languages.subtitle')} />
          <Reveal>
            <div className="card card-pad">
              <h3 className="font-display font-bold text-navy-900">{t('aboutPage.languages.germanTitle')}</h3>
              <p className="mt-1 text-sm text-muted">{t('aboutPage.languages.germanText')}</p>
              <ol className="mt-5 grid grid-cols-4 items-end gap-2" aria-label={t('aboutPage.languages.germanTitle')}>
                {LEVELS_DE.map((l, i) => (
                  <li key={l} className="flex flex-col items-center gap-2">
                    <span className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400" style={{ height: `${28 + i * 22}px` }} />
                    <span className="font-display text-sm font-bold text-navy-900">{l}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
        <Stagger className="grid content-start gap-4 sm:grid-cols-2">
          {items.map((l) => (
            <StaggerItem key={l.code}>
              <div className="card card-pad h-full">
                <Flag code={l.code} className="w-12" />
                <h3 className="mt-4 font-display text-lg font-bold text-navy-900">{l.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{l.text}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Sectors (links to visa categories) ───────────────────────── */
export const SectorsSection = ({ visas }: { visas: VisaCategory[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  if (!visas.length) return null;
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('aboutPage.sectors.eyebrow')} title={t('aboutPage.sectors.title')} subtitle={t('aboutPage.sectors.subtitle')} />
        <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visas.map((v) => (
            <StaggerItem key={v.id}>
              <Link to={`/visas/${v.slug}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 transition duration-300 hover:border-brand-400 hover:shadow-lg">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <Icon name={v.icon} className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display font-bold text-navy-900">{tr(v.title)}</span>
                  <span className="text-xs font-semibold text-muted">{v.visaLabel}</span>
                </span>
                <ArrowUpRight className="size-5 shrink-0 text-navy-900/30 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/* ───────────────────────── Company FAQ ───────────────────────── */
export const AboutFaqSection = () => {
  const { t } = useTranslation();
  const copy = useCopy();
  return (
    <section className="section bg-surface">
      <div className="container-x grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading eyebrow={t('aboutPage.faq.eyebrow')} title={t('aboutPage.faq.title')} />
          <Reveal className="hidden lg:block">
            <LogoMark className="h-24 w-28 text-navy-900 opacity-90" />
          </Reveal>
        </div>
        <Reveal>
          <Accordion items={copy<{ q: string; a: string }[]>('aboutPage.faq.items')} />
        </Reveal>
      </div>
    </section>
  );
};

/* ───────────────────────── Closing CTA: two doors ───────────────────────── */
export const AboutCta = () => {
  const { t } = useTranslation();
  return (
    <section className="section">
      <div className="container-x">
        <Reveal>
          <div className="overflow-hidden rounded-3xl border border-line lg:rounded-[2rem]">
            <div className="bg-white px-6 py-8 text-center sm:px-10 sm:py-10">
              <h2 className="h-section text-navy-900">{t('aboutPage.cta.title')}</h2>
              <p className="mx-auto mt-3 max-w-xl text-muted">{t('aboutPage.cta.text')}</p>
            </div>
            <div className="grid sm:grid-cols-2">
              <Link to="/register" className="group flex items-center justify-between gap-4 bg-brand-600 px-6 py-7 text-white transition hover:bg-brand-700 sm:px-10 sm:py-9">
                <span className="flex items-center gap-4">
                  <UserRound className="size-8 shrink-0 text-white/80" />
                  <span className="font-display text-lg font-bold sm:text-xl">{t('aboutPage.cta.candidate')}</span>
                </span>
                <ArrowRight className="size-6 shrink-0 transition group-hover:translate-x-1" />
              </Link>
              <Link to="/cooperation" className="group flex items-center justify-between gap-4 bg-navy-900 px-6 py-7 text-white transition hover:bg-navy-800 sm:px-10 sm:py-9">
                <span className="flex items-center gap-4">
                  <Building2 className="size-8 shrink-0 text-white/80" />
                  <span className="font-display text-lg font-bold sm:text-xl">{t('aboutPage.cta.company')}</span>
                </span>
                <ArrowRight className="size-6 shrink-0 transition group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
