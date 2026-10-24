import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Calendar, Plus, Quote } from 'lucide-react';
import clsx from 'clsx';
import { TiltCard } from './motion';
import { Icon } from './ui/Icon';
import { useL10n } from '@/lib/l10n';
import { sized, srcSet } from '@/lib/img';
import { useMorphSource } from '@/lib/viewTransition';
import type { Faq, Partner, PostSummary, Service, Testimonial, VisaCategory, VisaSample } from '@/lib/types';

export const VisaCard = ({ visa }: { visa: VisaCategory }) => {
  const { t } = useTranslation();
  const { tr, trList } = useL10n();
  // The image box and title morph into the detail page's hero (lib/viewTransition.ts).
  const morph = useMorphSource('visa', visa.slug);
  return (
    <TiltCard className="h-full rounded-2xl" max={6}>
      <Link
        ref={morph.ref}
        onClick={morph.onClick}
        to={`/visas/${visa.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_30px_-12px_rgba(11,31,68,0.18)] transition-shadow duration-500 hover:shadow-[0_30px_60px_-20px_rgba(21,101,232,0.45)]"
      >
        {/* The icon badge sits on the image edge, so it must live OUTSIDE the clipped image box. */}
        <div className="relative">
          <div {...morph.part('card')} className="relative aspect-[16/11] overflow-hidden">
            <img src={sized(visa.image, 640)} srcSet={srcSet(visa.image, [400, 640, 900])} sizes="(min-width:1280px) 300px, (min-width:640px) 45vw, 82vw" alt="" loading="lazy" decoding="async" className="size-full object-cover object-[center_35%] transition duration-[1.2s] ease-out group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-navy-950/60 via-transparent to-transparent" />
            <span className="absolute top-3 right-3 rounded-md bg-white/95 px-2 py-1 text-xs font-bold text-brand-700 shadow-sm">{visa.visaLabel}</span>
          </div>
          <span className="absolute bottom-0 left-5 z-10 grid size-14 translate-y-1/2 place-items-center rounded-full border-4 border-white bg-brand-600 text-white shadow-lg transition duration-500 group-hover:rotate-[360deg]">
            <Icon name={visa.icon} className="size-6" />
          </span>
        </div>
        <div className="flex flex-1 flex-col p-5 pt-10">
          <h3 {...morph.part('title')} className="w-fit text-lg font-bold text-navy-900">
            {tr(visa.title)}
          </h3>
          <ul className="mt-3 flex-1 space-y-1.5">
            {trList(visa.items).map((item) => (
              <li key={item} className="flex gap-2 text-sm text-muted">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {item}
              </li>
            ))}
          </ul>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
            {t('common.learnMore')}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1.5" />
          </span>
        </div>
      </Link>
    </TiltCard>
  );
};

export const ServiceCard = ({ service, index }: { service: Service; index: number }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const audience = service.audience === 'company' ? t('svc.forCompany') : service.audience === 'candidate' ? t('svc.forCandidate') : t('svc.forAll');
  const morph = useMorphSource('service', service.slug);
  return (
    <TiltCard className="h-full rounded-2xl" max={5}>
      <Link
        ref={morph.ref}
        onClick={morph.onClick}
        {...morph.part('card')}
        to={`/services/${service.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white card-pad transition-shadow duration-500 hover:border-transparent hover:shadow-[0_30px_60px_-20px_rgba(21,101,232,0.45)]"
      >
        <div className="absolute inset-0 translate-y-full bg-gradient-to-br from-brand-600 to-navy-900 transition-transform duration-500 ease-out group-hover:translate-y-0" />
        <span aria-hidden className="pointer-events-none absolute top-4 right-5 font-display text-5xl leading-none font-black text-brand-100/70 transition group-hover:text-white/15">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="relative flex flex-1 flex-col">
          <span className="grid size-12 place-items-center rounded-xl bg-navy-900 text-white transition duration-500 group-hover:rotate-6 group-hover:bg-white/15">
            <Icon name={service.icon} className="size-6" />
          </span>
          <span className="mt-5 text-[0.7rem] font-bold tracking-widest text-brand-600 uppercase transition group-hover:text-brand-100">{audience}</span>
          <h3 {...morph.part('title')} className="mt-1.5 w-fit font-display text-lg leading-snug font-bold text-navy-900 transition group-hover:text-white">
            {tr(service.title)}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted transition group-hover:text-white/80">{tr(service.summary)}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition group-hover:text-white">
            {t('common.learnMore')} <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1.5" />
          </span>
        </div>
      </Link>
    </TiltCard>
  );
};

/** Partner logo; falls back to a styled wordmark when no logo image was uploaded. */
export const PartnerLogo = ({ partner, className }: { partner: Partner; className?: string }) => {
  const content = partner.logo ? (
    <img src={partner.logo} alt={partner.name} loading="lazy" decoding="async" className="max-h-10 max-w-[140px] object-contain grayscale transition duration-500 group-hover:grayscale-0" />
  ) : (
    <span className="font-display text-lg font-black tracking-tight text-navy-900/70 uppercase transition-colors duration-300 group-hover:text-brand-600">
      {partner.name}
    </span>
  );
  const cls = clsx(
    'group grid h-20 min-w-[170px] place-items-center rounded-xl border border-line bg-white px-6 transition duration-300 hover:-translate-y-1 hover:border-brand-400 hover:shadow-lg',
    className,
  );
  return partner.website ? (
    <a href={partner.website} target="_blank" rel="noreferrer" className={cls} title={partner.name}>
      {content}
    </a>
  ) : (
    <div className={cls} title={partner.name}>
      {content}
    </div>
  );
};

/** Visa-sticker style card with the holder's photo and personal data blurred (GDPR). */
export const VisaSticker = ({ sample }: { sample: VisaSample }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <motion.div whileHover={{ y: -8, rotate: -1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="w-[250px] shrink-0">
      <div className="relative overflow-hidden rounded-xl border border-[#c9b9d9] bg-gradient-to-br from-[#efe6f5] via-[#f7f1e8] to-[#e3eef7] p-3 shadow-lg">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(45deg,#b9a3cf_0_1px,transparent_1px_7px)]" />
        <div className="relative flex items-center justify-between text-[8px] font-bold tracking-wider text-[#5b3f7a]">
          <span>VISUM / VISA</span>
          <span className="rounded-sm bg-[#003399] px-1 text-[7px] text-de-gold">★ EU ★</span>
          <span>D</span>
        </div>
        <div className="relative mt-2 flex gap-3">
          <div className="h-24 w-20 shrink-0 overflow-hidden rounded-sm bg-slate-300">
            <img src={sized(sample.image, 200)} alt="" loading="lazy" decoding="async" className="size-full scale-125 object-cover blur-[6px] grayscale-[30%]" />
          </div>
          <div className="flex-1 space-y-1.5 pt-1">
            {[80, 60, 90, 50, 70, 40].map((w, i) => (
              <div key={i} className="h-1.5 rounded bg-[#5b3f7a]/20 shadow-[0_0_2px_1px_rgba(91,63,122,0.18)]" style={{ width: `${w}%` }} />
            ))}
            <span className="inline-block rounded bg-[#5b3f7a]/80 px-1.5 py-0.5 text-[9px] font-bold text-white">{sample.visaLabel}</span>
          </div>
        </div>
        <div className="relative mt-2 h-4 rounded-sm bg-[#5b3f7a]/15 font-mono text-[7px] leading-4 tracking-[0.2em] text-[#5b3f7a]/35 select-none">
          VDDEU&lt;&lt;XXXXXXXX&lt;&lt;XXXXXX&lt;&lt;&lt;
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5 px-1">
        <span className="flex h-3.5 w-5 flex-col overflow-hidden rounded-[2px] shadow">
          <span className="flex-1 bg-black" />
          <span className="flex-1 bg-de-red" />
          <span className="flex-1 bg-de-gold" />
        </span>
        <div>
          <p className="text-sm font-bold text-navy-900">{tr(sample.profession)}</p>
          <p className="text-xs text-muted">
            {sample.visaLabel} {t('samples.visa')} · {tr(sample.dateLabel)}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export const TestimonialCard = ({ item, dark = false }: { item: Testimonial; dark?: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (
    <figure className={clsx('relative flex h-full flex-col rounded-2xl p-7', dark ? 'glass text-white' : 'card')}>
      <Quote className={clsx('size-9', dark ? 'text-brand-400' : 'text-brand-500')} />
      <blockquote className={clsx('mt-4 flex-1 text-[0.97rem] leading-relaxed', dark ? 'text-white/85' : 'text-navy-900/85')}>„{tr(item.quote)}"</blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span className={clsx('grid size-10 place-items-center rounded-full font-display text-sm font-bold', dark ? 'bg-white/10' : 'bg-brand-100 text-brand-700')}>
          {tr(item.author).charAt(0)}
        </span>
        <span>
          <span className="block text-sm font-bold">{tr(item.author)}</span>
          <span className={clsx('text-xs', dark ? 'text-white/55' : 'text-muted')}>
            {tr(item.role)} · {item.kind === 'company' ? t('testimonials.company') : t('testimonials.candidate')}
          </span>
        </span>
      </figcaption>
    </figure>
  );
};

export const PostCard = ({ post }: { post: PostSummary }) => {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  return (
    <Link to={`/news/${post.slug}`} className="group card flex h-full flex-col overflow-hidden transition duration-500 hover:-translate-y-2 hover:shadow-2xl">
      <div className="relative h-52 overflow-hidden">
        <img src={sized(post.cover, 720)} srcSet={srcSet(post.cover, [480, 720, 1000])} sizes="(min-width:1024px) 400px, (min-width:768px) 45vw, 82vw" alt="" loading="lazy" decoding="async" className="size-full object-cover transition duration-[1.2s] group-hover:scale-110" />
        <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-navy-900">
          <Calendar className="size-3.5" /> {date(post.publishedAt)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg leading-snug font-bold break-words hyphens-auto text-navy-900 transition-colors group-hover:text-brand-600">{tr(post.title)}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{tr(post.excerpt)}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          {t('common.readMore')} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
};

export const FaqList = ({ items }: { items: Faq[] }) => {
  const { tr } = useL10n();
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  return (
    <div className="space-y-3">
      {items.map((f) => {
        const isOpen = open === f.id;
        return (
          <motion.div
            key={f.id}
            layout
            className={clsx('overflow-hidden rounded-2xl border transition-colors', isOpen ? 'border-brand-400 bg-white shadow-xl shadow-brand-600/10' : 'border-line bg-white hover:border-brand-200')}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : f.id)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="font-display text-base font-bold text-navy-900">{tr(f.question)}</span>
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                className={clsx('grid size-8 shrink-0 place-items-center rounded-full', isOpen ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}
              >
                <Plus className="size-4" />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }}>
                  <p className="px-6 pb-6 leading-relaxed text-muted">{tr(f.answer)}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
};
