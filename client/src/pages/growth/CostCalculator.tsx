import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Info, Minus, PiggyBank, Plus, Receipt, Send, Wallet } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { CURRENCIES, fmtMoney, useCostConfig, type Money } from '@/components/marketing/api';
import { costInput, resolveCostChoices, useCostEstimate } from '@/lib/calculators/cost';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { leadContext, trackLead } from '@/lib/leadVisitor';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesMarketing);

const HERO = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=2000&q=70';

const Stepper = ({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: ReactNode }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong/80 bg-card text-ink hover:border-line-strong hover:bg-sunken disabled:opacity-40" aria-label={`${label} −1`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
          <Minus className="size-4" aria-hidden />
        </button>
        <input id={id} type="number" inputMode="numeric" className="input w-20 text-center tabular-nums" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Math.round(Number(e.target.value) || 0))))} />
        <button type="button" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line-strong/80 bg-card text-ink hover:border-line-strong hover:bg-sunken disabled:opacity-40" aria-label={`${label} +1`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
};

const YesNo = ({ legend, value, onChange, hint }: { legend: string; value: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) => {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <label
            key={String(v)}
            className={clsx(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
              value === v ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
            )}
          >
            <input type="radio" className="sr-only" name={name} checked={value === v} onChange={() => onChange(v)} />
            {v ? t('mk.common.yes') : t('mk.common.no')}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
};

/** "Get an exact offer" form: sends the visitor's inputs; the server recomputes and stores the estimate. */
const OfferForm = ({ input }: { input: Record<string, string | number> }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const { user } = useAuth();
  const id = useId();
  const [form, setForm] = useState(() => ({ name: user ? `${user.firstName} ${user.lastName}`.trim() : '', email: user?.email ?? '', phone: user?.phone ?? '', message: '', consent: false, website: '' }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.consent;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/growth/cost-calculator/offer', { ...form, locale: locale.slice(0, 2), input, ...leadContext() });
      setDone(true);
    } catch (err) {
      setError(errorCode(err) === 'TOO_MANY_REQUESTS' ? 'TOO_MANY_REQUESTS' : 'generic');
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <div className="text-center" role="status">
        <Success className="mx-auto w-32" />
        <h3 className="mt-3 font-display text-lg font-semibold text-ink">{t('mk.cost.offer.successTitle')}</h3>
        <p className="mt-1 text-sm text-muted">{t('mk.cost.offer.successText')}</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-3" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`} className="font-display text-lg font-semibold text-ink">
        {t('mk.cost.offer.title')}
      </h3>
      <p className="text-sm text-muted">{t('mk.cost.ctaText')}</p>
      <div>
        <label htmlFor={`${id}-n`} className="label">
          {t('mk.cost.offer.name')}
        </label>
        <input id={`${id}-n`} className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-e`} className="label">
            {t('mk.cost.offer.email')}
          </label>
          <input id={`${id}-e`} type="email" className="input" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-p`} className="label">
            {t('mk.cost.offer.phone')}
          </label>
          <input id={`${id}-p`} type="tel" className="input" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-m`} className="label">
          {t('mk.cost.offer.message')}
        </label>
        <textarea id={`${id}-m`} className="input resize-y" rows={3} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </div>
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
        <span>
          {t('mk.cost.offer.consent')}{' '}
          <Link to="/privacy" target="_blank" className="font-semibold text-link hover:underline">
            {t('mk.cost.offer.privacy')}
          </Link>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          {t(`mk.cost.offer.errors.${error}`)}
        </p>
      )}
      <button type="submit" className={buttonClass({ size: 'lg', block: true })} disabled={!ready || busy}>
        {busy ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('mk.cost.offer.submit')}
      </button>
    </form>
  );
};

/** /cost-calculator — itemised, indicative budget per visa category (fees: Admin → Sayt alətləri → Xərclər). */
export default function CostCalculator() {
  const { t } = useTranslation();
  const { tr, locale, date } = useL10n();
  usePageTitle(t('mk.cost.heroTitle'));
  const [params] = useSearchParams();
  const { data: config, isLoading } = useCostConfig();
  const [visaId, setVisaId] = useState<string | null>(null);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [documents, setDocuments] = useState<number | null>(null);
  const [apostilles, setApostilles] = useState<number | null>(null);
  const [recognition, setRecognition] = useState<boolean | null>(null);
  const [language, setLanguage] = useState<boolean | null>(null);
  const [showOffer, setShowOffer] = useState(false);

  const categories = config?.categories ?? [];
  useEffect(() => {
    if (visaId || !categories.length) return;
    const wanted = params.get('visa');
    const match = categories.find((c) => c.slug === wanted) ?? null;
    if (match) setVisaId(match.id);
  }, [categories, params, visaId]);
  const category = categories.find((c) => c.id === visaId) ?? null;
  const choices = { adults, children, documents, apostilles, recognition, language };
  const { documents: docs, apostilles: apos, recognition: rec, language: lang } = resolveCostChoices(category, choices);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const input = useMemo(() => costInput(category, choices), [category, adults, children, documents, apostilles, recognition, language]);
  const { data: est, isFetching } = useCostEstimate(input);
  // One "used the calculator" event per category the visitor looks at (lead scoring, consent only).
  useEffect(() => {
    if (category) trackLead('cost_calc');
  }, [category]);

  const eur = (m: Money) => (m[0] === m[1] ? t('mk.common.eur', { n: fmtMoney(m[0], locale) }) : t('mk.common.eurRange', { min: fmtMoney(m[0], locale), max: fmtMoney(m[1], locale) }));
  const approx = (key: 'oneTime' | 'refundable' | 'total') =>
    est
      ? t('mk.cost.approx', {
          list: CURRENCIES.filter((c) => (config?.rates[c] ?? 0) > 0)
            .map((c) => {
              const m = est.converted[key][c];
              return `${m[0] === m[1] ? fmtMoney(m[0], locale) : `${fmtMoney(m[0], locale)}–${fmtMoney(m[1], locale)}`} ${c}`;
            })
            .join(' · '),
        })
      : '';
  const qty = (key: string, n: number, unit: number | null) => {
    if (['visaFee', 'healthInsurance', 'flight'].includes(key) && n > 1) return t('mk.cost.qty.people', { n });
    if (['translation', 'apostille'].includes(key)) return `${t('mk.cost.qty.docs', { n })}${unit != null ? ` · ${t('mk.cost.qty.each', { price: t('mk.common.eur', { n: fmtMoney(unit, locale) }) })}` : ''}`;
    if (['healthInsurance', 'flight'].includes(key) && unit != null) return t('mk.cost.qty.each', { price: t('mk.common.eur', { n: fmtMoney(unit, locale) }) });
    return '';
  };

  return (
    <>
      <PageHero title={t('mk.cost.heroTitle')} subtitle={t('mk.cost.heroSubtitle')} image={HERO} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x">
          {isLoading ? (
            <Spinner />
          ) : !config?.enabled ? (
            <p className="card card-pad rounded-3xl text-center text-muted">{t('mk.cost.disabled')}</p>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
              <form className="card card-pad space-y-6 rounded-3xl" onSubmit={(e) => e.preventDefault()}>
                <h2 className="font-display text-lg font-semibold text-ink">{t('mk.cost.formTitle')}</h2>
                <fieldset>
                  <legend className="label">{t('mk.cost.visa')}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categories.map((c) => (
                      <label
                        key={c.id}
                        className={clsx(
                          'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                          visaId === c.id ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                        )}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name="visa"
                          checked={visaId === c.id}
                          onChange={() => {
                            setVisaId(c.id);
                            setDocuments(null);
                            setApostilles(null);
                            setRecognition(null);
                            setLanguage(null);
                          }}
                        />
                        <span>
                          {tr(c.title)} <span className="font-normal opacity-75">· {c.visaLabel}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Stepper label={t('mk.cost.adults')} value={adults} min={1} max={10} onChange={setAdults} />
                  <Stepper label={t('mk.cost.children')} value={children} min={0} max={10} onChange={setChildren} />
                  <Stepper label={t('mk.cost.documents')} value={docs} min={0} max={50} onChange={setDocuments} hint={category && documents === null ? t('mk.cost.defaultHint') : undefined} />
                  <Stepper label={t('mk.cost.apostilles')} value={apos} min={0} max={50} onChange={setApostilles} hint={category && apostilles === null ? t('mk.cost.defaultHint') : undefined} />
                </div>
                <YesNo legend={t('mk.cost.recognition')} value={rec} onChange={setRecognition} hint={category && recognition === null ? t('mk.cost.defaultHint') : undefined} />
                <YesNo legend={t('mk.cost.language')} value={lang} onChange={setLanguage} hint={category && language === null ? t('mk.cost.defaultHint') : undefined} />
              </form>

              <div className="space-y-5 lg:sticky lg:top-28" aria-live="polite">
                <div className="card card-pad rounded-3xl">
                  {!est || !category ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Info className="size-4 shrink-0" aria-hidden /> {t('mk.cost.pickVisa')}
                    </p>
                  ) : (
                    <div className={clsx('transition-opacity', isFetching && 'opacity-60')}>
                      <p className="eyebrow">{t('mk.cost.resultTitle')}</p>
                      <ul className="mt-4 divide-y divide-line">
                        {est.items
                          .filter((i) => !i.refundable)
                          .map((i) => (
                            <li key={i.key} className="flex items-start justify-between gap-3 py-2.5">
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold text-ink">{t(`mk.cost.items.${i.key}`)}</span>
                                {qty(i.key, i.qty, i.unitPrice) && <span className="block text-xs text-muted">{qty(i.key, i.qty, i.unitPrice)}</span>}
                              </span>
                              <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{eur(i.amount)}</span>
                            </li>
                          ))}
                      </ul>
                      <div className="mt-3 rounded-xl bg-sunken p-4">
                        <p className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                            <Receipt className="size-4 text-muted" aria-hidden /> {t('mk.cost.oneTime')}
                          </span>
                          <span className="font-display text-xl font-semibold text-ink tabular-nums">{eur(est.oneTime)}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted">{approx('oneTime')}</p>
                      </div>
                      {est.refundable[1] > 0 && (
                        <div className="mt-3 rounded-xl border border-success-border bg-success-bg p-4">
                          <p className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                              <PiggyBank className="size-4 text-success" aria-hidden /> {t('mk.cost.refundable')}
                            </span>
                            <span className="font-display text-lg font-semibold text-ink tabular-nums">{eur(est.refundable)}</span>
                          </p>
                          <p className="mt-1 text-xs text-muted">{t('mk.cost.refundableHint')}</p>
                          <p className="mt-1 text-xs text-muted">{approx('refundable')}</p>
                        </div>
                      )}
                      {est.refundable[1] > 0 && (
                        <p className="mt-3 flex items-center justify-between gap-3 px-1 text-sm">
                          <span className="flex items-center gap-2 font-semibold text-ink">
                            <Wallet className="size-4 text-muted" aria-hidden /> {t('mk.cost.total')}
                          </span>
                          <span className="font-semibold text-ink tabular-nums">{eur(est.total)}</span>
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-6">
                    {showOffer && input ? (
                      <OfferForm input={input} />
                    ) : (
                      <button type="button" className={buttonClass({ size: 'lg', block: true })} disabled={!category} onClick={() => setShowOffer(true)}>
                        {t('mk.cost.cta')}
                      </button>
                    )}
                  </div>
                </div>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {t('mk.cost.disclaimer')} {t('mk.cost.ratesHint', { date: config.ratesUpdatedAt ? t('mk.cost.ratesDate', { date: date(config.ratesUpdatedAt) }) : '' })}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
