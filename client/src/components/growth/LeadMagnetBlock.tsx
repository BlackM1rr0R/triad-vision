import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookOpen, CheckCircle2, Download, MailCheck } from 'lucide-react';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import { SITE_LANGUAGE_NAMES, type SiteLocale } from '@/lib/siteLocale';

registerCopy(pagesDiscover);

/** The starter e-book generated from the guides (admin: Lead magnets → "Generate starter e-book"). */
export const STARTER_EBOOK = 'germany-relocation-guide-2026';

export interface PublicLeadMagnet {
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  locales: string[];
  fileLocale: string | null;
}

export const useLeadMagnet = (slug: string) => {
  const lng = currentSiteLocale();
  return useQuery({
    queryKey: ['lead-magnet', slug, lng],
    queryFn: async () => (await api.get<{ item: PublicLeadMagnet }>(`/lead-magnets/${encodeURIComponent(slug)}`, { params: { lng } })).data.item,
    staleTime: 10 * 60_000,
    retry: false,
  });
};

/** Cover image of an e-book, or a drawn cover with its title. */
export const EbookCover = ({ magnet, className }: { magnet: Pick<PublicLeadMagnet, 'title' | 'coverUrl'>; className?: string }) =>
  magnet.coverUrl ? (
    <img src={magnet.coverUrl} alt="" loading="lazy" decoding="async" className={clsx('aspect-[3/4] w-full rounded-xl object-cover shadow-xl', className)} />
  ) : (
    <div className={clsx('relative flex aspect-[3/4] w-full flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 p-5 text-white shadow-xl', className)} aria-hidden>
      <span className="text-[10px] font-bold tracking-[0.25em] text-white/70">TRIAD VISION</span>
      <span className="font-display text-lg leading-tight font-extrabold text-balance">{magnet.title}</span>
      <BookOpen className="size-7 text-brand-300" />
    </div>
  );

/**
 * The e-mail form of a lead magnet: name, e-mail, optional phone and country, an unticked marketing consent and
 * the privacy notice. Sends the visitor id / utm only when analytics consent exists (lib/leadVisitor.ts).
 */
export const LeadMagnetForm = ({ magnet, from, dark = false }: { magnet: PublicLeadMagnet; from?: string; dark?: boolean }) => {
  const { t } = useTranslation();
  const id = useId();
  const [form, setForm] = useState({ name: '', email: '', phone: '', country: '', marketingConsent: false, website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      await api.post(`/lead-magnets/${encodeURIComponent(magnet.slug)}/request`, { ...form, lng: currentSiteLocale(), from, ...leadContext() });
      setState('done');
    } catch (err) {
      console.warn('[ebook] request failed', errorCode(err));
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className={clsx('rounded-2xl p-6 text-center', dark ? 'bg-white/10 text-white' : 'bg-emerald-50 text-emerald-900')} role="status">
        <MailCheck className="mx-auto size-10" aria-hidden />
        <p className="mt-3 font-display text-lg font-bold">{t('discover.ebook.successTitle')}</p>
        <p className="mt-1 text-sm">{t('discover.ebook.successText', { email: form.email })}</p>
      </div>
    );
  }

  const labelCls = clsx('label', dark && 'text-white/85');
  return (
    <form onSubmit={submit} className="space-y-3" noValidate={false}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelCls}>
            {t('discover.ebook.name')}
          </label>
          <input id={`${id}-name`} className="input" required minLength={2} maxLength={120} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={labelCls}>
            {t('discover.ebook.email')}
          </label>
          <input id={`${id}-email`} type="email" className="input" required maxLength={190} autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-phone`} className={labelCls}>
            {t('discover.ebook.phone')}
          </label>
          <input id={`${id}-phone`} type="tel" className="input" maxLength={40} autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-country`} className={labelCls}>
            {t('discover.ebook.country')}
          </label>
          <select id={`${id}-country`} className="input" value={form.country} onChange={(e) => set('country', e.target.value)}>
            <option value="">{t('discover.ebook.choose')}</option>
            {(['AZ', 'TR', 'UA', 'other'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`discover.ebook.countries.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => set('website', e.target.value)} />
      <label className={clsx('flex cursor-pointer items-start gap-3 text-sm leading-snug', dark ? 'text-white/85' : 'text-ink')}>
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={form.marketingConsent} onChange={(e) => set('marketingConsent', e.target.checked)} />
        <span>{t('discover.ebook.consent')}</span>
      </label>
      <p className={clsx('text-xs leading-relaxed', dark ? 'text-white/65' : 'text-muted')}>
        {t('discover.ebook.privacy')}{' '}
        <Link to="/privacy" target="_blank" className={clsx('font-semibold underline-offset-2 hover:underline', dark ? 'text-white' : 'text-brand-700')}>
          {t('discover.ebook.privacyLink')}
        </Link>
      </p>
      {state === 'error' && (
        <p className={clsx('rounded-lg p-3 text-sm', dark ? 'bg-red-500/20 text-white' : 'bg-red-50 text-red-800')} role="alert">
          {t('discover.ebook.error')}
        </p>
      )}
      <button type="submit" className={clsx('w-full', dark ? 'btn-white' : 'btn-primary')} disabled={state === 'sending'}>
        <Download className="size-4" aria-hidden /> {state === 'sending' ? t('discover.ebook.sending') : t('discover.ebook.submit')}
      </button>
      {magnet.fileLocale && magnet.fileLocale !== currentSiteLocale() && (
        <p className={clsx('text-center text-xs', dark ? 'text-white/60' : 'text-muted')}>{t('discover.ebook.fileLang', { lang: SITE_LANGUAGE_NAMES[magnet.fileLocale as SiteLocale] ?? magnet.fileLocale })}</p>
      )}
    </form>
  );
};

/**
 * Inline e-book block for other pages (guides, tools …): cover, title, short text and the form. Renders nothing
 * while loading, when the e-book does not exist / is unpublished or has no PDF yet.
 */
export const LeadMagnetBlock = ({ slug = STARTER_EBOOK, from, className }: { slug?: string; from?: string; className?: string }) => {
  const { t } = useTranslation();
  const { data } = useLeadMagnet(slug);
  if (!data || !data.fileLocale) return null;
  return (
    <section className={clsx('relative isolate overflow-hidden rounded-3xl bg-navy-950 p-6 text-white sm:p-8', className)} aria-labelledby={`lm-${slug}`}>
      <div className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-500),transparent)] opacity-30" aria-hidden />
      <div className="grid gap-6 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-8">
        <div className="mx-auto w-32 md:w-full">
          <EbookCover magnet={data} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.18em] text-brand-400 uppercase">{t('discover.ebook.free')}</p>
          <h2 id={`lm-${slug}`} className="mt-2 font-display text-xl font-bold text-balance sm:text-2xl">
            {data.title}
          </h2>
          {data.description && <p className="mt-2 text-sm leading-relaxed text-white/70">{data.description}</p>}
          <ul className="mt-3 space-y-1.5">
            {(t('discover.ebook.insideItems', { returnObjects: true }) as string[]).slice(0, 3).map((x) => (
              <li key={x} className="flex gap-2 text-sm text-white/80">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-400" aria-hidden /> {x}
              </li>
            ))}
          </ul>
          <div className="mt-5">
            <LeadMagnetForm magnet={data} from={from} dark />
          </div>
        </div>
      </div>
    </section>
  );
};
