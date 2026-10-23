import { useDeferredValue, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Baby,
  BadgeCheck,
  BrickWall,
  Building2,
  Bus,
  Calculator,
  Car,
  ChefHat,
  Clock,
  Cog,
  ConciergeBell,
  ExternalLink,
  Flame,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Info,
  Languages,
  Laptop,
  Lightbulb,
  Package,
  Pill,
  School,
  Search,
  Smile,
  Stethoscope,
  Truck,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { DocChecklist } from '@/components/tools/DocChecklist';
import { registerCopy } from '@/i18n';
import { pagesTools } from '@/i18n/pagesTools';
import { useL10n } from '@/lib/l10n';
import { smoothScrollTo } from '@/lib/smoothScroll';
import { usePageTitle } from '@/lib/usePageTitle';
import { findProfession, LINKS, PROFESSIONS, type Profession, type ProfessionIcon } from '@/lib/anerkennung/data';

registerCopy(pagesTools);

const HERO = 'https://images.unsplash.com/photo-1573164713988-8665fc963095?auto=format&fit=crop&w=2000&q=70';

const ICONS: Record<ProfessionIcon, LucideIcon> = {
  heart: HeartPulse,
  stethoscope: Stethoscope,
  tooth: Smile,
  pill: Pill,
  activity: Activity,
  school: School,
  cog: Cog,
  laptop: Laptop,
  zap: Zap,
  wrench: Wrench,
  car: Car,
  flame: Flame,
  truck: Truck,
  bus: Bus,
  chef: ChefHat,
  hotel: ConciergeBell,
  brick: BrickWall,
  package: Package,
  hand: HandHeart,
  calc: Calculator,
  baby: Baby,
};

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ExtLink = ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className={clsx('inline-flex items-center gap-1.5 font-semibold text-brand-600 hover:underline', className)}>
    {children} <ExternalLink className="size-3.5" aria-hidden />
  </a>
);

const RegBadge = ({ regulated }: { regulated: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge', regulated ? 'bg-warning-bg text-warning-fg' : 'bg-success-bg text-success-fg')}>
      {regulated ? t('anerkPage.regulated') : t('anerkPage.notRegulated')}
    </span>
  );
};

