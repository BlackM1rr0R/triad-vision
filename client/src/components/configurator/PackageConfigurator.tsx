import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Briefcase, Check, CheckCircle2, FileSignature, GraduationCap, Home, Languages, Minus, Plus, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesConfigurator } from '@/i18n/pagesConfigurator';
import { leadContext } from '@/lib/leadVisitor';
import { fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS } from '@/components/ui/status';

registerCopy(pagesConfigurator);

/** Shapes of /api/configurator and /api/company/configurator (server lib/packageConfigurator). */
const SERVICES = ['RECRUITMENT', 'RECOGNITION', 'VISA_DOCUMENTS', 'RELOCATION', 'LANGUAGE_COURSE', 'ONBOARDING'] as const;
type Service = (typeof SERVICES)[number];
type Unit = 'PERSON' | 'PIECE' | 'FLAT' | 'MONTH';

interface Option {
  catalogueId: string;
  name: string;
  unit: Unit;
  unitPriceCents: number | null;
  professions: string[];
  volumeTiers: { minQty: number; discountBp: number }[];
}
interface View {
  services: { service: Service; options: Option[]; priced: boolean }[];
  professions: { key: string; label: string }[];
  vat: { rate: number; smallBusiness: boolean };
  currency: string;
}
interface Price {
  workers: number;
  months: number;
  lines: { service: Service; profession: string | null; catalogueId: string | null; unit: Unit; quantity: number; unitPriceCents: number | null; totalCents: number | null; discountBp: number; discountCents: number; onRequest: boolean }[];
  totals: { subtotalCents: number; discountCents: number; netCents: number; vatCents: number; grossCents: number };
  vatRate: number;
  onRequest: boolean;
}
interface RequestRow {
  id: string;
  createdAt: string;
  workers: number | null;
  services: Service[];
  netCents: number | null;
  onRequest: boolean;
  state: 'IN_REVIEW' | 'OFFER' | 'CLOSED';
  quoteId: string | null;
  quoteNumber: string | null;
}

const SERVICE_ICON: Record<Service, typeof Users> = { RECRUITMENT: UserPlus, RECOGNITION: GraduationCap, VISA_DOCUMENTS: FileSignature, RELOCATION: Home, LANGUAGE_COURSE: Languages, ONBOARDING: Briefcase };
const INTL: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU', tr: 'tr-TR', uk: 'uk-UA' };
const MAX_WORKERS = 500;

const useMoney = () => {
  const { i18n } = useTranslation();
  const tag = INTL[i18n.language.slice(0, 2)] ?? 'de-DE';
  return useMemo(() => {
    const f = new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
    return (cents: number) => f.format(cents / 100);
  }, [tag]);
};

/** Debounced copy of a value (the live price is asked for once the user pauses). */
const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
};

const Stepper = ({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) => (
  <div className="inline-flex items-center rounded-xl border border-line-strong bg-card">
    <button type="button" className="grid size-11 place-items-center text-muted hover:text-ink disabled:opacity-40" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label={`${label} −`}>
      <Minus className="size-4" aria-hidden />
    </button>
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={MAX_WORKERS}
      className="w-14 border-0 bg-transparent text-center font-semibold tabular-nums focus:ring-0"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Math.min(MAX_WORKERS, Math.max(1, Math.round(Number(e.target.value) || 1))))}
    />
    <button type="button" className="grid size-11 place-items-center text-muted hover:text-ink disabled:opacity-40" onClick={() => onChange(Math.min(MAX_WORKERS, value + 1))} disabled={value >= MAX_WORKERS} aria-label={`${label} +`}>
      <Plus className="size-4" aria-hidden />
    </button>
  </div>
);

