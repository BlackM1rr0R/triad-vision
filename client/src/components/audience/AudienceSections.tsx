import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, BadgeCheck, Briefcase, CalendarCheck, GraduationCap, HeartHandshake, Map as MapIcon, Scale, UserCheck, Users, Wrench, type LucideIcon } from 'lucide-react';
import { Magnetic, Reveal, ScrollFillLine, Stagger, StaggerItem } from '../motion';
import { SectionHeading } from '../ui/SectionHeading';
import { FaqList, ServiceCard, TestimonialCard } from '../cards';
import { useSiteContent } from '@/lib/content';
import { CONTENT_AUDIENCE, type Audience } from '@/lib/audience';
import { sized, srcSet } from '@/lib/img';
import { registerCopy } from '@/i18n';
import { pagesAudience } from '@/i18n/pagesAudience';
import { TOOLS } from './tools';

registerCopy(pagesAudience);

/*
 * Building blocks of the audience views: the /for-workers and /for-employers landing pages and the home page
 * once the visitor has said who they are. Everything comes from the CMS content already loaded for the site
 * (services by Service.audience, testimonials by kind, FAQ by audience) plus pagesAudience copy.
 */

const PAGE: Record<Audience, 'workersPage' | 'employersPage'> = { worker: 'workersPage', employer: 'employersPage' };
const CTA_IMG = 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=70';

const matches = (value: string, a: Audience) => value === 'all' || value === CONTENT_AUDIENCE[a];

const ViewAll = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="btn-ghost group w-full whitespace-nowrap sm:w-auto">
    {label} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
  </Link>
);

/** Primary + secondary call to action of an audience (hero and closing box). */
export const AudienceCtas = ({ audience, light = true }: { audience: Audience; light?: boolean }) => {
  const { t } = useTranslation();
  const p = PAGE[audience];
  const primary = audience === 'worker' ? '/register' : '/cooperation#form';
  const secondary = audience === 'worker' ? '/uygunluq-testi' : '/booking';
  return (
    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <Magnetic className="w-full sm:w-auto">
        <Link to={primary} className="btn-primary group w-full px-6 py-3.5 sm:w-auto">
          {t(`${p}.ctaPrimary`)} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </Magnetic>
      <Link to={secondary} className={light ? 'btn-outline w-full px-6 py-3.5 sm:w-auto' : 'btn-ghost w-full px-6 py-3.5 sm:w-auto'}>
        {t(`${p}.ctaSecondary`)}
      </Link>
    </div>
  );
};

