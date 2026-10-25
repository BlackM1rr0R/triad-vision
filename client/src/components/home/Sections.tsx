import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useSpring } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileCheck2,
  GraduationCap,
  Handshake,
  Home as HomeIcon,
  Languages,
  LayoutDashboard,
  Plane,
  Plus,
  Scale,
  Search,
  UserCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Marquee, Reveal, Stagger, StaggerItem, useMotionOK } from '../motion';
import { Employer, Worker } from '../illustrations';
import { SectionHeading } from '../ui/SectionHeading';
import { DetailModal } from '../ui/DetailModal';
import { FaqList, PartnerLogo, PostCard, ServiceCard, TestimonialCard, VisaCard, VisaSticker } from '../cards';
import { sized, srcSet } from '@/lib/img';

const ELIGIBILITY_IMG = 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1200&q=70';
import { useSiteContent } from '@/lib/content';
import { SkeletonCard } from '../ui/Skeleton';
import { setAudience } from '@/lib/audience';

const ViewAll = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="btn-ghost group w-full whitespace-nowrap sm:w-auto">
    {label} <ArrowRight className="size-4" />
  </Link>
);

/** Card placeholders in the same rail / grid as the loaded cards, so the section keeps its height (no CLS). */
const RailSkeleton = ({ count, className, media }: { count: number; className: string; media?: boolean }) => (
  <div className={className}>
    {Array.from({ length: count }, (_, i) => (
      <SkeletonCard key={i} media={media} mediaClassName="aspect-[16/11]" lines={3} className="h-full" />
    ))}
  </div>
);