/** Portal: the company's earlier requests and whether the offer was sent. */
const CompanyRequestsList = () => {
  const { t } = useTranslation();
  const money = useMoney();
  const { data } = useQuery({ queryKey: ['company-configurator-requests'], queryFn: async () => (await api.get<{ items: RequestRow[] }>('/company/configurator/requests')).data.items });
  if (!data?.length) return null;
  return (
    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="type-section-title mb-4 text-ink">{t('packageConfigurator.requests.title')}</h2>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0">
              <span className="block font-semibold text-ink">
                {fmtDate(r.createdAt)} · {t('packageConfigurator.requests.summary', { count: r.workers ?? 0 })}
              </span>
              <span className="text-xs text-muted">
                {r.services.map((s) => t(`packageConfigurator.service.${s}.title`)).join(', ')}
                {r.netCents !== null && ` · ${money(r.netCents)}${r.onRequest ? ' +' : ''}`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={clsx('badge', r.state === 'OFFER' ? TONE_CLASS.success : r.state === 'IN_REVIEW' ? TONE_CLASS.info : TONE_CLASS.neutral)}>{t(`packageConfigurator.requests.state.${r.state}`)}</span>
              {r.quoteId && (
                <Link to={`/company/quotes/${r.quoteId}`} className="btn-ghost btn-sm">
                  {t('packageConfigurator.requests.open')} {r.quoteNumber && <span className="tabular-nums">({r.quoteNumber})</span>}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * Package configurator. `mode="public"` (for /for-employers): request with contact details → lead for staff.
 * `mode="company"` (company portal): request → lead + draft quote; the official PDF offer follows after staff review.
 * Every price comes from the server (quote catalogue); nothing is priced in the browser.
 */
export const PackageConfigurator = ({ mode }: { mode: 'public' | 'company' }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const money = useMoney();
  const lng = i18n.language.slice(0, 2);
  const base = mode === 'company' ? '/company/configurator' : '/configurator';

  const view = useQuery({
    queryKey: ['configurator-view', mode, lng],
    queryFn: async () => (await api.get<View>(base, { params: { lang: lng } })).data,
    staleTime: 60_000,
  });

  const [positions, setPositions] = useState<{ profession: string; count: number }[]>([{ profession: 'truck_driver', count: 3 }]);
  const [services, setServices] = useState<Service[]>(['RECRUITMENT', 'VISA_DOCUMENTS']);
  const [months, setMonths] = useState(3);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = useMemo(() => ({ positions, services: SERVICES.filter((s) => services.includes(s)), months }), [positions, services, months]);
  const debounced = useDebounced(config, 300);
  const price = useQuery({
    queryKey: ['configurator-price', mode, debounced],
    queryFn: async () => (await api.post<{ price: Price }>(`${base}/price`, { config: debounced })).data.price,
    enabled: !!view.data && debounced.services.length > 0,
    placeholderData: keepPreviousData,
  });

  const submit = useMutation({
    mutationFn: async (extra: Record<string, unknown>) => (await api.post(`${base}/requests`, { config, ...extra })).data,
    onSuccess: () => {
      setSent(true);
      setError(null);
      if (mode === 'company') void qc.invalidateQueries({ queryKey: ['company-configurator-requests'] });
    },
    onError: () => setError(t('packageConfigurator.error')),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!config.services.length) return;
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = mode === 'public' ? { locale: lng, ...leadContext() } : {};
    fd.forEach((v, k) => {
      if (typeof v === 'string' && v.trim()) body[k] = v.trim();
    });
    submit.mutate(body);
  };

  if (view.isLoading || !view.data) return <Spinner className="mx-auto my-10 size-7 text-primary" />;
  const v = view.data;
  const workers = positions.reduce((a, p) => a + p.count, 0);
  const used = new Set(positions.map((p) => p.profession));
  const toggle = (s: Service) => setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  const p = price.data;

  const optionPrice = (s: Service) => {
    const opts = v.services.find((x) => x.service === s)?.options ?? [];
    const priced = opts.filter((o) => o.unitPriceCents !== null);
    if (!priced.length) return t('packageConfigurator.onRequest');
    const min = priced.reduce((a, o) => (o.unitPriceCents! < a.unitPriceCents! ? o : a));
    const label = `${money(min.unitPriceCents!)} ${t(`packageConfigurator.unit.${min.unit}`)}`;
    return priced.length > 1 ? t('packageConfigurator.from', { price: label }) : label;
  };
  const tiers = (s: Service) => (v.services.find((x) => x.service === s)?.options ?? []).flatMap((o) => o.volumeTiers);

  if (sent) {
    return (
      <div role="status" className="card flex flex-col items-center p-8 text-center sm:p-12">
        <span className="grid size-16 place-items-center rounded-full bg-success-bg text-success-fg">
          <CheckCircle2 className="size-8" aria-hidden />
        </span>
        <p className="type-section-title mt-4 text-ink">{t('packageConfigurator.successTitle')}</p>
        <p className="mt-2 max-w-lg text-sm text-muted">{mode === 'company' ? t('packageConfigurator.successPortal') : t('packageConfigurator.successPublic')}</p>
        <button type="button" className="btn-ghost btn-sm mt-5" onClick={() => setSent(false)}>
          {t('packageConfigurator.again')}
        </button>
        {mode === 'company' && <CompanyRequestsList />}
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="card p-5 sm:p-6">
            <h3 className="type-card-title mb-4 text-ink">{t('packageConfigurator.steps.positions')}</h3>
            <ul className="space-y-3">
              {positions.map((pos, i) => (
                <li key={i} className="flex flex-wrap items-end gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="label">{t('packageConfigurator.profession')}</span>
                    <select className="input" value={pos.profession} onChange={(e) => setPositions((ps) => ps.map((x, j) => (j === i ? { ...x, profession: e.target.value } : x)))}>
                      {v.professions.map((pr) => (
                        <option key={pr.key} value={pr.key} disabled={pr.key !== pos.profession && used.has(pr.key)}>
                          {pr.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span className="label">{t('packageConfigurator.count')}</span>
                    <Stepper value={pos.count} label={t('packageConfigurator.count')} onChange={(n) => setPositions((ps) => ps.map((x, j) => (j === i ? { ...x, count: n } : x)))} />
                  </div>
                  {positions.length > 1 && (
                    <button type="button" className="grid size-11 place-items-center rounded-xl text-muted hover:bg-danger-bg hover:text-danger-fg" aria-label={t('packageConfigurator.removePosition')} onClick={() => setPositions((ps) => ps.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {positions.length < 10 && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    const next = v.professions.find((pr) => !used.has(pr.key));
                    if (next) setPositions((ps) => [...ps, { profession: next.key, count: 1 }]);
                  }}
                >
                  <Plus className="size-4" aria-hidden /> {t('packageConfigurator.addPosition')}
                </button>
              )}
              <span className="text-sm font-semibold text-ink">{t('packageConfigurator.workersTotal', { count: workers })}</span>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <h3 className="type-card-title mb-4 text-ink">{t('packageConfigurator.steps.services')}</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {SERVICES.map((s) => {
                const on = services.includes(s);
                const Icon = SERVICE_ICON[s];
                return (
                  <li key={s}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(s)}
                      className={clsx('flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors', on ? 'border-primary bg-primary/5' : 'border-line bg-card hover:border-line-strong')}
                    >
                      <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', on ? 'bg-primary text-primary-contrast' : 'bg-sunken text-ink')}>
                        {on ? <Check className="size-5" aria-hidden /> : <Icon className="size-5" aria-hidden />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{t(`packageConfigurator.service.${s}.title`)}</span>
                        <span className="mt-0.5 block text-xs text-muted">{t(`packageConfigurator.service.${s}.text`)}</span>
                        <span className="mt-1.5 block text-xs font-semibold text-ink tabular-nums">{optionPrice(s)}</span>
                        {tiers(s).map((tier) => (
                          <span key={`${tier.minQty}-${tier.discountBp}`} className="block text-[11px] text-success-fg">
                            {t('packageConfigurator.volume', { min: tier.minQty, pct: tier.discountBp / 100 })}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {(v.services.find((x) => x.service === 'ONBOARDING')?.options.some((o) => o.unit === 'MONTH') ?? false) && services.includes('ONBOARDING') && (
              <div className="mt-4">
                <span className="label">{t('packageConfigurator.months')}</span>
                <Stepper value={months} label={t('packageConfigurator.months')} onChange={(n) => setMonths(Math.min(24, n))} />
                <p className="mt-1 text-xs text-muted">{t('packageConfigurator.monthsHint')}</p>
              </div>
            )}
          </section>

          {mode === 'public' && (
            <section className="card grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <h3 className="type-card-title text-ink sm:col-span-2">{t('packageConfigurator.contactTitle')}</h3>
              {/* honeypot for bots */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <label>
                <span className="label">{t('packageConfigurator.companyName')} *</span>
                <input name="companyName" required minLength={2} maxLength={160} className="input" autoComplete="organization" />
              </label>
              <label>
                <span className="label">{t('packageConfigurator.contactName')} *</span>
                <input name="contactName" required minLength={2} maxLength={120} className="input" autoComplete="name" />
              </label>
              <label>
                <span className="label">{t('packageConfigurator.email')} *</span>
                <input name="email" type="email" required maxLength={200} className="input" autoComplete="email" />
              </label>
              <label>
                <span className="label">{t('packageConfigurator.phone')}</span>
                <input name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
              </label>
              <label className="sm:col-span-2">
                <span className="label">{t('packageConfigurator.message')}</span>
                <textarea name="message" rows={3} maxLength={3000} className="input resize-y" />
              </label>
              <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
                <input type="checkbox" required className="mt-0.5 size-4 accent-brand-600" />
                {t('packageConfigurator.privacy')}
              </label>
            </section>
          )}
          {mode === 'company' && (
            <section className="card p-5 sm:p-6">
              <label>
                <span className="label">{t('packageConfigurator.message')}</span>
                <textarea name="message" rows={3} maxLength={3000} className="input resize-y" />
              </label>
            </section>
          )}
        </div>

        <aside className="card p-5 sm:p-6 lg:sticky lg:top-28" aria-live="polite">
          <h3 className="type-card-title mb-4 flex items-center justify-between gap-2 text-ink">
            {t('packageConfigurator.steps.summary')}
            {price.isFetching && <span className="text-xs font-normal text-muted">{t('packageConfigurator.summary.updating')}</span>}
          </h3>
          {!config.services.length ? (
            <p className="text-sm text-muted">{t('packageConfigurator.summary.empty')}</p>
          ) : !p ? (
            <Spinner className="mx-auto size-6 text-primary" />
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                {p.lines.map((l, i) => (
                  <li key={`${l.service}-${l.profession ?? i}`} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 text-ink">
                      {t(`packageConfigurator.service.${l.service}.title`)}
                      {l.profession && <span className="text-muted"> · {v.professions.find((x) => x.key === l.profession)?.label ?? l.profession}</span>}
                      <span className="block text-xs text-muted tabular-nums">
                        {l.quantity} × {l.unitPriceCents !== null ? money(l.unitPriceCents) : '—'} {t(`packageConfigurator.unit.${l.unit}`)}
                      </span>
                    </span>
                    <span className={clsx('shrink-0 tabular-nums', l.onRequest ? 'text-xs text-muted italic' : 'font-semibold text-ink')}>{l.totalCents !== null ? money(l.totalCents) : t('packageConfigurator.onRequest')}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                {p.totals.discountCents > 0 && (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">{t('packageConfigurator.summary.subtotal')}</dt>
                      <dd className="tabular-nums">{money(p.totals.subtotalCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 text-success-fg">
                      <dt>{t('packageConfigurator.summary.discount')}</dt>
                      <dd className="tabular-nums">−{money(p.totals.discountCents)}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t('packageConfigurator.summary.net')}</dt>
                  <dd className="font-semibold tabular-nums">{money(p.totals.netCents)}</dd>
                </div>
                {!v.vat.smallBusiness && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('packageConfigurator.summary.vat', { rate: p.vatRate })}</dt>
                    <dd className="tabular-nums">{money(p.totals.vatCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-line pt-2 text-base">
                  <dt className="font-semibold text-ink">{t('packageConfigurator.summary.gross')}</dt>
                  <dd className="font-display text-xl font-semibold text-ink tabular-nums">{money(p.totals.grossCents)}</dd>
                </div>
              </dl>
              {v.vat.smallBusiness && <p className="mt-2 text-xs text-muted">{t('packageConfigurator.summary.smallBusiness')}</p>}
              {p.onRequest && <p className="mt-2 text-xs text-muted">{t('packageConfigurator.summary.onRequestNote')}</p>}
              <p className="mt-2 text-xs text-muted">{t('packageConfigurator.summary.indicative')}</p>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger-bg p-3 text-sm text-danger-fg">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-5 w-full" disabled={submit.isPending || !config.services.length}>
            {submit.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {submit.isPending ? t('packageConfigurator.sending') : t('packageConfigurator.cta')}
          </button>
        </aside>
      </form>
      {mode === 'company' && <CompanyRequestsList />}
    </div>
  );
};
