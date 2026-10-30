import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, CheckCircle2, Clock, ListOrdered, MessageCircle, Phone, Puzzle, UserRound, Users } from 'lucide-react';
import clsx from 'clsx';
import { PageHero, PageHeroSkeleton } from '@/components/layout/PageHero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion';
import { ServiceCard, VisaCard } from '@/components/cards';
import { InquiryForm } from '@/components/InquiryForm';
import { Icon } from '@/components/ui/Icon';
import { buttonClass } from '@/components/ui/Button';
import { StepsTimeline } from '@/components/services/StepsTimeline';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { visasForService } from '@/components/visa/utils';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { useSiteContent } from '@/lib/content';
import type { Service } from '@/lib/types';
import NotFound from './NotFound';
import { sized } from '@/lib/img';
import { registerCopy } from '@/i18n';
import { pagesVisa } from '@/i18n/pagesVisa';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesVisa);

const Heading = ({ eyebrow, title }: { eyebrow?: string; title: string }) => (
  <Reveal y={20}>
    {eyebrow && <span className="eyebrow">{eyebrow}</span>}
    <h2 className="mt-2 mb-6 font-display text-2xl font-semibold text-ink sm:text-[1.75rem]">{title}</h2>
  </Reveal>
);

export default function ServiceDetail() {
  const { slug } = useParams();
  const { t, i18n } = useTranslation();
  const { tr, trList } = useL10n();
  const { data: content } = useSiteContent();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['service', slug],
    queryFn: async () => (await api.get<{ service: Service }>(`/public/services/${slug}`)).data.service,
    placeholderData: () => content?.services.find((s) => s.slug === slug),
  });
  usePageTitle(data ? tr(data.title) : t('nav.services'));

  if (isLoading) return <PageHeroSkeleton />;
  if (isError || !data) return <NotFound />;

  const all = content?.services ?? [];
  const others = all.filter((s) => s.id !== data.id).slice(0, 4);
  const visas = visasForService(data.slug, content?.visaCategories ?? []).slice(0, 3);
  const contact = content?.settings.contact;
  const audience = data.audience === 'company' ? t('svc.forCompany') : data.audience === 'candidate' ? t('svc.forCandidate') : t('svc.forAll');
  const steps = trList(data.steps);
  const duration = tr(data.duration);
  const forCompany = data.audience !== 'candidate';
  const forCandidate = data.audience !== 'company';

  const faqKey = `serviceDetail.faq.items.${data.slug}`;
  const ownFaq = i18n.exists(faqKey) ? (t(faqKey, { returnObjects: true }) as { q: string; a: string }[]) : [];
  const faq = [
    ...(duration
      ? [
          {
            q: t('serviceDetail.faq.durationQ'),
            a: t('serviceDetail.faq.durationA', { duration }),
          },
        ]
      : []),
    ...ownFaq,
  ];

  const groups: { key: string; show: boolean; icon: ReactNode }[] = [
    {
      key: 'company',
      show: forCompany,
      icon: <Building2 className="size-5" />,
    },
    {
      key: 'candidate',
      show: forCandidate,
      icon: <UserRound className="size-5" />,
    },
  ];

  return (
    <>
      <PageHero title={tr(data.title)} subtitle={tr(data.summary)} image={data.image.replace('w=1200', 'w=2000')} imageAlt={tr(data.title)} crumb={{ to: '/services', label: t('nav.services') }} morph={{ kind: 'service', id: data.slug }}>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)]">
            <Icon name={data.icon} className="size-4" /> {audience}
          </span>
          {duration && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)]">
              <Clock className="size-4 text-muted" /> {duration}
            </span>
          )}
        </div>
      </PageHero>

      <section className="section">
        <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
          <div className="min-w-0 space-y-12 sm:space-y-14">
            <div>
              <Heading title={t('serviceDetail.overview')} />
              <Reveal>
                <div className="prose-tv -mt-2 max-w-[70ch] text-base sm:text-lg">
                  {tr(data.body)
                    .split(/\n{2,}/)
                    .map((p) => (
                      <p key={p.slice(0, 24)}>{p}</p>
                    ))}
                </div>
              </Reveal>
            </div>

            {trList(data.features).length > 0 && (
              <div>
                <Heading title={t('svc.included')} />
                <Stagger className="grid gap-3 sm:grid-cols-2">
                  {trList(data.features).map((f) => (
                    <StaggerItem key={f}>
                      <div className="flex h-full items-start gap-3 rounded-2xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                        <span className="text-sm font-semibold text-ink">{f}</span>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            )}

            {steps.length > 0 && (
              <div>
                <Heading eyebrow={t('serviceDetail.steps.eyebrow')} title={t('serviceDetail.steps.title')} />
                <StepsTimeline steps={steps} duration={duration || undefined} />
              </div>
            )}

            <div>
              <Heading eyebrow={t('serviceDetail.audience.eyebrow')} title={t('serviceDetail.audience.title')} />
              <div className={clsx('grid gap-4', forCompany && forCandidate && 'md:grid-cols-2')}>
                {groups
                  .filter((g) => g.show)
                  .map((g) => (
                    <Reveal key={g.key} className="h-full">
                      <div className="h-full rounded-3xl border border-line bg-card p-6 shadow-[var(--tv-shadow-card)]">
                        <span className={clsx('grid size-11 place-items-center rounded-xl', g.key === 'company' ? 'chip-sky' : 'chip-peach')}>
                          {g.icon}
                        </span>
                        <h3 className="mt-4 font-display text-lg font-semibold text-ink">
                          {t(`serviceDetail.audience.${g.key}.title`)}
                        </h3>
                        <ul className="mt-3 space-y-2">
                          {(
                            t(`serviceDetail.audience.${g.key}.points`, {
                              returnObjects: true,
                            }) as string[]
                          ).map((p) => (
                            <li key={p} className="flex gap-2.5 text-sm text-ink">
                              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Reveal>
                  ))}
              </div>
            </div>

            {faq.length > 0 && (
              <div>
                <Heading eyebrow={t('serviceDetail.faq.eyebrow')} title={t('serviceDetail.faq.title')} />
                <Accordion items={faq} />
              </div>
            )}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
            <Reveal y={24}>
              <div className="card overflow-hidden">
                <img src={sized(data.image, 760)} alt={tr(data.title)} loading="lazy" decoding="async" width={760} height={300} className="h-40 w-full object-cover" />
                <div className="card-pad">
                  <h3 className="font-display text-lg font-semibold text-ink">{t('serviceDetail.side.title')}</h3>
                  <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <Users className="size-4 shrink-0 text-muted" aria-hidden />
                      <dt className="text-muted">{t('serviceDetail.side.audience')}</dt>
                      <dd className="ml-auto text-right font-semibold text-ink">{audience}</dd>
                    </div>
                    {duration && (
                      <div className="flex items-center gap-3 px-3.5 py-3">
                        <Clock className="size-4 shrink-0 text-muted" aria-hidden />
                        <dt className="text-muted">{t('serviceDetail.side.duration')}</dt>
                        <dd className="ml-auto text-right font-semibold text-ink">{duration}</dd>
                      </div>
                    )}
                    {steps.length > 0 && (
                      <div className="flex items-center gap-3 px-3.5 py-3">
                        <ListOrdered className="size-4 shrink-0 text-muted" aria-hidden />
                        <dt className="text-muted">{t('serviceDetail.side.steps')}</dt>
                        <dd className="ml-auto text-right font-semibold text-ink">
                          {t('serviceDetail.side.stepsCount', {
                            count: steps.length,
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-5 grid gap-2">
                    <a href="#inquiry" className={buttonClass({ size: 'lg', block: true })}>
                      {t('svc.getOffer')} <ArrowRight className="size-4" aria-hidden />
                    </a>
                    <Link to={data.audience === 'company' ? '/cooperation' : '/register'} className={buttonClass({ variant: 'outline', block: true })}>
                      {data.audience === 'company' ? t('nav.cooperation') : t('nav.apply')}
                    </Link>
                    {contact && (
                      <div className="grid grid-cols-2 gap-2">
                        <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className={buttonClass({ variant: 'secondary' })}>
                          <Phone className="size-4" /> {t('contact.phone')}
                        </a>
                        <a href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary' })}>
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </aside>
        </div>
      </section>

      <section id="inquiry" className="section-sm scroll-mt-24 bg-sunken">
        <div className="container-x">
          <div className="card mx-auto max-w-3xl rounded-3xl card-pad sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-ink">{t('serviceDetail.form.title')}</h2>
            <p className="mt-1.5 mb-6 max-w-[65ch] text-muted">{t('serviceDetail.form.text')}</p>
            <InquiryForm kind={data.audience === 'company' ? 'company' : 'contact'} />
          </div>
        </div>
      </section>

      {visas.length > 0 && (
        <section className="section">
          <div className="container-x">
            <div className="section-head">
              <span className="eyebrow">{t('serviceDetail.relatedVisas.eyebrow')}</span>
              <h2 className="h-section mt-2 text-ink">{t('serviceDetail.relatedVisas.title')}</h2>
            </div>
            <Stagger className="grid-cards cards-balanced sm:[--cols:2] lg:[--cols:3]">
              {visas.map((v) => (
                <StaggerItem key={v.id}>
                  <VisaCard visa={v} />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="section bg-sunken">
          <div className="container-x">
            <h2 className="h-section section-head text-ink">{t('serviceDetail.others')}</h2>
            <div className="mobile-rail cards-balanced sm:[--cols:2] lg:[--cols:4]">
              {others.map((s) => (
                <ServiceCard key={s.id} service={s} index={all.indexOf(s)} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className={clsx(others.length > 0 && 'pt-16 sm:pt-20 lg:pt-28')}>
        <PageCta
          icon={<Puzzle className="size-7" />}
          title={t('serviceDetail.cta.title')}
          text={t('serviceDetail.cta.text')}
          primary={{ to: '/contact', label: t('serviceDetail.cta.button') }}
          secondary={{ to: '/services', label: t('serviceDetail.cta.all') }}
        />
      </div>
    </>
  );
}
