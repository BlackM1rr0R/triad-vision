import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Minus, ShieldCheck, Sparkles } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesPackages } from '@/i18n/pagesPackages';
import { pagesBilling } from '@/i18n/pagesBilling';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import { leadContext } from '@/lib/leadVisitor';
import type { L10n, L10nList } from '@/lib/types';
import { PageHero } from '@/components/layout/PageHero';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Modal } from '@/components/ui/Modal';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';

registerCopy(pagesPackages);
registerCopy(pagesBilling); // case status names in the payment schedule

const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
type VisaType = (typeof VISA_TYPES)[number];

export interface PublicPackage {
  id: string;
  slug: string;
  tier: 'BASIC' | 'STANDARD' | 'PREMIUM';
  visaTypes: VisaType[] | null;
  title: L10n;
  summary: L10n;
  features: L10nList;
  priceCents: number;
  currency: string;
  /** Base + optional fixed prices per currency (server billing/packagePrices.ts). */
  prices?: Partial<Record<string, number>>;
  installments: { label: L10n; percent: number; trigger: string }[];
  highlight: boolean;
}

const LOCALE_TAG: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };
/** Money in the site language's format with the currency symbol (₼ AZN, ₺ TRY, € EUR). */
const money = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat(LOCALE_TAG[currentSiteLocale()] ?? 'de-DE', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
/** Visitor currency by site language (az → AZN, tr → TRY, else EUR) where the package has a price in it, else the base price. */
const VISITOR_CURRENCY: Record<string, string> = { az: 'AZN', tr: 'TRY' };
const shownPrice = (p: Pick<PublicPackage, 'priceCents' | 'currency' | 'prices'>) => {
  const want = VISITOR_CURRENCY[currentSiteLocale()] ?? 'EUR';
  const v = p.prices?.[want];
  return v ? { cents: v, currency: want } : { cents: p.priceCents, currency: p.currency };
};
const priceText = (p: Pick<PublicPackage, 'priceCents' | 'currency' | 'prices'>) => {
  const x = shownPrice(p);
  return money(x.cents, x.currency);
};

/** "40 % bei Unterschrift" — one line of a package's payment schedule. */
export const useScheduleLine = () => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  return (i: { label: L10n; percent: number; trigger: string }) => {
    const when = i.trigger === 'ON_SIGN' ? t('pkgs.trigger.ON_SIGN') : t('pkgs.trigger.CASE_STATUS', { status: t(`bill.caseStatus.${i.trigger.replace(/^CASE_STATUS:/, '')}`) });
    const label = tr(i.label);
    return `${i.percent} %${label ? ` · ${label}` : ''} — ${when}`;
  };
};

