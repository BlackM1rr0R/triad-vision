import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, CalendarClock, CheckCircle2, ClipboardCheck, Compass, Euro, FileText, Info, Languages, MessageCircle, Phone, Users } from 'lucide-react';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { buttonClass } from '@/components/ui/Button';
import { ServiceCard, VisaCard } from '@/components/cards';
import { Icon } from '@/components/ui/Icon';
import { Accordion } from '@/components/visa/Accordion';
import { Gantt, SalaryScale } from '@/components/visa/Charts';
import { CheckList, PrintableChecklist } from '@/components/visa/Checklist';
import { FamilyBadge } from '@/components/visa/ComparisonTable';
import { PageCta } from '@/components/visa/PageCta';
import { MIN_WAGE_MONTHLY, hasProcessing, hasSalary, isTrainee, servicesForVisa, useEuro } from '@/components/visa/utils';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { useSiteContent } from '@/lib/content';
import type { VisaCategory } from '@/lib/types';
import NotFound from './NotFound';
import { sized } from '@/lib/img';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';
import { usePageTitle } from '@/lib/usePageTitle';
import { CalculatorTeaser } from '@/components/growth/CalculatorTeaser';
import { CostCalculatorTeaser } from '@/components/marketing/CostCalculatorTeaser';
import { BudgetTeaser } from '@/components/budget/BudgetTeaser';

registerCopy(pagesVisa);

const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

