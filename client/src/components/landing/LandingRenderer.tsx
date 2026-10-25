import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import clsx from 'clsx';
import { ArrowRight, ChevronDown, Quote, Send } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { Markdown } from '@/components/ops/Markdown';
import { api, errorCode } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { sized } from '@/lib/img';
import {
  FORM_FIELDS,
  videoEmbedUrl,
  type FormConfig,
  type LandingSection,
  type ResolvedTestimonial,
  type SectionDataMap,
} from '@/components/marketing/api';

/**
 * Renders a landing page from its sections — the public /l/:slug page and the admin live preview use
 * this same component, so the preview is exactly what visitors get. The page has one language
 * (`locale`): fixed UI texts (form labels, consent) are taken in that language, not the site language.
 */

type Locale = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
const CHIPS = ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'];

const pick = (v: unknown, l: Locale) => {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  const s = o[l] ?? o.az ?? o.en ?? '';
  return typeof s === 'string' ? s : '';
};

interface Ctx {
  locale: Locale;
  preview: boolean;
  t: TFunction;
  testimonialPool?: Map<string, ResolvedTestimonial>;
}

/** CTA target: '#form' scrolls to the page form, '/path' is an in-app link, https opens normally. */
const CtaLink = ({ target, label, className, ctx }: { target: string; label: string; className: string; ctx: Ctx }) => {
  const content = (
    <>
      {label} <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
    </>
  );
  if (!target || target === '#form') {
    return (
      <a
        href="#form"
        className={className}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(ctx.preview ? 'lp-preview-form' : 'form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        {content}
      </a>
    );
  }
  if (target.startsWith('/')) {
    return (
      <Link to={target} className={className} onClick={(e) => ctx.preview && e.preventDefault()}>
        {content}
      </Link>
    );
  }
  return (
    <a href={target} target="_blank" rel="noreferrer" className={className} onClick={(e) => ctx.preview && e.preventDefault()}>
      {content}
    </a>
  );
};

const Heading = ({ title }: { title: string }) => (title ? <h2 className="h-section mb-8 text-center text-ink sm:mb-10">{title}</h2> : null);

const Hero = ({ d, ctx }: { d: SectionDataMap['hero']; ctx: Ctx }) => (
  <section className="hero-warm pt-28 pb-14 sm:pt-36 sm:pb-20 lg:pt-44">
    <div className={clsx('container-x grid items-center gap-10', d.image && 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
      <div className="min-w-0">
        <h1 className="max-w-3xl font-display text-3xl leading-tight font-semibold break-words text-ink sm:text-5xl">{d.title}</h1>
        {d.subtitle && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{d.subtitle}</p>}
        {d.ctaLabel && (
          <div className="mt-8">
            <CtaLink target={d.ctaTarget} label={d.ctaLabel} className={buttonClass({ variant: 'highlight', size: 'lg', className: 'group' })} ctx={ctx} />
          </div>
        )}
      </div>
      {d.image && (
        <img src={sized(d.image, 1200)} alt="" fetchPriority="high" decoding="async" className="hidden aspect-[4/3] w-full rounded-3xl object-cover shadow-[var(--tv-shadow-raised)] lg:block" />
      )}
    </div>
  </section>
);

const TextSection = ({ d }: { d: SectionDataMap['text'] }) => (
  <section className="section">
    <div className="container-x max-w-3xl">
      {d.title && <h2 className="h-section mb-6 text-ink">{d.title}</h2>}
      <Markdown source={d.body} className="text-base leading-relaxed text-ink" />
    </div>
  </section>
);

const Benefits = ({ d }: { d: SectionDataMap['benefits'] }) => (
  <section className="section bg-sunken">
    <div className="container-x">
      <Heading title={d.title} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {d.items.map((b, i) => (
          <li key={i} className="card card-pad">
            <span className={clsx('grid size-11 place-items-center rounded-xl', CHIPS[i % CHIPS.length])}>
              <Icon name={b.icon || 'BadgeCheck'} className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 type-card-title text-ink">{b.title}</h3>
            {b.text && <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

const Steps = ({ d }: { d: SectionDataMap['steps'] }) => (
  <section className="section">
    <div className="container-x max-w-4xl">
      <Heading title={d.title} />
      <ol className="space-y-4">
        {d.items.map((s, i) => (
          <li key={i} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary font-display text-base font-semibold text-primary-contrast" aria-hidden>
              {i + 1}
            </span>
            <div className="card card-pad flex-1">
              <h3 className="type-card-title text-ink">{s.title}</h3>
              {s.text && <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

const Faq = ({ d }: { d: SectionDataMap['faq'] }) => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="section bg-sunken">
      <div className="container-x max-w-3xl">
        <Heading title={d.title} />
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {d.items.map((f, i) => (
            <li key={i}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-semibold text-ink hover:bg-sunken" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                {f.q}
                <ChevronDown className={clsx('size-4 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} aria-hidden />
              </button>
              {open === i && <p className="px-5 pb-4 text-sm leading-relaxed whitespace-pre-line text-muted">{f.a}</p>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const Testimonials = ({ s, ctx }: { s: Extract<LandingSection, { type: 'testimonials' }>; ctx: Ctx }) => {
  const d = s.data;
  const resolved = Array.isArray(s.resolved)
    ? (s.resolved as ResolvedTestimonial[])
    : d.ids.map((id) => ctx.testimonialPool?.get(id)).filter((x): x is ResolvedTestimonial => !!x);
  const cards = [
    ...resolved.map((r) => ({ key: r.id, name: pick(r.author, ctx.locale), role: pick(r.role, ctx.locale), text: pick(r.quote, ctx.locale), photo: '' })),
    ...d.custom.map((c, i) => ({ key: `c${i}`, ...c })),
  ].filter((c) => c.text);
  if (!cards.length) return null;
  return (
    <section className="section">
      <div className="container-x">
        <Heading title={d.title} />
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <li key={c.key} className="card card-pad flex flex-col">
              <Quote className="size-6 text-highlight" aria-hidden />
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink">{c.text}</p>
              <p className="mt-4 flex items-center gap-3">
                {c.photo && <img src={sized(c.photo, 96)} alt="" className="size-10 rounded-full object-cover" loading="lazy" />}
                <span>
                  <span className="block text-sm font-semibold text-ink">{c.name}</span>
                  {c.role && <span className="block text-xs text-muted">{c.role}</span>}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const Stats = ({ d }: { d: SectionDataMap['stats'] }) => (
  <section className="section-sm">
    <div className="container-x">
      {d.title && <h2 className="h-section mb-8 text-center text-ink">{d.title}</h2>}
      <dl className="card grid grid-cols-2 gap-6 rounded-3xl p-6 text-center sm:p-10 lg:grid-cols-4">
        {d.items.map((s, i) => (
          <div key={i}>
            <dt className="sr-only">{s.label}</dt>
            <dd className="font-display text-3xl font-semibold text-ink sm:text-4xl">{s.value}</dd>
            <dd className="mt-1 text-sm text-muted">{s.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
);

const Video = ({ d }: { d: SectionDataMap['video'] }) => {
  const src = videoEmbedUrl(d.url);
  if (!src) return null;
  return (
    <section className="section">
      <div className="container-x max-w-4xl">
        <Heading title={d.title} />
        <div className="aspect-video overflow-hidden rounded-2xl border border-line bg-navy-950 shadow-[var(--tv-shadow-raised)]">
          <iframe src={src} title={d.title || 'Video'} className="size-full" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      </div>
    </section>
  );
};

const Cta = ({ d, ctx }: { d: SectionDataMap['cta']; ctx: Ctx }) => (
  <section className="pb-16 sm:pb-20">
    <div className="container-x">
      <div className="rounded-3xl bg-navy-900 px-6 py-10 text-white sm:px-12 sm:py-14">
        <h2 className="max-w-2xl font-display text-2xl font-semibold sm:text-3xl">{d.title}</h2>
        {d.text && <p className="mt-3 max-w-2xl text-white/75">{d.text}</p>}
        {d.label && (
          <div className="mt-6">
            <CtaLink target={d.target} label={d.label} className="btn-primary btn-lg group" ctx={ctx} />
          </div>
        )}
      </div>
    </div>
  </section>
);

const LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

/** The page form: fields, required rules and texts from the page's form config. */
export const LandingForm = ({ slug, config, d, ctx }: { slug: string; config: FormConfig; d: SectionDataMap['form']; ctx: Ctx }) => {
  const { t } = ctx;
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = FORM_FIELDS.filter((f) => config.fields[f].show);
  const company = config.kind === 'company';
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (ctx.preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { consent, website, ...leadContext() };
      for (const [k, v] of Object.entries(values)) if (v.trim()) body[k] = v.trim();
      await api.post(`/landing/${encodeURIComponent(slug)}/submit`, body);
      setDone(true);
    } catch (err) {
      const code = errorCode(err);
      setError(['TOO_MANY_REQUESTS', 'CONTACT_REQUIRED', 'FIELD_REQUIRED'].includes(code) ? code : 'generic');
    } finally {
      setBusy(false);
    }
  };

  const input = (f: (typeof FORM_FIELDS)[number] | 'companyName' | 'workersNeeded', required: boolean, wide = false): ReactNode => {
    const fid = `${id}-${f}`;
    const common = { id: fid, className: 'input', required, value: values[f] ?? '', disabled: ctx.preview };
    return (
      <div key={f} className={clsx(wide && 'sm:col-span-2')}>
        <label htmlFor={fid} className="label">
          {t(`mk.lp.fields.${f}`)} {required && <span aria-hidden>*</span>}
        </label>
        {f === 'message' ? (
          <textarea {...common} rows={4} maxLength={3000} className="input resize-y" onChange={(e) => set(f, e.target.value)} />
        ) : f === 'germanLevel' ? (
          <select {...common} onChange={(e) => set(f, e.target.value)}>
            <option value="">{t('mk.lp.select')}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`mk.lp.levels.${l}`)}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={f === 'email' ? 'email' : f === 'phone' ? 'tel' : f === 'workersNeeded' ? 'number' : 'text'}
            autoComplete={f === 'name' ? 'name' : f === 'email' ? 'email' : f === 'phone' ? 'tel' : f === 'country' ? 'country-name' : undefined}
            min={f === 'workersNeeded' ? 1 : undefined}
            maxLength={f === 'workersNeeded' ? undefined : 200}
            onChange={(e) => set(f, e.target.value)}
          />
        )}
      </div>
    );
  };

  return (
    <section id={ctx.preview ? 'lp-preview-form' : 'form'} className="section scroll-mt-24 bg-sunken">
      <div className="container-x max-w-2xl">
        <div className="card card-pad rounded-3xl">
          {done ? (
            <div className="py-6 text-center" role="status">
              <Success className="mx-auto w-36" />
              <p className="mt-4 text-lg font-semibold text-ink">{config.successText || t('mk.lp.success')}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-labelledby={`${id}-title`}>
              <div className="sm:col-span-2">
                <h2 id={`${id}-title`} className="type-subsection text-ink">
                  {d.title || t('mk.lp.formTitle')}
                </h2>
                {d.text && <p className="mt-1 text-sm text-muted">{d.text}</p>}
              </div>
              {/* honeypot for bots */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
              {company && input('companyName', false, true)}
              {shown.map((f) => input(f, config.fields[f].required, f === 'message' || f === 'name'))}
              {company && input('workersNeeded', false)}
              <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
                <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} disabled={ctx.preview} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  {t('mk.lp.consent')}{' '}
                  <Link to="/privacy" target="_blank" className="font-semibold text-link hover:underline">
                    {t('mk.lp.privacy')}
                  </Link>
                </span>
              </label>
              {error && (
                <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-fg sm:col-span-2">
                  {t(`mk.lp.errors.${error}`)}
                </p>
              )}
              <div className="sm:col-span-2">
                <button type="submit" className="btn-primary btn-lg w-full justify-center sm:w-auto" disabled={busy || ctx.preview}>
                  {busy ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
                  {busy ? t('mk.lp.sending') : config.submitLabel || t('mk.lp.submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export const LandingRenderer = ({
  slug,
  locale,
  sections,
  formConfig,
  preview = false,
  testimonialPool,
}: {
  slug: string;
  locale: Locale;
  sections: LandingSection[];
  formConfig: FormConfig;
  preview?: boolean;
  testimonialPool?: Map<string, ResolvedTestimonial>;
}) => {
  const { i18n } = useTranslation();
  const ctx: Ctx = { locale, preview, t: i18n.getFixedT(locale), testimonialPool };
  return (
    <div lang={locale}>
      {sections.map((s) => {
        switch (s.type) {
          case 'hero':
            return <Hero key={s.id} d={s.data} ctx={ctx} />;
          case 'text':
            return <TextSection key={s.id} d={s.data} />;
          case 'benefits':
            return <Benefits key={s.id} d={s.data} />;
          case 'steps':
            return <Steps key={s.id} d={s.data} />;
          case 'faq':
            return <Faq key={s.id} d={s.data} />;
          case 'testimonials':
            return <Testimonials key={s.id} s={s} ctx={ctx} />;
          case 'stats':
            return <Stats key={s.id} d={s.data} />;
          case 'video':
            return <Video key={s.id} d={s.data} />;
          case 'cta':
            return <Cta key={s.id} d={s.data} ctx={ctx} />;
          case 'form':
            return <LandingForm key={s.id} slug={slug} config={formConfig} d={s.data} ctx={ctx} />;
          default:
            return null;
        }
      })}
    </div>
  );
};