export const VisaSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('visas.eyebrow')} title={t('visas.title')} subtitle={t('visas.subtitle')} action={<ViewAll to="/visas" label={t('visas.all')} />} />
        {!data && <RailSkeleton count={4} media className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4" />}
        <Stagger className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6 xl:grid-cols-4">
          {data?.visaCategories.slice(0, 8).map((v) => (
            <StaggerItem key={v.id}>
              <VisaCard visa={v} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export const ServicesSection = () => {
  const { t } = useTranslation();
  const { data, isLoading } = useSiteContent();
  if (!isLoading && !data?.services.length) return null;
  return (
    <section className="section bg-sunken">
      <div className="container-x">
        <SectionHeading eyebrow={t('svc.eyebrow')} title={t('svc.title')} subtitle={t('svc.subtitle')} action={<ViewAll to="/services" label={t('common.viewAll')} />} />
        {!data && <RailSkeleton count={4} className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6" />}
        <Stagger className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {data?.services.slice(0, 8).map((s, i) => (
            <StaggerItem key={s.id}>
              <ServiceCard service={s} index={i} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export const PartnersSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const partners = data?.partners ?? [];
  const half = Math.ceil(partners.length / 2);
  return (
    <section className="section overflow-hidden">
      <div className="container-x">
        <SectionHeading eyebrow={t('partners.eyebrow')} title={t('partners.title')} subtitle={t('partners.subtitle')} action={<ViewAll to="/partners" label={t('partners.all')} />} />
      </div>
      <div className="space-y-3 sm:space-y-4">
        <Marquee>
          {partners.slice(0, half).map((p) => (
            <PartnerLogo key={p.id} partner={p} />
          ))}
        </Marquee>
        <Marquee reverse>
          {partners.slice(half).map((p) => (
            <PartnerLogo key={p.id} partner={p} />
          ))}
        </Marquee>
      </div>
    </section>
  );
};

export const AudienceSection = () => {
  const { t } = useTranslation();
  const cards = [
    { key: 'company', audience: 'employer', icon: Building2, to: '/for-employers', Art: Employer },
    { key: 'candidate', audience: 'worker', icon: UserRound, to: '/for-workers', Art: Worker },
  ] as const;
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('audience.eyebrow')} title={t('audience.title')} center />
        <div className="grid-cards lg:grid-cols-2">
          {cards.map((c, i) => {
            const items = t(`audience.${c.key}.items`, { returnObjects: true }) as string[];
            return (
              <Reveal key={c.key} delay={i * 0.12}>
                <div className="flex h-full flex-col rounded-3xl border border-line bg-card p-6 shadow-[var(--tv-shadow-card)] sm:p-9">
                  <div className="flex items-start justify-between gap-4">
                    <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${i === 0 ? 'chip-sky' : 'chip-soft'}`}>
                      <c.icon className="size-6" aria-hidden />
                    </span>
                    <c.Art className="w-24 shrink-0 sm:w-28" />
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">{t(`audience.${c.key}.title`)}</h3>
                  <p className="mt-3 max-w-[56ch] text-base leading-relaxed text-muted">{t(`audience.${c.key}.text`)}</p>
                  <ul className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2">
                    {items.map((it) => (
                      <li key={it} className="flex items-start gap-2 text-sm text-ink">
                        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-highlight-fg" aria-hidden /> {it}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-7">
                    {/* Opening an audience page also remembers the choice for the home page (lib/audience). */}
                    <Link to={c.to} onClick={() => setAudience(c.audience)} className="btn-primary btn-press btn-lg w-full sm:w-auto">
                      {t(`siteNav.overview.${c.audience}.title`)} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const STEP_ICONS: LucideIcon[] = [Search, FileCheck2, Handshake, Scale, Plane, UserCheck];

export const ProcessSection = () => {
  const { t } = useTranslation();
  const steps = t('process.steps', { returnObjects: true }) as { title: string; text: string }[];
  const details = t('detail.process', { returnObjects: true }) as string[];
  const [open, setOpen] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  // The progress line fills as the section scrolls through the viewport (scroll-linked, no JS timers).
  const { scrollYProgress } = useScroll({ target: root, offset: ['start 75%', 'end 55%'] });
  const lineProgress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  // Reduced motion: the line is simply full (no scroll-linked movement).
  const line = useMotionOK() ? lineProgress : 1;

  const OpenIcon = open !== null ? STEP_ICONS[open] ?? Search : Search;

  return (
    <section className="section relative">
      <div className="container-x relative">
        <SectionHeading eyebrow={t('process.eyebrow')} title={t('process.title')} />
        <div ref={root} className="relative">
          <div className="absolute top-8 right-[8%] left-[8%] hidden h-[3px] rounded-full bg-line lg:block">
            <motion.div style={{ scaleX: line }} className="h-full origin-left rounded-full bg-highlight" />
          </div>
          <div className="absolute top-2 bottom-2 left-7 w-[3px] rounded-full bg-line lg:hidden">
            <motion.div style={{ scaleY: line }} className="h-full origin-top rounded-full bg-highlight" />
          </div>
          <ol className="grid gap-3 lg:grid-cols-6 lg:gap-3">
            {steps.map((s, i) => {
              const StepIcon = STEP_ICONS[i] ?? Search;
              return (
                <motion.li
                  key={s.title}
                  data-step
                  initial="off"
                  whileInView="on"
                  // once: a step that has been read stays lit (dimmed 30 % text scrolling back into view failed contrast)
                  viewport={{ once: true, amount: 0.6, margin: '0px 0px -10% 0px' }}
                  variants={{ off: { opacity: 0.3, y: 16 }, on: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.05 } } }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group relative flex w-full gap-4 rounded-2xl p-0 text-left transition lg:flex-col lg:items-center lg:p-3 lg:text-center lg:hover:bg-card"
                  >
                    <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-line bg-card text-ink shadow-[var(--tv-shadow-card)] lg:size-16">
                      <StepIcon className="size-6 lg:size-7" aria-hidden />
                      <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-highlight text-xs font-bold text-highlight-contrast">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1 py-1 lg:pt-3">
                      <span className="block font-display text-base font-semibold text-ink">{s.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-muted">{s.text}</span>
                      <span className="mt-2 inline-flex min-h-6 items-center gap-1 text-sm font-semibold text-link">
                        {t('detail.open')} <Plus className="size-3.5" />
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
      <DetailModal
        open={open !== null}
        onClose={() => setOpen(null)}
        eyebrow={open !== null ? `${t('detail.step')} ${open + 1} / ${steps.length}` : undefined}
        title={open !== null ? steps[open]?.title ?? '' : ''}
        icon={<OpenIcon className="size-6" />}
        footer={
          open !== null && (
            <>
              <button type="button" disabled={open === 0} onClick={() => setOpen((o) => (o ?? 1) - 1)} className="btn-ghost btn-sm">
                <ChevronLeft className="size-4" /> {t('common.back')}
              </button>
              {open < steps.length - 1 ? (
                <button type="button" onClick={() => setOpen((o) => (o ?? 0) + 1)} className="btn-primary btn-sm">
                  {steps[open + 1]?.title} <ChevronRight className="size-4" />
                </button>
              ) : (
                <Link to="/register" className="btn-primary btn-sm">
                  {t('nav.apply')} <ArrowRight className="size-4" />
                </Link>
              )}
            </>
          )
        }
      >
        {open !== null && (
          <>
            <p className="font-semibold text-ink">{steps[open]?.text}</p>
            <p className="mt-3">{details[open]}</p>
          </>
        )}
      </DetailModal>
    </section>
  );
};

const WHY_ICONS: LucideIcon[] = [Scale, LayoutDashboard, UserCheck, Clock, Languages, HomeIcon];
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

export const WhySection = () => {
  const { t } = useTranslation();
  const items = t('why.items', { returnObjects: true }) as { title: string; text: string }[];
  const details = t('detail.why', { returnObjects: true }) as string[];
  const [open, setOpen] = useState<number | null>(null);
  const OpenIcon = open !== null ? WHY_ICONS[open] ?? Scale : Scale;

  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('why.eyebrow')} title={t('why.title')} center />
        <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => {
            const WhyIcon = WHY_ICONS[i] ?? Scale;
            return (
              <StaggerItem key={it.title}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="card card-interactive card-pad group relative h-full w-full text-left"
                >
                  <div className="relative">
                    <span className={`grid size-12 place-items-center rounded-xl ${CHIPS[i % CHIPS.length]}`}>
                      <WhyIcon className="size-6" aria-hidden />
                    </span>
                    <h3 className="mt-5 font-display text-lg font-semibold text-ink">{it.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{it.text}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-link group-hover:underline">
                      {t('detail.open')} <ArrowUpRight className="size-4" />
                    </span>
                  </div>
                </button>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
      <DetailModal
        open={open !== null}
        onClose={() => setOpen(null)}
        eyebrow={t('why.eyebrow')}
        title={open !== null ? items[open]?.title ?? '' : ''}
        icon={<OpenIcon className="size-6" />}
        footer={
          <Link to="/contact" className="btn-primary btn-sm">
            {t('nav.contact')} <ArrowRight className="size-4" />
          </Link>
        }
      >
        {open !== null && <p>{details[open]}</p>}
      </DetailModal>
    </section>
  );
};

export const SamplesSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => track.current?.scrollBy({ left: dir * 540, behavior: 'smooth' });
  const testimonials = data?.testimonials ?? [];

  return (
    <section className="section bg-sunken">
      <div className="container-x grid gap-10 xl:grid-cols-[1fr_360px] xl:gap-12">
        <div className="min-w-0">
          <SectionHeading eyebrow={t('samples.eyebrow')} title={t('samples.title')} subtitle={`${t('samples.subtitle')} ${t('samples.privacy')}`} />
          <div ref={track} role="region" aria-label={t('samples.title')} tabIndex={0} className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
            {data?.samples.map((s, i) => (
              <motion.div key={s.id} className="snap-start" initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.6 }}>
                <VisaSticker sample={s} />
              </motion.div>
            ))}
          </div>
          <div className="mt-4 hidden gap-2 sm:flex">
            {[-1, 1].map((d) => (
              <button
                key={d}
                type="button"
                aria-label={d < 0 ? t('a11y.prev') : t('a11y.next')}
                onClick={() => scroll(d)}
                className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink transition hover:border-primary hover:bg-primary hover:text-primary-contrast"
              >
                {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:grid md:grid-cols-2 xl:flex">
          <Reveal className="md:col-span-2">
            <h3 className="font-display text-2xl font-semibold text-ink">{t('testimonials.title')}</h3>
          </Reveal>
          {testimonials.slice(0, 2).map((tm, i) => (
            <Reveal key={tm.id} delay={0.1 + i * 0.1}>
              <TestimonialCard item={tm} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export const AusbildungSection = () => {
  const { t } = useTranslation();
  return (
    <section className="section">
      <div className="container-x">
        <div className="grid overflow-hidden rounded-3xl border border-line bg-highlight-bg lg:grid-cols-2">
          <div className="p-6 sm:p-12 lg:p-16">
            <span className="eyebrow">
              <GraduationCap className="size-4" aria-hidden /> {t('ausbildung.eyebrow')}
            </span>
            <h2 className="mt-4 h-section text-ink">{t('ausbildung.title')}</h2>
            <p className="mt-4 max-w-[56ch] text-base leading-relaxed text-ink/80 sm:mt-5">{t('ausbildung.text')}</p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link to="/ausbildung" className="btn-primary btn-press btn-lg">
                {t('common.learnMore')} <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link to="/eligibility" className="btn-secondary btn-lg">
                {t('nav.eligibility')}
              </Link>
            </div>
          </div>
          <div className="relative min-h-[240px] overflow-hidden sm:min-h-[300px] lg:m-4 lg:rounded-2xl">
            <img
              src={sized(ELIGIBILITY_IMG, 960)}
              srcSet={srcSet(ELIGIBILITY_IMG, [640, 960, 1280])}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export const TestimonialsSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('stories.title')} title={t('stories.subtitle')} action={<ViewAll to="/stories" label={t('common.viewAll')} />} />
        <Stagger className="mobile-rail md:grid-cols-2 md:gap-5 xl:grid-cols-4">
          {data?.testimonials.map((tm) => (
            <StaggerItem key={tm.id}>
              <TestimonialCard item={tm} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export const FaqSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  return (
    <section className="section">
      <div className="container-x grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
        <div>
          <SectionHeading eyebrow={t('faq.eyebrow')} title={t('faq.title')} subtitle={t('faq.subtitle')} />
          <Reveal delay={0.2}>
            <div className="-mt-2 flex flex-col gap-3 sm:flex-row lg:mt-0">
              <Link to="/faq" className="btn-ghost">
                {t('common.viewAll')}
              </Link>
              <Link to="/contact" className="btn-primary">
                {t('nav.contact')}
              </Link>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>{data && <FaqList items={data.faqs.slice(0, 5)} />}</Reveal>
      </div>
    </section>
  );
};

export const NewsSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  if (!data?.posts.length) return null;
  return (
    <section className="section bg-sunken">
      <div className="container-x">
        <SectionHeading eyebrow={t('news.eyebrow')} title={t('news.title')} action={<ViewAll to="/news" label={t('common.viewAll')} />} />
        <Stagger className="mobile-rail md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-6">
          {data.posts.slice(0, 3).map((p) => (
            <StaggerItem key={p.id}>
              <PostCard post={p} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
};

export const CtaSection = () => {
  const { t } = useTranslation();
  return (
    <section className="pb-16 sm:pb-20 lg:pb-28">
      <div className="container-x">
        <Reveal>
          <div className="rounded-3xl bg-navy-950 px-6 py-10 text-white sm:px-12 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-10">
            <div>
              <h2 className="font-display text-2xl leading-tight font-semibold sm:text-4xl">{t('cta.title')}</h2>
              <p className="mt-3 max-w-[56ch] text-base text-white/80">{t('cta.text')}</p>
            </div>
            <div className="mt-7 shrink-0 lg:mt-0">
              <Link to="/cooperation" className="btn-primary btn-press btn-lg w-full sm:w-auto">
                {t('cta.button')} <ArrowRight className="size-5" aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