/** Five-step guide for one profession (vertical stepper, one step open at a time). */
const Stepper = ({ p }: { p: Profession }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const uid = useId();
  const [active, setActive] = useState(0);
  const titles = t('anerkPage.steps.titles', { returnObjects: true }) as string[];
  const authorities = p.authority.map((a) => t(`anerkPage.authority.${a}`)).join('; ');
  const driving = p.procedure === 'driving';
  const showDeficits = p.procedure === 'licence' || p.procedure === 'approbation' || p.procedure === 'equivalence';

  const body = (i: number): ReactNode => {
    switch (i) {
      case 0:
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <RegBadge regulated={p.regulated} />
              <span className="badge bg-brand-50 text-brand-700">{t(`anerkPage.procedure.${p.procedure}.label`)}</span>
            </div>
            <p>{t(`anerkPage.procedure.${p.procedure}.text`)}</p>
            <p className="text-ink/85">{p.note[locale]}</p>
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <p>{t('anerkPage.steps.s2Text')}</p>
            <DocChecklist key={p.id} profession={p} />
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <p>{t('anerkPage.steps.s3Text')}</p>
            <Link to="/account/translations" className="btn-primary btn-sm">
              <Languages className="size-4" aria-hidden /> {t('anerkPage.steps.s3Link')}
            </Link>
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <p>{driving ? t('anerkPage.steps.s4Driving') : t('anerkPage.steps.s4Text', { authority: authorities })}</p>
            {!driving && <ExtLink href={LINKS.finder}>{t('anerkPage.steps.s4Finder')}</ExtLink>}
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <p>{t(`anerkPage.steps.s5.${p.procedure}`)}</p>
            {showDeficits && (
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="font-display text-sm font-bold text-ink">{t('anerkPage.steps.deficits.title')}</p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-semibold text-ink">{t('anerkPage.steps.deficits.adaptation')}</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted">{t('anerkPage.steps.deficits.adaptationText')}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-semibold text-ink">{t('anerkPage.steps.deficits.exam')}</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted">{t('anerkPage.steps.deficits.examText')}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <ol aria-label={t('anerkPage.steps.aria')} className="relative space-y-3">
      {titles.map((title, i) => {
        const open = active === i;
        const done = i < active;
        return (
          <li key={title} className={clsx('rounded-2xl border bg-card transition-colors', open ? 'border-brand-400 shadow-lg shadow-brand-600/10' : 'border-line')}>
            <h3>
              <button
                type="button"
                id={`${uid}-h${i}`}
                aria-expanded={open}
                aria-controls={`${uid}-p${i}`}
                onClick={() => setActive(i)}
                className="flex w-full items-center gap-4 px-4 py-3.5 text-left sm:px-5 sm:py-4"
              >
                <span
                  className={clsx(
                    'grid size-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold',
                    open ? 'bg-brand-600 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-brand-50 text-brand-700',
                  )}
                  aria-hidden
                >
                  {done ? <BadgeCheck className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold tracking-wider text-muted uppercase">{t('anerkPage.steps.step', { n: i + 1 })}</span>
                  <span className="block font-display font-bold text-ink">{title}</span>
                </span>
              </button>
            </h3>
            {open && (
              <div id={`${uid}-p${i}`} role="region" aria-labelledby={`${uid}-h${i}`} className="px-4 pb-5 text-sm leading-relaxed text-muted sm:px-5 sm:pl-[4.25rem]">
                {body(i)}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  {i > 0 && (
                    <button type="button" className="btn-sm btn rounded-lg border border-line text-ink hover:border-brand-400" onClick={() => setActive(i - 1)}>
                      <ArrowLeft className="size-3.5" aria-hidden /> {t('anerkPage.steps.back')}
                    </button>
                  )}
                  {i < titles.length - 1 && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => setActive(i + 1)}>
                      {t('anerkPage.steps.next')} <ArrowRight className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};


const Fact = ({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) => (
  <div className="flex gap-3">
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
      <Icon className="size-4" aria-hidden />
    </span>
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-muted">{label}</dt>
      <dd className="text-sm font-medium break-words text-ink">{children}</dd>
    </div>
  </div>
);

export default function AnerkennungGuide() {
  const { t } = useTranslation();
  usePageTitle(t('anerkPage.heroTitle'));
  const { locale } = useL10n();
  const searchId = useId();
  const [params, setParams] = useSearchParams();
  const selected = findProfession(params.get('p'));
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const guideRef = useRef<HTMLElement>(null);

  const list = useMemo(() => {
    const q = norm(deferred.trim());
    if (!q) return PROFESSIONS;
    return PROFESSIONS.filter((p) => [p.german, p.name.az, p.name.de, p.name.en, p.name.ru].some((s) => norm(s).includes(q)));
  }, [deferred]);

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('p', id);
    setParams(next, { replace: true, preventScrollReset: true });
    requestAnimationFrame(() => {
      if (guideRef.current) smoothScrollTo(guideRef.current, { offset: -96 });
    });
  };

  const faq = t('anerkPage.faq.items', { returnObjects: true }) as { q: string; a: string }[];

  return (
    <>
      <PageHero title={t('anerkPage.heroTitle')} subtitle={t('anerkPage.heroSubtitle')} image={HERO} />

      {/* Picker */}
      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow={t('anerkPage.picker.eyebrow')} title={t('anerkPage.picker.title')} subtitle={t('anerkPage.picker.subtitle')} />
          <div className="relative mb-6 max-w-xl">
            <label htmlFor={searchId} className="sr-only">
              {t('anerkPage.picker.searchLabel')}
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input id={searchId} type="search" className="input pl-10" placeholder={t('anerkPage.picker.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {list.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              {t('anerkPage.picker.empty')} <ExtLink href={LINKS.finder}>Anerkennungs-Finder</ExtLink>
            </p>
          ) : (
            <ul className="grid-cards grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((p) => {
                const Icon = ICONS[p.icon];
                const isSel = selected?.id === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choose(p.id)}
                      aria-pressed={isSel}
                      className={clsx(
                        'flex h-full w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none',
                        isSel ? 'border-brand-500 ring-1 ring-brand-500' : 'border-line hover:border-brand-300',
                      )}
                    >
                      <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', isSel ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600')}>
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-sm font-bold text-ink">{p.name[locale]}</span>
                        <span className="block truncate text-xs text-muted">{p.german}</span>
                        <span className="mt-2 block">
                          <RegBadge regulated={p.regulated} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Guide */}
      <section ref={guideRef} className="section bg-surface" aria-labelledby="anerk-guide-title">
        <div className="container-x">
          {!selected ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-line bg-card p-8 text-center">
              <GraduationCap className="mx-auto size-8 text-brand-600" aria-hidden />
              <h2 id="anerk-guide-title" className="mt-3 font-display text-lg font-bold text-ink">
                {t('anerkPage.guide.eyebrow')}
              </h2>
              <p className="mt-2 text-sm text-muted">{t('anerkPage.guide.placeholder')}</p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-10">
              <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
                <div className="card card-pad">
                  <p className="eyebrow">{t('anerkPage.guide.eyebrow')}</p>
                  <div className="mt-3 flex items-start gap-3">
                    {(() => {
                      const Icon = ICONS[selected.icon];
                      return (
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                          <Icon className="size-6" aria-hidden />
                        </span>
                      );
                    })()}
                    <div className="min-w-0">
                      <h2 id="anerk-guide-title" className="font-display text-xl font-extrabold text-ink">
                        {selected.name[locale]}
                      </h2>
                      <p className="text-xs text-muted">{selected.german}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <RegBadge regulated={selected.regulated} />
                  </div>
                  <dl className="mt-5 space-y-4">
                    <Fact icon={Building2} label={t('anerkPage.guide.facts.authority')}>
                      <ul className="space-y-1">
                        {selected.authority.map((a) => (
                          <li key={a}>{t(`anerkPage.authority.${a}`)}</li>
                        ))}
                      </ul>
                    </Fact>
                    <Fact icon={Clock} label={t('anerkPage.guide.facts.duration')}>
                      {t(`anerkPage.duration.${selected.duration}`)}
                    </Fact>
                    <Fact icon={Wallet} label={t('anerkPage.guide.facts.fee')}>
                      {t(`anerkPage.fee.${selected.fee}`)}
                    </Fact>
                    <Fact icon={Languages} label={t('anerkPage.guide.facts.language')}>
                      {selected.language ? t('anerkPage.guide.languageMin', { level: selected.language }) : t('anerkPage.guide.noLanguage')}
                    </Fact>
                  </dl>
                  <p className="mt-4 flex gap-2 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
                    <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('anerkPage.feeNote')}
                  </p>
                </div>

                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                  <p className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                    <Lightbulb className="size-4 text-brand-600" aria-hidden /> {t('anerkPage.tip.title')}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t('anerkPage.tip.text')}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                    <Link to="/account/translations" className="font-semibold text-brand-600 hover:underline">
                      {t('anerkPage.tip.translations')}
                    </Link>
                    <Link to="/booking" className="font-semibold text-brand-600 hover:underline">
                      {t('anerkPage.tip.booking')}
                    </Link>
                  </div>
                </div>
              </div>

              <div>
                <Stepper key={selected.id} p={selected} />
                <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('anerkPage.disclaimer')}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Official sources */}
      <section className="section-sm">
        <div className="container-x">
          <h2 className="mb-5 font-display text-xl font-bold text-ink">{t('anerkPage.links.title')}</h2>
          <div className="grid-cards sm:grid-cols-2">
            {[
              { href: LINKS.finder, title: t('anerkPage.links.finder'), text: t('anerkPage.links.finderText') },
              { href: LINKS.anabin, title: t('anerkPage.links.anabin'), text: t('anerkPage.links.anabinText') },
            ].map((l) => (
              <Reveal key={l.href}>
                <div className="card card-pad h-full">
                  <ExtLink href={l.href} className="font-display text-base">
                    {l.title}
                  </ExtLink>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{l.text}</p>
                  <p className="mt-2 truncate text-xs text-muted/80">{l.href.replace(/^https:\/\//, '').replace(/\/$/, '')}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section bg-surface">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading eyebrow={t('anerkPage.faq.eyebrow')} title={t('anerkPage.faq.title')} />
          </div>
          <Accordion items={faq} />
        </div>
      </section>

      <div className="pt-16 sm:pt-20 lg:pt-28">
        <PageCta
          icon={<GraduationCap className="size-7" />}
          title={t('anerkPage.cta.title')}
          text={t('anerkPage.cta.text')}
          primary={{ to: '/booking', label: t('anerkPage.cta.primary') }}
          secondary={{ to: '/account/translations', label: t('anerkPage.cta.secondary') }}
        />
      </div>
    </>
  );
}