const Block = ({ id, eyebrow, title, subtitle, children }: { id?: string; eyebrow: string; title: string; subtitle?: string; children: ReactNode }) => (
  <section id={id} className="scroll-mt-28 border-t border-line pt-10 sm:pt-12">
    <Reveal y={24}>
      <span className="eyebrow">{eyebrow}</span>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-[1.75rem]">{title}</h2>
      {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-[0.95rem]">{subtitle}</p>}
    </Reveal>
    <div className="mt-6">{children}</div>
  </section>
);

export default function VisaDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  const { tr, trList } = useL10n();
  const euro = useEuro();
  const { data: content } = useSiteContent();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['visa', slug],
    queryFn: async () => (await api.get<{ visa: VisaCategory }>(`/public/visa/${slug}`)).data.visa,
    // The site content already holds every published visa, so most visits render instantly.
    placeholderData: () => content?.visaCategories.find((v) => v.slug === slug),
  });
  usePageTitle(data ? tr(data.title) : t('nav.visas'));

  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;

  const others = content?.visaCategories.filter((v) => v.id !== data.id).slice(0, 3) ?? [];
  const services = servicesForVisa(data.slug, content?.services ?? []).slice(0, 4);
  const allServices = content?.services ?? [];
  const contact = content?.settings.contact;
  const requirements = trList(data.requirements);
  const documents = trList(data.documents);
  const faq = (data.faq ?? []).map((f) => ({ q: tr(f.q), a: tr(f.a) })).filter((f) => f.q && f.a);
  const trainee = isTrainee(data);
  const na = t('visaDetail.facts.na');

  const facts: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    hint: string;
  }[] = [
    {
      icon: <Languages className="size-5" />,
      label: t('visaDetail.facts.level'),
      value: data.germanLevel || na,
      hint: t('visaDetail.facts.levelHint'),
    },
    {
      icon: <Euro className="size-5" />,
      label: t('visaDetail.facts.salary'),
      value: hasSalary(data) ? euro.range(data.salaryMin, data.salaryMax) : na,
      hint: t('visaDetail.facts.salaryHint'),
    },
    {
      icon: <CalendarClock className="size-5" />,
      label: t('visaDetail.facts.processing'),
      value: hasProcessing(data)
        ? t('visaDetail.facts.weeks', {
            min: data.processingMin,
            max: data.processingMax,
          })
        : na,
      hint: t('visaDetail.facts.processingHint'),
    },
    {
      icon: <Users className="size-5" />,
      label: t('visaDetail.facts.family'),
      value: <FamilyBadge value={data.familyReunion} className="px-2 py-1 text-sm" />,
      hint: t('visaDetail.facts.familyHint'),
    },
  ];

  const phase = (k: 'consult' | 'contract' | 'visa' | 'arrival', min: number, max: number) => ({
    key: k,
    title: t(`visaDetail.timeline.phases.${k}.title`),
    text: t(`visaDetail.timeline.phases.${k}.text`),
    min,
    max,
  });
  const gantt = hasProcessing(data) ? [phase('consult', 1, 3), phase('contract', 1, 4), phase('visa', data.processingMin, data.processingMax), phase('arrival', 1, 2)] : null;
  const totalMin = gantt?.reduce((s, p) => s + p.min, 0) ?? 0;
  const totalMax = gantt?.reduce((s, p) => s + p.max, 0) ?? 0;

  return (
    <>
      <PageHero title={tr(data.title)} subtitle={tr(data.summary)} image={data.image.replace('w=1200', 'w=2000')} crumb={{ to: '/visas', label: t('nav.visas') }} morph={{ kind: 'visa', id: data.slug }}>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)]">
            <Icon name={data.icon} className="size-4" /> {data.visaLabel}
          </span>
          {data.germanLevel && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)]">
              <Languages className="size-4 text-muted" /> {data.germanLevel}
            </span>
          )}
        </div>
      </PageHero>

      {/* Key facts */}
      <div className="pt-8 sm:pt-10">
        <div className="container-x">
          <Stagger className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            {facts.map((f, i) => (
              <StaggerItem key={f.label} className="h-full">
                <div className="card flex h-full flex-col rounded-3xl p-4 sm:p-5">
                  <span className={`grid size-11 place-items-center rounded-xl ${CHIPS[i % CHIPS.length]}`}>{f.icon}</span>
                  <p className="mt-3 text-xs font-semibold tracking-wide text-muted uppercase">{f.label}</p>
                  <div className="mt-1 font-display text-base leading-snug font-semibold text-ink tabular-nums sm:text-lg">{f.value}</div>
                  <p className="mt-auto pt-1 text-xs text-muted">{f.hint}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      <section className="section-sm">
        <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
          <div className="min-w-0 space-y-10 sm:space-y-12">
            {/* Overview */}
            <div>
              <Reveal y={24}>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.01em] text-ink sm:text-[1.75rem]">{t('visaDetail.overview')}</h2>
                <div className="prose-tv mt-4 max-w-[70ch] text-base sm:text-lg">
                  {tr(data.body)
                    .split(/\n{2,}/)
                    .map((p) => (
                      <p key={p.slice(0, 24)}>{p}</p>
                    ))}
                </div>
              </Reveal>
            </div>

            <Block eyebrow={t('visaDetail.requirements.eyebrow')} title={t('visaDetail.requirements.title')} subtitle={t('visaDetail.requirements.subtitle')}>
              {requirements.length ? <CheckList items={requirements} columns={2} /> : <p className="text-sm text-muted">{t('visaDetail.empty')}</p>}
            </Block>

            <Block id="documents" eyebrow={t('visaDetail.documents.eyebrow')} title={t('visaDetail.documents.title')} subtitle={t('visaDetail.documents.subtitle')}>
              {documents.length ? (
                <PrintableChecklist
                  items={documents}
                  heading={`${t('visaDetail.documents.printHeading')}: ${tr(data.title)} (${data.visaLabel})`}
                  subheading={tr(data.summary)}
                  note={t('visaDetail.documents.printNote')}
                  printLabel={t('visaDetail.documents.print')}
                />
              ) : (
                <p className="text-sm text-muted">{t('visaDetail.empty')}</p>
              )}
            </Block>

            {gantt && (
              <Block eyebrow={t('visaDetail.timeline.eyebrow')} title={t('visaDetail.timeline.title')} subtitle={t('visaDetail.timeline.subtitle')}>
                <div className="card card-pad">
                  <Gantt
                    phases={gantt}
                    axisLabel={t('visaDetail.timeline.axis')}
                    weeksText={(a, b) => t('visaDetail.timeline.weeksShort', { min: a, max: b })}
                    ariaLabel={t('visaDetail.timeline.aria')}
                  />
                  <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-sm">
                    <strong className="font-semibold text-ink">
                      {t('visaDetail.timeline.total', {
                        min: totalMin,
                        max: totalMax,
                      })}
                    </strong>
                    <span className="text-xs text-muted">{t('visasPage.indicative')}</span>
                  </p>
                </div>
              </Block>
            )}

            {hasSalary(data) && (
              <Block eyebrow={t('visaDetail.salary.eyebrow')} title={t('visaDetail.salary.title')} subtitle={t('visaDetail.salary.subtitle')}>
                <div className="card card-pad">
                  <p className="mb-6 font-display text-2xl font-semibold text-ink tabular-nums sm:text-3xl">
                    {euro.range(data.salaryMin, data.salaryMax)}
                    <span className="ml-2 text-sm font-semibold text-muted">{t('visaDetail.facts.salaryHint')}</span>
                  </p>
                  <SalaryScale
                    min={data.salaryMin}
                    max={data.salaryMax}
                    format={euro.fmt}
                    rangeLabel={t('visaDetail.salary.range')}
                    reference={
                      trainee
                        ? undefined
                        : {
                            value: MIN_WAGE_MONTHLY,
                            label: t('visaDetail.salary.minWage'),
                          }
                    }
                    ariaLabel={t('visaDetail.salary.aria', {
                      min: euro.fmt(data.salaryMin),
                      max: euro.fmt(data.salaryMax),
                      ref: euro.fmt(MIN_WAGE_MONTHLY),
                    })}
                  />
                  <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
                    {trainee && <p className="font-semibold text-ink">{t('visaDetail.salary.trainee')}</p>}
                    <p className="flex items-start gap-1.5">
                      <Info className="mt-px size-3.5 shrink-0" /> {t('visasPage.indicative')} {t('visaDetail.salary.net')}
                    </p>
                  </div>
                </div>
              </Block>
            )}

            {faq.length > 0 && (
              <Block eyebrow={t('visaDetail.faq.eyebrow')} title={t('visaDetail.faq.title')}>
                <Accordion items={faq} />
              </Block>
            )}
          </div>

          {/* Sticky action card */}
          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <Reveal y={24}>
              <div className="card overflow-hidden">
                <div className="relative h-40">
                  <img src={sized(data.image, 760)} alt="" loading="lazy" decoding="async" width={760} height={320} className="size-full object-cover" />
                  <span className="absolute bottom-3 left-4 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-semibold text-ink shadow-[var(--tv-shadow-card)]">{data.visaLabel}</span>
                </div>
                <div className="card-pad">
                  <h3 className="font-display text-lg font-semibold text-ink">{t('visaDetail.side.title')}</h3>
                  <p className="mt-1.5 text-sm text-muted">{t('visaDetail.side.text')}</p>
                  {trList(data.items).length > 0 && (
                    <>
                      <p className="mt-5 type-overline">{t('visaDetail.highlights')}</p>
                      <ul className="mt-2 space-y-2">
                        {trList(data.items).map((it) => (
                          <li key={it} className="flex gap-2.5 text-sm text-ink">
                            <CheckCircle2 className="size-4.5 shrink-0 text-success" aria-hidden /> {it}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="mt-6 grid gap-2">
                    <Link to="/register" className={buttonClass({ size: 'lg', block: true })}>
                      {t('visaDetail.side.apply')} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                    <Link to="/eligibility" className={buttonClass({ variant: 'outline', block: true })}>
                      <Compass className="size-4" /> {t('visaDetail.side.check')}
                    </Link>
                    <Link to="/cooperation" className="inline-flex min-h-11 items-center justify-center gap-1.5 text-sm font-semibold text-link hover:text-link-hover">
                      <BadgeCheck className="size-4" /> {t('visaDetail.side.employer')}
                    </Link>
                    {contact && (
                      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                        <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className={buttonClass({ variant: 'secondary' })}>
                          <Phone className="size-4" /> {t('visaDetail.side.call')}
                        </a>
                        <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary' })}>
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                  {documents.length > 0 && (
                    <a href="#documents" className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-sunken px-3 py-2.5 text-sm font-semibold text-ink hover:text-link-hover">
                      <FileText className="size-4 text-muted" aria-hidden /> {t('visaDetail.documents.title')} · {documents.length}
                    </a>
                  )}
                </div>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>

      <CalculatorTeaser visa={data.slug} />
      <CostCalculatorTeaser visa={data.slug} />
      <BudgetTeaser visa={data.slug} gross={data.salaryMin} grossMax={data.salaryMax} />

      {services.length > 0 && (
        <section className="section bg-sunken">
          <div className="container-x">
            <div className="section-head max-w-3xl">
              <span className="eyebrow">{t('visaDetail.services.eyebrow')}</span>
              <h2 className="h-section mt-2 text-ink">{t('visaDetail.services.title')}</h2>
              <p className="mt-3 text-muted sm:text-lg">{t('visaDetail.services.subtitle')}</p>
            </div>
            <div className="mobile-rail cards-balanced sm:[--cols:2] lg:[--cols:4]">
              {services.map((s) => (
                <ServiceCard key={s.id} service={s} index={allServices.indexOf(s)} />
              ))}
            </div>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="section">
          <div className="container-x">
            <h2 className="h-section section-head text-ink">{t('visaDetail.others')}</h2>
            <Stagger className="grid-cards cards-balanced sm:[--cols:2] lg:[--cols:3]">
              {others.map((v) => (
                <StaggerItem key={v.id}>
                  <VisaCard visa={v} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      <PageCta
        icon={<ClipboardCheck className="size-7" />}
        title={t('visaDetail.cta.title')}
        text={t('visaDetail.cta.text')}
        primary={{ to: '/register', label: t('visaDetail.cta.primary') }}
        secondary={{ to: '/contact', label: t('visaDetail.cta.secondary') }}
      />
    </>
  );
}