/** Random 256-bit token (base64url): identifies the order for its status page and makes a double submit idempotent. */
const newToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Public /packages: Basic / Standard / Premium cards (filter by visa type), comparison, FAQ and the order form. */
export default function Packages() {
  const { t } = useTranslation();
  const { tr, trList } = useL10n();
  usePageTitle(t('pkgs.title'));
  const q = useQuery({
    queryKey: ['public-packages'],
    queryFn: async () => (await api.get<{ packages: PublicPackage[]; terms: { version: string } }>('/packages')).data,
    staleTime: 60_000,
  });
  const [visa, setVisa] = useState<VisaType | ''>('');
  const [ordering, setOrdering] = useState<PublicPackage | null>(null);
  const schedule = useScheduleLine();

  const all = q.data?.packages ?? [];
  const usedVisas = VISA_TYPES.filter((v) => all.some((p) => !p.visaTypes || p.visaTypes.includes(v)));
  const shown = all.filter((p) => !visa || !p.visaTypes || p.visaTypes.includes(visa));
  // Comparison rows: every distinct feature of the shown packages, in first-seen order.
  const features = useMemo(() => {
    const out: string[] = [];
    for (const p of shown) for (const f of trList(p.features)) if (!out.includes(f)) out.push(f);
    return out;
  }, [shown, trList]);

  return (
    <>
      <PageHero title={t('pkgs.title')} subtitle={t('pkgs.subtitle')} image="https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x">
          <SectionHeading
            eyebrow={t('pkgs.eyebrow')}
            title={t('pkgs.title')}
            action={
              usedVisas.length > 1 && (
                <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label={t('pkgs.filter')}>
                  {(['', ...usedVisas] as const).map((v) => (
                    <button
                      key={v || 'all'}
                      type="button"
                      aria-pressed={visa === v}
                      onClick={() => setVisa(v)}
                      className={clsx('h-11 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors', visa === v ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong')}
                    >
                      {v ? t(`pkgs.visaType.${v}`) : t('pkgs.all')}
                    </button>
                  ))}
                </div>
              )
            }
          />
          {q.isLoading ? (
            <PageLoader />
          ) : !shown.length ? (
            <div className="card mx-auto max-w-xl rounded-3xl p-8 text-center">
              <p className="text-muted">{t('pkgs.empty')}</p>
              <Link to="/booking" className={buttonClass({ className: 'mt-4' })}>
                {t('pkgs.book')}
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((p) => (
                <article key={p.id} className={clsx('card relative flex flex-col rounded-3xl p-6 sm:p-7', p.highlight && 'border-2 border-primary shadow-[var(--tv-shadow-raised)]')}>
                  {p.highlight && (
                    <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-highlight px-3 py-1 text-xs font-semibold text-highlight-contrast">
                      <Sparkles className="size-3.5" aria-hidden /> {t('pkgs.popular')}
                    </span>
                  )}
                  <p className="eyebrow">{t(`pkgs.tier.${p.tier}`)}</p>
                  <h2 className="type-subsection mt-1 text-ink">{tr(p.title)}</h2>
                  <p className="mt-2 text-sm text-muted">{tr(p.summary)}</p>
                  <p className="mt-5">
                    <span className="font-display text-4xl font-semibold text-ink">{priceText(p)}</span>{' '}
                    <span className="text-xs text-muted">
                      {t('pkgs.perCase')} · {t('pkgs.vat')}
                    </span>
                  </p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {trList(p.features).map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> <span className="text-ink">{f}</span>
                      </li>
                    ))}
                  </ul>
                  {p.installments.length > 0 && (
                    <div className="mt-5 rounded-xl bg-sunken p-3 text-xs text-ink">
                      <p className="mb-1 font-semibold">{t('pkgs.schedule')}</p>
                      <ul className="space-y-0.5">
                        {p.installments.map((i, k) => (
                          <li key={k}>{schedule(i)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <button type="button" className={buttonClass({ variant: p.highlight ? 'highlight' : 'outline', size: 'lg', block: true, className: 'mt-6' })} onClick={() => setOrdering(p)}>
                    {t('pkgs.order')}
                  </button>
                </article>
              ))}
            </div>
          )}
          <p className="mt-6 text-center text-xs text-muted">{t('pkgs.fees')}</p>
        </div>
      </section>

      {shown.length > 1 && features.length > 0 && (
        <section className="section bg-sunken" aria-labelledby="pkgs-compare">
          <div className="container-x">
            <h2 id="pkgs-compare" className="h-section mb-8 text-ink">
              {t('pkgs.compare')}
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="border-b border-line bg-sunken text-left text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">
                      {t('pkgs.feature')}
                    </th>
                    {shown.map((p) => (
                      <th key={p.id} scope="col" className="px-4 py-3 text-center font-semibold">
                        {tr(p.title)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {features.map((f) => (
                    <tr key={f}>
                      <th scope="row" className="px-4 py-2.5 text-left font-normal text-ink">
                        {f}
                      </th>
                      {shown.map((p) => (
                        <td key={p.id} className="px-4 py-2.5 text-center">
                          {trList(p.features).includes(f) ? <Check className="mx-auto size-4 text-success-fg" aria-label="✓" /> : <Minus className="mx-auto size-4 text-muted" aria-label="—" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                      {t('pkgs.status.price')}
                    </th>
                    {shown.map((p) => (
                      <td key={p.id} className="px-4 py-2.5 text-center font-semibold">
                        {priceText(p)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="pkgs-faq">
        <div className="container-x max-w-3xl">
          <h2 id="pkgs-faq" className="h-section mb-8 text-ink">
            {t('pkgs.faqTitle')}
          </h2>
          <div className="space-y-3">
            {(t('pkgs.faq', { returnObjects: true }) as { q: string; a: string }[]).map((f) => (
              <details key={f.q} className="card group rounded-2xl p-0">
                <summary className="flex min-h-14 cursor-pointer items-center px-5 py-4 font-semibold text-ink">{f.q}</summary>
                <p className="max-w-[68ch] px-5 pb-5 leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {ordering && <OrderForm pkg={ordering} termsVersion={q.data?.terms.version ?? ''} defaultVisa={visa || (ordering.visaTypes?.length === 1 ? ordering.visaTypes[0] : '')} onClose={() => setOrdering(null)} />}
    </>
  );
}

const errText = (err: unknown) => {
  const code = errorCode(err);
  const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } })?.response?.data?.issues?.[0]?.message;
  const key = code === 'VALIDATION' && issue ? issue : code;
  return i18n.exists(`pkgs.errors.${key}`) ? i18n.t(`pkgs.errors.${key}`) : i18n.t('pkgs.errors.default');
};

const OrderForm = ({ pkg, termsVersion, defaultVisa, onClose }: { pkg: PublicPackage; termsVersion: string; defaultVisa: VisaType | ''; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const [token] = useState(newToken);
  const [form, setForm] = useState({ name: '', email: '', phone: '', visaType: defaultVisa as string, profession: '', terms: false, privacy: false, website: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string; checked?: boolean; type?: string } }) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? !!e.target.checked : e.target.value }));
  const visas = pkg.visaTypes ?? VISA_TYPES;
  const m = useMutation({
    mutationFn: async () =>
      (
        await api.post('/packages/orders', {
          packageId: pkg.id,
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          visaType: form.visaType || null,
          profession: form.profession || null,
          locale: currentSiteLocale(),
          currency: shownPrice(pkg).currency,
          acceptTerms: form.terms,
          acceptPrivacy: form.privacy,
          token,
          website: form.website,
          ...leadContext(),
        })
      ).data,
    onSuccess: () => navigate(`/packages/order/${token}`),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!m.isPending) m.mutate();
  };
  return (
    <Modal
      open
      onClose={() => !m.isPending && onClose()}
      title={t('pkgs.form.title', { pkg: tr(pkg.title) })}
      size="md"
      as="form"
      onSubmit={submit}
      footer={
        <>
          <button type="button" className={buttonClass({ variant: 'secondary' })} onClick={onClose} disabled={m.isPending}>
            {t('pkgs.form.cancel')}
          </button>
          <button type="submit" className={buttonClass()} disabled={m.isPending || !form.terms || !form.privacy}>
            {m.isPending && <Spinner className="size-3.5" />}
            {t('pkgs.form.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-xl bg-sunken p-3 text-sm">
          <strong>{tr(pkg.title)}</strong> · {priceText(pkg)} ({t('pkgs.vat')})
        </p>
        <div>
          <label className="label" htmlFor="po-name">
            {t('pkgs.form.name')} *
          </label>
          <input id="po-name" className="input" required minLength={3} maxLength={160} autoComplete="name" value={form.name} onChange={set('name')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="po-email">
              {t('pkgs.form.email')} *
            </label>
            <input id="po-email" type="email" className="input" required maxLength={190} autoComplete="email" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="label" htmlFor="po-phone">
              {t('pkgs.form.phone')}
            </label>
            <input id="po-phone" type="tel" className="input" maxLength={40} autoComplete="tel" placeholder="+994…" value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="po-visa">
              {t('pkgs.form.visaType')}
            </label>
            <select id="po-visa" className="input" value={form.visaType} onChange={set('visaType')}>
              <option value="">—</option>
              {visas.map((v) => (
                <option key={v} value={v}>
                  {t(`pkgs.visaType.${v}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="po-prof">
              {t('pkgs.form.profession')}
            </label>
            <input id="po-prof" className="input" maxLength={120} value={form.profession} onChange={set('profession')} />
          </div>
        </div>
        {/* Honeypot: hidden from people and screen readers; bots fill it. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={form.website} onChange={set('website')} />
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" required checked={form.terms} onChange={set('terms')} className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span>
            <Trans i18nKey="pkgs.form.terms" values={{ version: termsVersion }} components={[<Link key="agb" to="/agb" target="_blank" rel="noopener" className="font-semibold text-link hover:underline" />]} />
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" required checked={form.privacy} onChange={set('privacy')} className="mt-0.5 size-4 shrink-0 accent-primary" />
          <span>
            <Trans i18nKey="pkgs.form.privacy" components={[<Link key="privacy" to="/privacy" target="_blank" rel="noopener" className="font-semibold text-link hover:underline" />]} />
          </span>
        </label>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="size-4 shrink-0 text-muted" aria-hidden /> {t('pkgs.form.note')}
        </p>
        {m.error && (
          <p className="text-sm text-danger-fg" role="alert">
            {errText(m.error)}
          </p>
        )}
      </div>
    </Modal>
  );
};
