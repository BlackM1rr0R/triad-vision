import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Briefcase, FileSignature, GraduationCap, HeartPulse, Info, Languages, School, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ServiceCard, VisaCard } from '@/components/cards';
import { GroupedBars } from '@/components/visa/Charts';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { useEuro } from '@/components/visa/utils';
import { useSiteContent } from '@/lib/content';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';

registerCopy(pagesVisa);

/** Indicative gross monthly trainee pay per training year (EUR). Labelled as indicative on the page. */
const PAY: { key: string; values: [number, number, number] }[] = [
  { key: 'nursing', values: [1340, 1400, 1500] },
  { key: 'mechatronics', values: [1050, 1120, 1200] },
  { key: 'electronics', values: [1030, 1100, 1180] },
  { key: 'logistics', values: [1000, 1080, 1160] },
  { key: 'driver', values: [1000, 1080, 1170] },
  { key: 'cook', values: [950, 1040, 1130] },
  { key: 'hotel', values: [950, 1040, 1130] },
];

/** A typical week: three company days, two school days. */
const WEEK: ('company' | 'school')[] = ['company', 'company', 'school', 'company', 'school'];

const REQ_ICONS = [GraduationCap, Languages, FileSignature, Wallet, ShieldCheck, Sparkles];

export default function Ausbildung() {
  const { t } = useTranslation();
  const euro = useEuro();
  const { data } = useSiteContent();
  const facts = t('ausbildungPage.facts', { returnObjects: true }) as {
    value: string;
    label: string;
  }[];
  const paragraphs = t('ausbildungPage.what.paragraphs', {
    returnObjects: true,
  }) as string[];
  const days = t('ausbildungPage.what.days', {
    returnObjects: true,
  }) as string[];
  const years = t('ausbildungPage.professions.years', {
    returnObjects: true,
  }) as string[];
  const reqs = t('ausbildungPage.reqs.items', { returnObjects: true }) as {
    title: string;
    text: string;
  }[];
  const timeline = t('ausbildungPage.timeline.items', {
    returnObjects: true,
  }) as { when: string; title: string; text: string }[];
  const faq = t('ausbildungPage.faq.items', { returnObjects: true }) as {
    q: string;
    a: string;
  }[];
  const visa = data?.visaCategories.find((v) => v.slug === 'ausbildung');
  const services = data?.services ?? [];
  const service = services.find((s) => s.slug === 'ausbildung-placement');

  return (
    <>
      <PageHero
        title={t('ausbildungPage.heroTitle')}
        subtitle={t('ausbildungPage.heroSubtitle')}
        image="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2000&q=70"
      />

      {/* Key figures */}
      <div className="relative z-10 -mt-8 sm:-mt-10">
        <div className="container-x">
          <Stagger className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_20px_50px_-20px_rgba(11,31,68,0.3)] lg:grid-cols-4">
            {facts.map((f, i) => (
              <StaggerItem
                key={f.label}
                className={clsx('p-4 sm:p-6', i % 2 === 1 && 'border-l border-line', i > 1 && 'border-t border-line lg:border-t-0', i === 2 && 'lg:border-l')}
              >
                <p className="font-display text-xl font-extrabold text-brand-600 tabular-nums sm:text-3xl">{f.value}</p>
                <p className="mt-1 text-xs font-medium text-muted sm:text-sm">{f.label}</p>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-2 text-right text-[11px] text-muted">{t('visasPage.indicative')}</p>
        </div>
      </div>

      {/* Dual system */}
      <section className="section">
        <div className="container-x grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading eyebrow={t('ausbildungPage.what.eyebrow')} title={t('ausbildungPage.what.title')} />
            <Reveal className="-mt-2 space-y-4 sm:-mt-4">
              {paragraphs.map((p) => (
                <p key={p.slice(0, 24)} className="leading-relaxed text-muted sm:text-lg">
                  {p}
                </p>
              ))}
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="card card-pad sm:p-8">
              <h3 className="font-display text-lg font-bold text-navy-900">{t('ausbildungPage.what.weekTitle')}</h3>
              <div role="img" aria-label={t('ausbildungPage.what.weekAria')} className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
                {WEEK.map((kind, i) => (
                  <div key={days[i]} className="text-center">
                    <p className="mb-2 text-xs font-bold text-muted">{days[i]}</p>
                    <motion.div
                      className={clsx(
                        'grid h-28 place-items-center rounded-xl sm:h-36',
                        kind === 'company' ? 'bg-gradient-to-b from-brand-500 to-brand-700 text-white' : 'border-2 border-dashed border-navy-900/25 bg-surface text-navy-900',
                      )}
                      style={{ originY: 1 }}
                      initial={{ scaleY: 0.2, opacity: 0 }}
                      whileInView={{ scaleY: 1, opacity: 1 }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{ duration: 0.6, delay: i * 0.08 }}
                    >
                      {kind === 'company' ? <Briefcase className="size-5 sm:size-6" /> : <School className="size-5 sm:size-6" />}
                    </motion.div>
                  </div>
                ))}
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-brand-50 p-3.5">
                  <span className="mt-0.5 size-4 shrink-0 rounded bg-brand-600" />
                  <div>
                    <p className="text-sm font-bold text-navy-900">{t('ausbildungPage.what.company')} · 3</p>
                    <p className="text-xs text-muted">{t('ausbildungPage.what.companyText')}</p>
                  </div>
                </div>
                <div className="flex gap-3 rounded-xl bg-surface p-3.5">
                  <span className="mt-0.5 size-4 shrink-0 rounded border-2 border-dashed border-navy-900/40" />
                  <div>
                    <p className="text-sm font-bold text-navy-900">{t('ausbildungPage.what.school')} · 2</p>
                    <p className="text-xs text-muted">{t('ausbildungPage.what.schoolText')}</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
                <Info className="mt-px size-3.5 shrink-0" /> {t('ausbildungPage.what.note')}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Professions & pay */}
      <section className="section bg-surface">
        <div className="container-x">
          <SectionHeading eyebrow={t('ausbildungPage.professions.eyebrow')} title={t('ausbildungPage.professions.title')} subtitle={t('ausbildungPage.professions.subtitle')} />
          <Reveal>
            <div className="card card-pad sm:p-8">
              <GroupedBars
                ariaLabel={t('ausbildungPage.professions.aria')}
                series={years}
                format={euro.fmt}
                groups={PAY.map((p) => ({
                  key: p.key,
                  label: t(`ausbildungPage.professions.items.${p.key}`),
                  values: p.values,
                }))}
              />
              <p className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-xs text-muted">
                <Info className="mt-px size-3.5 shrink-0" /> {t('visasPage.indicative')}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Requirements */}
      <section className="section bg-navy-950 text-white">
        <div className="container-x">
          <SectionHeading light eyebrow={t('ausbildungPage.reqs.eyebrow')} title={t('ausbildungPage.reqs.title')} />
          <Stagger className="grid-cards sm:grid-cols-2 lg:grid-cols-3">
            {reqs.map((r, i) => {
              const ReqIcon = REQ_ICONS[i] ?? HeartPulse;
              return (
                <StaggerItem key={r.title}>
                  <div className="flex h-full gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                      <ReqIcon className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-display font-bold">{r.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-white/65">{r.text}</p>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      {/* Year-by-year timeline */}
      <section className="section">
        <div className="container-x">
          <SectionHeading eyebrow={t('ausbildungPage.timeline.eyebrow')} title={t('ausbildungPage.timeline.title')} />
          <ol className="relative grid gap-0 lg:grid-cols-7 lg:gap-3">
            <span aria-hidden className="absolute top-5 right-[7%] left-[7%] hidden h-0.5 bg-gradient-to-r from-brand-200 via-brand-500 to-navy-900 lg:block" />
            <span aria-hidden className="absolute top-2 bottom-2 left-5 w-0.5 bg-gradient-to-b from-brand-200 via-brand-500 to-navy-900 lg:hidden" />
            {timeline.map((s, i) => {
              const during = i >= 3 && i <= 5;
              return (
                <motion.li
                  key={s.title}
                  className="relative flex gap-4 pb-6 lg:flex-col lg:items-center lg:gap-0 lg:pb-0 lg:text-center"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: i * 0.07 }}
                >
                  <span
                    className={clsx(
                      'relative z-10 grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold ring-4 ring-white',
                      during ? 'bg-brand-600 text-white' : i === timeline.length - 1 ? 'bg-navy-900 text-white' : 'bg-brand-100 text-brand-700',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 lg:mt-4">
                    <p className={clsx('text-[11px] font-bold tracking-wider uppercase', during ? 'text-brand-600' : 'text-muted')}>{s.when}</p>
                    <h3 className="mt-0.5 font-display font-bold text-navy-900">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted lg:text-[0.8rem]">{s.text}</p>
                  </div>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Ausbildung-specific FAQ */}
      <section className="section bg-surface">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading eyebrow={t('ausbildungPage.faq.eyebrow')} title={t('ausbildungPage.faq.title')} />
          </div>
          <Accordion items={faq} />
        </div>
      </section>

      {/* Related visa + service */}
      {(visa || service) && (
        <section className="section">
          <div className="container-x">
            <SectionHeading eyebrow={t('ausbildungPage.related.eyebrow')} title={t('ausbildungPage.related.title')} subtitle={t('ausbildungPage.related.subtitle')} />
            <div className="grid-cards mx-auto max-w-4xl sm:grid-cols-2">
              {visa && <VisaCard visa={visa} />}
              {service && <ServiceCard service={service} index={services.indexOf(service)} />}
            </div>
            <p className="mt-6 text-center text-sm">
              <Link to="/visas" className="font-semibold text-brand-600 hover:underline">
                {t('visas.all')}
              </Link>
            </p>
          </div>
        </section>
      )}

      <PageCta
        icon={<GraduationCap className="size-7" />}
        title={t('ausbildungPage.cta.title')}
        text={t('ausbildungPage.cta.text')}
        primary={{ to: '/register', label: t('ausbildungPage.cta.primary') }}
        secondary={{
          to: '/eligibility',
          label: t('ausbildungPage.cta.secondary'),
        }}
      />
    </>
  );
}