/** Worker: the four doors (jobs, visas, Ausbildung, tools). */
export const WorkerQuickLinks = () => {
  const { t } = useTranslation();
  const items: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/jobs', label: t('siteNav.w.jobs'), icon: Briefcase },
    { to: '/visas', label: t('siteNav.w.visas'), icon: MapIcon },
    { to: '/ausbildung', label: t('siteNav.w.ausbildung'), icon: GraduationCap },
    { to: '/tools', label: t('siteNav.w.tools'), icon: Wrench },
  ];
  return (
    <section className="section-sm">
      <div className="container-x">
        <h2 className="mb-5 font-display text-xl font-bold text-navy-900 sm:text-2xl">{t('workersPage.quickTitle')}</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map((it) => (
            <li key={it.to}>
              <Link to={it.to} className="group card flex h-full items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand-400 sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                  <it.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 font-semibold text-navy-900">{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/** Services for one audience (Service.audience = candidate | company | all). */
export const AudienceServices = ({ audience }: { audience: Audience }) => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const services = (data?.services ?? []).filter((s) => matches(s.audience, audience));
  if (!services.length) return null;
  const p = PAGE[audience];
  return (
    <section id="services" className="section scroll-mt-20 bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('svc.eyebrow')} title={t(`${p}.servicesTitle`)} subtitle={t(`${p}.servicesSubtitle`)} action={<ViewAll to="/services" label={t('common.viewAll')} />} />
        <Stagger className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {services.slice(0, 8).map((s, i) => (
            <StaggerItem key={s.id}>
              <ServiceCard service={s} index={i} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/** Worker: a few tools and the way to all of them. */
export const ToolsTeaser = () => {
  const { t } = useTranslation();
  const picks = ['quiz', 'blueCard', 'salary', 'startDate'];
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('toolsPage.eyebrow')} title={t('workersPage.toolsTitle')} subtitle={t('workersPage.toolsSubtitle')} action={<ViewAll to="/tools" label={t('workersPage.toolsAll')} />} />
        <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-4">
          {TOOLS.filter((x) => picks.includes(x.key)).map((tool) => (
            <StaggerItem key={tool.key}>
              <ToolCard tool={tool} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export const ToolCard = ({ tool }: { tool: (typeof TOOLS)[number] }) => {
  const { t } = useTranslation();
  return (
    <Link to={tool.to} className="group card flex h-full flex-col p-5 transition duration-300 hover:-translate-y-1 hover:border-brand-400 hover:shadow-xl hover:shadow-brand-600/10 sm:p-6">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
        <tool.icon className="size-6" aria-hidden />
      </span>
      <h3 className="mt-4 font-display text-lg font-bold text-navy-900">{t(`toolsPage.items.${tool.key}.title`)}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{t(`toolsPage.items.${tool.key}.text`)}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
        {t('toolsPage.open')} <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
};

const BENEFIT_ICONS: LucideIcon[] = [Scale, UserCheck, Users, HeartHandshake];

/** Employer: why work with us. */
export const EmployerBenefits = () => {
  const { t } = useTranslation();
  const items = t('employersPage.benefits', { returnObjects: true }) as { title: string; text: string }[];
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('employersPage.eyebrow')} title={t('employersPage.benefitsTitle')} center />
        <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => {
            const BenefitIcon = BENEFIT_ICONS[i] ?? BadgeCheck;
            return (
              <StaggerItem key={it.title}>
                <div className="card card-pad h-full">
                  <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <BenefitIcon className="size-6" aria-hidden />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-bold text-navy-900">{it.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{it.text}</p>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
};

/** Employer: how hiring works, as numbered steps (anchor #process, linked from the header menu). */
export const EmployerProcess = () => {
  const { t } = useTranslation();
  const steps = t('employersPage.process.steps', { returnObjects: true }) as { title: string; text: string }[];
  const timeline = useRef<HTMLOListElement>(null);
  return (
    <section id="process" className="section relative scroll-mt-20 overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute top-0 right-0 size-[600px] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-20" />
      <div className="container-x relative">
        <SectionHeading eyebrow={t('employersPage.process.eyebrow')} title={t('employersPage.process.title')} light />
        <div className="relative">
          {/* A progress line under the row that fills as the steps scroll by (decorative). */}
          <ScrollFillLine target={timeline} className="inset-x-0 -bottom-4 hidden rounded-full md:block" />
        <ol ref={timeline} className="relative grid gap-4 md:grid-cols-5">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Reveal delay={i * 0.06} className="h-full">
                <div className="glass relative h-full rounded-2xl p-5">
                  <span aria-hidden className="grid size-10 place-items-center rounded-full bg-brand-600 font-display text-sm font-extrabold">{i + 1}</span>
                  <h3 className="mt-4 font-display text-base font-bold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/75">{s.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        </div>
        <div className="mt-8">
          <Link to="/cooperation#form" className="btn-white group">
            {t('employersPage.ctaPrimary')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
};

/** Testimonials of one kind (workers → candidate, employers → company); nothing when there are none. */
export const AudienceTestimonials = ({ audience }: { audience: Audience }) => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const items = (data?.testimonials ?? []).filter((x) => x.kind === CONTENT_AUDIENCE[audience]);
  if (!items.length) return null;
  return (
    <section id="stories" className="section relative scroll-mt-20 overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute bottom-0 left-0 size-[500px] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-20" />
      <div className="container-x relative">
        <SectionHeading
          eyebrow={t('stories.title')}
          title={t(`${PAGE[audience]}.storiesTitle`)}
          light
          action={
            <Link to="/stories" className="btn-outline w-full whitespace-nowrap sm:w-auto">
              {t('common.viewAll')}
            </Link>
          }
        />
        <Stagger className="mobile-rail md:grid-cols-2 md:gap-5 xl:grid-cols-4">
          {items.slice(0, 4).map((tm) => (
            <StaggerItem key={tm.id}>
              <TestimonialCard item={tm} dark />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

/** FAQ for one audience (Faq.audience = candidate | company | all). */
export const AudienceFaq = ({ audience }: { audience: Audience }) => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const items = (data?.faqs ?? []).filter((f) => matches(f.audience, audience));
  if (!items.length) return null;
  return (
    <section id="faq" className="section scroll-mt-20">
      <div className="container-x grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <SectionHeading eyebrow={t('faq.eyebrow')} title={t(`${PAGE[audience]}.faqTitle`)} subtitle={t('faq.subtitle')} />
          <div className="-mt-2 flex flex-col gap-3 sm:flex-row lg:mt-0">
            <Link to="/faq" className="btn-ghost">
              {t('common.viewAll')}
            </Link>
            <Link to="/contact" className="btn-primary">
              {t('nav.contact')}
            </Link>
          </div>
        </div>
        <Reveal delay={0.1}>
          <FaqList items={items.slice(0, 6)} />
        </Reveal>
      </div>
    </section>
  );
};

/** Closing call to action of an audience. */
export const AudienceCta = ({ audience }: { audience: Audience }) => {
  const { t } = useTranslation();
  const p = PAGE[audience];
  return (
    <section className="pb-16 sm:pb-20 lg:pb-28">
      <div className="container-x">
        <Reveal>
          <div className="relative isolate overflow-hidden rounded-3xl bg-navy-950 px-6 py-10 text-white sm:px-12 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:rounded-[2rem]">
            <img src={sized(CTA_IMG, 1280)} srcSet={srcSet(CTA_IMG, [640, 960, 1280, 1600])} sizes="(min-width: 1280px) 1200px, 100vw" alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-10 size-full object-cover opacity-25" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950 via-navy-950/90 to-brand-700/60" />
            <div>
              <h2 className="font-display text-2xl leading-tight font-extrabold sm:text-4xl">{t(`${p}.ctaTitle`)}</h2>
              <p className="mt-3 max-w-xl text-sm text-white/75 sm:text-base">{t(`${p}.ctaText`)}</p>
            </div>
            <div className="shrink-0 lg:-mt-7">
              <AudienceCtas audience={audience} />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

/** Small strip under the tools grid / CTA linking to a free consultation. */
export const ConsultStrip = ({ title, text }: { title: string; text: string }) => {
  const { t } = useTranslation();
  return (
    <div className="card card-pad flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-display text-lg font-bold text-navy-900">{title}</p>
        <p className="mt-1 text-sm text-muted">{text}</p>
      </div>
      <Link to="/booking" className="btn-primary group shrink-0 px-5 py-3">
        <CalendarCheck className="size-4" aria-hidden /> {t('siteNav.book')}
      </Link>
    </div>
  );
};
