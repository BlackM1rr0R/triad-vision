import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
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
import { Magnetic, Marquee, Reveal, Stagger, StaggerItem, TiltCard } from '../motion';
import { SectionHeading } from '../ui/SectionHeading';
import { DetailModal } from '../ui/DetailModal';
import { FaqList, PartnerLogo, PostCard, ServiceCard, TestimonialCard, VisaCard, VisaSticker } from '../cards';
import { useSiteContent } from '@/lib/content';

const ViewAll = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="btn-ghost group w-full whitespace-nowrap sm:w-auto">
    {label} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
  </Link>
);

export const VisaSection = () => {
  const { t } = useTranslation();
  const { data } = useSiteContent();
  return (
    <section className="section">
      <div className="container-x">
        <SectionHeading eyebrow={t('visas.eyebrow')} title={t('visas.title')} subtitle={t('visas.subtitle')} action={<ViewAll to="/visas" label={t('visas.all')} />} />
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
  const { data } = useSiteContent();
  if (!data?.services.length) return null;
  return (
    <section className="section bg-surface">
      <div className="container-x">
        <SectionHeading eyebrow={t('svc.eyebrow')} title={t('svc.title')} subtitle={t('svc.subtitle')} action={<ViewAll to="/services" label={t('common.viewAll')} />} />
        <Stagger className="mobile-rail sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6">
          {data.services.slice(0, 8).map((s, i) => (
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
    { key: 'company', icon: Building2, to: '/cooperation', img: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1200&q=70' },
    { key: 'candidate', icon: UserRound, to: '/register', img: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=70' },
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
                <TiltCard max={4} className="h-full rounded-3xl">
                  <div className="group relative isolate flex h-full min-h-[420px] flex-col justify-end overflow-hidden rounded-3xl bg-navy-950 p-6 text-white sm:min-h-[460px] sm:p-10">
                    <img src={c.img} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover opacity-40 transition duration-[1.5s] group-hover:scale-110 group-hover:opacity-30" />
                    <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy-950 via-navy-950/85 to-navy-900/20" />
                    <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40 sm:mb-5 sm:size-14">
                      <c.icon className="size-6 sm:size-7" />
                    </span>
                    <h3 className="font-display text-2xl font-extrabold sm:text-3xl">{t(`audience.${c.key}.title`)}</h3>
                    <p className="mt-3 max-w-md text-sm text-white/75 sm:text-base">{t(`audience.${c.key}.text`)}</p>
                    <ul className="mt-5 grid gap-2.5 sm:mt-6 sm:grid-cols-2">
                      {items.map((it) => (
                        <li key={it} className="flex items-center gap-2 text-sm text-white/90">
                          <BadgeCheck className="size-4 shrink-0 text-brand-400" /> {it}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6 sm:mt-8">
                      <Link to={c.to} className="btn-white group/btn w-full sm:w-auto">
                        {t(`audience.${c.key}.cta`)} <ArrowRight className="size-4 transition group-hover/btn:translate-x-1" />
                      </Link>
                    </div>
                  </div>
                </TiltCard>
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

  const OpenIcon = open !== null ? STEP_ICONS[open] ?? Search : Search;

  return (
    <section className="section relative overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute top-0 right-0 size-[600px] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-20" />
      <div className="container-x relative">
        <SectionHeading eyebrow={t('process.eyebrow')} title={t('process.title')} light />
        <div ref={root} className="relative">
          <div className="absolute top-8 right-[8%] left-[8%] hidden h-[2px] bg-white/10 lg:block">
            <motion.div style={{ scaleX: lineProgress }} className="h-full origin-left bg-gradient-to-r from-az-blue via-brand-500 to-de-gold" />
          </div>
          <div className="absolute top-2 bottom-2 left-7 w-[2px] bg-white/10 lg:hidden">
            <motion.div style={{ scaleY: lineProgress }} className="h-full origin-top bg-gradient-to-b from-az-blue via-brand-500 to-de-gold" />
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
                  viewport={{ amount: 0.6, margin: '0px 0px -10% 0px' }}
                  variants={{ off: { opacity: 0.3, y: 24 }, on: { opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.05 } } }}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group relative flex w-full gap-4 rounded-2xl p-0 text-left transition lg:flex-col lg:items-center lg:p-3 lg:text-center lg:hover:bg-white/5"
                  >
                    <motion.span
                      variants={{ off: { scale: 0.7, backgroundColor: '#18397a' }, on: { scale: 1, backgroundColor: '#1565e8', transition: { duration: 0.5, delay: i * 0.05 } } }}
                      className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-white/15 shadow-xl shadow-brand-600/20 lg:size-16"
                    >
                      <StepIcon className="size-6 lg:size-7" />
                      <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-white font-display text-xs font-extrabold text-navy-900">{i + 1}</span>
                    </motion.span>
                    <span className="min-w-0 flex-1 py-1 lg:pt-3">
                      <span className="block font-display text-base font-bold">{s.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-white/60">{s.text}</span>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-400 opacity-80 transition group-hover:opacity-100">
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
            <p className="font-semibold text-navy-900">{steps[open]?.text}</p>
            <p className="mt-3">{details[open]}</p>
          </>
        )}
      </DetailModal>
    </section>
  );
};

const WHY_ICONS: LucideIcon[] = [Scale, LayoutDashboard, UserCheck, Clock, Languages, HomeIcon];

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
                  className="group relative h-full w-full overflow-hidden rounded-2xl border border-line bg-white card-pad text-left transition duration-500 hover:-translate-y-1 hover:border-transparent hover:shadow-2xl hover:shadow-brand-600/15"
                >
                  <div className="absolute inset-0 translate-y-full bg-gradient-to-br from-brand-600 to-navy-900 transition-transform duration-500 ease-out group-hover:translate-y-0" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-white/15 group-hover:text-white">
                        <WhyIcon className="size-6" />
                      </span>
                      <span className="font-display text-4xl leading-none font-black text-navy-900/5 transition group-hover:text-white/15">0{i + 1}</span>
                    </div>
                    <h3 className="mt-5 font-display text-lg font-bold text-navy-900 transition group-hover:text-white">{it.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted transition group-hover:text-white/80">{it.text}</p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:text-white">
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
    <section className="section bg-surface">
      <div className="container-x grid gap-10 xl:grid-cols-[1fr_360px] xl:gap-12">
        <div className="min-w-0">
          <SectionHeading eyebrow={t('samples.eyebrow')} title={t('samples.title')} subtitle={`${t('samples.subtitle')} ${t('samples.privacy')}`} />
          <div ref={track} className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
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
                aria-label={d < 0 ? 'Prev' : 'Next'}
                onClick={() => scroll(d)}
                className="grid size-11 place-items-center rounded-full border border-line bg-white text-navy-900 transition hover:border-brand-500 hover:bg-brand-600 hover:text-white"
              >
                {d < 0 ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 md:grid md:grid-cols-2 xl:flex">
          <Reveal className="md:col-span-2">
            <h3 className="font-display text-2xl font-extrabold text-navy-900">{t('testimonials.title')}</h3>
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
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], ['-15%', '15%']);
  return (
    <section className="section">
      <div className="container-x">
        <div ref={ref} className="relative isolate grid overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-navy-900 text-white lg:grid-cols-2 lg:rounded-[2rem]">
          <div className="relative z-10 p-6 sm:p-12 lg:p-16">
            <span className="eyebrow text-white/80">
              <GraduationCap className="size-4" /> {t('ausbildung.eyebrow')}
            </span>
            <h2 className="mt-4 font-display text-[1.75rem] leading-tight font-extrabold sm:text-4xl">{t('ausbildung.title')}</h2>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/80 sm:mt-5 sm:text-base">{t('ausbildung.text')}</p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <Link to="/ausbildung" className="btn-white group">
                {t('common.learnMore')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
              <Link to="/eligibility" className="btn-outline">
                {t('nav.eligibility')}
              </Link>
            </div>
          </div>
          <div className="relative min-h-[240px] overflow-hidden sm:min-h-[300px]">
            <motion.img
              style={{ y }}
              src="https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?auto=format&fit=crop&w=1200&q=70"
              alt=""
              loading="lazy"
              className="absolute inset-0 h-[130%] w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-brand-700/60 to-transparent lg:bg-gradient-to-r lg:from-brand-600/90" />
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
    <section className="section relative overflow-hidden bg-navy-950 text-white">
      <div className="pointer-events-none absolute bottom-0 left-0 size-[500px] rounded-full bg-[radial-gradient(closest-side,var(--color-brand-600),transparent)] opacity-20" />
      <div className="container-x relative">
        <SectionHeading eyebrow={t('stories.title')} title={t('stories.subtitle')} light action={<Link to="/stories" className="btn-outline w-full whitespace-nowrap sm:w-auto">{t('common.viewAll')}</Link>} />
        <Stagger className="mobile-rail md:grid-cols-2 md:gap-5 xl:grid-cols-4">
          {data?.testimonials.map((tm) => (
            <StaggerItem key={tm.id}>
              <TestimonialCard item={tm} dark />
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
    <section className="section bg-surface">
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
          <div className="relative isolate overflow-hidden rounded-3xl bg-navy-950 px-6 py-10 text-white sm:px-12 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:rounded-[2rem]">
            <img
              src="https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=70"
              alt=""
              loading="lazy"
              className="absolute inset-0 -z-10 size-full object-cover opacity-25"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950 via-navy-950/90 to-brand-700/60" />
            <motion.div
              className="absolute -right-20 -bottom-20 -z-10 size-80 rounded-full border-[40px] border-brand-500/20"
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
            />
            <div>
              <h2 className="font-display text-2xl leading-tight font-extrabold sm:text-4xl">{t('cta.title')}</h2>
              <p className="mt-3 max-w-xl text-sm text-white/75 sm:text-base">{t('cta.text')}</p>
            </div>
            <div className="mt-7 shrink-0 lg:mt-0">
              <Magnetic className="w-full sm:w-auto">
                <Link to="/cooperation" className="btn-primary group w-full px-7 py-4 text-base sm:w-auto">
                  <span className="absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/25" />
                  {t('cta.button')} <ArrowRight className="size-5 transition group-hover:translate-x-1" />
                </Link>
              </Magnetic>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
