import { useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRight, Banknote, Calculator, Download, GraduationCap, HandCoins, Home, Hourglass, Landmark, Link2, ShoppingBasket, Wallet, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { useEurAzn } from '@/components/tools/AznEquivalent';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { decimal, Disclaimer, dmy, EstimateBadge, GlossaryLinks, NumField, Sources, ToolFaq, useFaq, useLng, useMoney } from '@/components/tools/calc/CalcShared';
import { registerCopy, toContentLocale } from '@/i18n';
import { pagesMoneyHome } from '@/i18n/pagesMoneyHome';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { CITIES } from '@/lib/cities/data';
import { quickNetMonthly } from '@/lib/salary';
import { aznText, LIFESTYLES, moneyHome, moneyHomeFromParams, moneyHomeToQuery, type MoneyHomeInput } from '@/lib/moneyHome/calc';
import { BAKU, MONEY_HOME_AS_OF, MONEY_HOME_SOURCES, TRANSFER_METHODS, WORLD_BANK_RPW, type BakuItem } from '@/lib/moneyHome/data';

registerCopy(pagesMoneyHome);

const PATH = '/send-money-home';
const BAKU_ICON: Record<BakuItem, LucideIcon> = { rent2: Home, pension: Hourglass, subsistence: ShoppingBasket, minWage: Banknote, avgWage: Wallet };

const Chips = <T extends string>({ legend, value, options, onChange, hint }: { legend: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; hint?: string }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className={clsx('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
    {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
  </fieldset>
);

/**
 * /send-money-home — "Money for family": net salary − living costs in the city (lib/cities) − own savings = what can
 * be sent home each month, the transfer cost (estimate, no provider named) and the amount in AZN at the CBAR rate,
 * translated into typical Azerbaijani figures (lib/moneyHome/data.ts, sourced). Everything lives in the URL
 * (?net&city&style&save&method; ?gross from the salary calculator is converted to net), so a result is shareable;
 * the downloadable card carries no personal data.
 */
export default function SendMoneyHomePage() {
  const { t } = useTranslation();
  usePageTitle(t('moneyHome.heroTitle'));
  const lng = useLng();
  const money = useMoney();
  const brand = useBrand();
  const faq = useFaq('moneyHome.faq');
  const [params, setParams] = useSearchParams();
  const input = useMemo(() => moneyHomeFromParams(params, (g) => quickNetMonthly(g)), [params]);
  const rateQ = useEurAzn();
  const rate = rateQ.data ?? null;
  const r = useMemo(() => moneyHome(input, rate?.rate ?? null), [input, rate]);
  const set = (patch: Partial<MoneyHomeInput>) => setParams(new URLSearchParams(moneyHomeToQuery({ ...input, ...patch })), { replace: true, preventScrollReset: true });
  const city = CITIES.find((c) => c.slug === input.city) ?? CITIES[0];
  const cityName = city.name[toContentLocale(lng)];

  const share = async () => {
    const ok = await copyLink(`${window.location.origin}${localePath(PATH)}?${moneyHomeToQuery(input)}`);
    if (ok) toast.success(t('moneyHome.actions.copied'));
    else toast.error(t('moneyHome.actions.copyFailed'));
  };
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('moneyHome.card.lead'),
        big: r.azn != null ? `≈ ${aznText(r.azn, lng)}` : money(r.send),
        sub: t('moneyHome.card.sub', { city: cityName, style: t(`moneyHome.styles.${input.style}`) }),
        lines: r.equivalents.slice(0, 4).map((e) => t(`moneyHome.baku.${e.key}.times`, { n: decimal(e.times, lng) })),
        footer: t('moneyHome.card.footer', { domain: brand.domain, path: PATH }),
        filename: `send-money-home-${input.city}`,
      });
    } catch {
      toast.error(t('moneyHome.actions.cardFailed'));
    }
  };

  const total = Math.max(1, r.net);
  const bar = (n: number) => `${Math.max(0, Math.min(100, (n / total) * 100)).toFixed(2)}%`;

  return (
    <>
      <PageHero title={t('moneyHome.heroTitle')} subtitle={t('moneyHome.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="mh-form-h">
            <h2 id="mh-form-h" className="font-display text-lg font-semibold text-ink">
              {t('moneyHome.form.title')}
            </h2>
            <NumField label={t('moneyHome.form.net')} value={input.net} onChange={(net) => set({ net: Math.round(net) })} max={30000} suffix="€" hint={t('moneyHome.form.netHint')} />
            <Link to="/salary-calculator" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline">
              <Calculator className="size-4" aria-hidden /> {t('moneyHome.form.toSalary')}
            </Link>
            <div>
              <label htmlFor="mh-city" className="label">
                {t('moneyHome.form.city')}
              </label>
              <select id="mh-city" className="input" value={input.city} onChange={(e) => set({ city: e.target.value })}>
                {CITIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name[toContentLocale(lng)]}
                  </option>
                ))}
              </select>
            </div>
            <Chips legend={t('moneyHome.form.style')} value={input.style} options={LIFESTYLES.map((s) => ({ value: s, label: t(`moneyHome.styles.${s}`) }))} onChange={(style) => set({ style })} hint={t(`moneyHome.styleHints.${input.style}`)} />
            <NumField label={t('moneyHome.form.save')} value={input.save} onChange={(save) => set({ save: Math.round(save) })} max={20000} suffix="€" hint={t('moneyHome.form.saveHint')} />
            <Chips legend={t('moneyHome.form.method')} value={input.method} options={TRANSFER_METHODS.map((m) => ({ value: m, label: t(`moneyHome.methods.${m}`) }))} onChange={(method) => set({ method })} />
          </form>

          <div className="min-w-0 space-y-4">
            <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite" aria-labelledby="mh-res-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="mh-res-h" className="text-sm font-semibold text-muted">
                  {t('moneyHome.result.lead')}
                </h2>
                <EstimateBadge />
              </div>
              <p className="mt-1 flex items-center gap-3 font-display text-4xl font-semibold text-ink sm:text-5xl">
                <HandCoins className="size-9 shrink-0 text-primary" aria-hidden />
                <AnimatedNumber value={r.send} format={(n) => money(Math.round(n))} />
              </p>
              {r.azn != null ? (
                <p className="mt-1 text-lg font-semibold text-ink tabular-nums">
                  ≈ <AnimatedNumber value={r.azn} format={(n) => aznText(n, lng)} /> <span className="text-sm font-normal text-muted">{t('moneyHome.result.perMonthArrives')}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">{t('moneyHome.result.noRate')}</p>
              )}
              {r.yearAzn != null && <p className="text-sm text-muted tabular-nums">{t('moneyHome.result.perYear', { amount: aznText(r.yearAzn, lng) })}</p>}

              {r.short > 0 && (
                <p className="mt-3 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg" role="note">
                  {t('moneyHome.result.short', { amount: money(r.short) })}
                </p>
              )}

              <div className="mt-5" aria-hidden>
                <div className="flex h-4 overflow-hidden rounded-full bg-sunken">
                  <span className="bg-ink/30 transition-[width] duration-700" style={{ width: bar(r.costs) }} />
                  <span className="bg-success-fg/60 transition-[width] duration-700" style={{ width: bar(Math.min(r.save, Math.max(0, r.net - r.costs))) }} />
                  <span className="bg-primary transition-[width] duration-700" style={{ width: bar(r.send) }} />
                </div>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {[
                  ['net', money(r.net), 'bg-sunken border border-line'],
                  ['costs', money(r.costs), 'bg-ink/30'],
                  ['save', money(r.save), 'bg-success-fg/60'],
                  ['send', money(r.send), 'bg-primary'],
                ].map(([k, v, dot]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted">
                      <span className={clsx('size-2.5 rounded-full', dot)} aria-hidden /> {t(`moneyHome.result.${k}`, { city: cityName })}
                    </dt>
                    <dd className="font-semibold text-ink tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-muted">{t('moneyHome.result.rent', { amount: money(r.rent) })}</p>
              {r.send > 0 && (
                <p className="mt-3 text-sm text-ink">
                  {t('moneyHome.result.fee', { method: t(`moneyHome.methods.${input.method}`), min: money(r.fee[0]), max: money(r.fee[1]) })}{' '}
                  {t('moneyHome.result.arrives', { min: money(r.arrives[0]), max: money(r.arrives[1]) })}
                </p>
              )}
              {rate && <p className="mt-1 text-xs text-muted">{t('moneyHome.result.rate', { rate: decimal(rate.rate, lng, 4), date: dmy(rate.date) })}</p>}

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" className={buttonClass()} onClick={() => void card()}>
                  <Download className="size-4" aria-hidden /> {t('moneyHome.actions.card')}
                </button>
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => void share()}>
                  <Link2 className="size-4" aria-hidden /> {t('moneyHome.actions.share')}
                </button>
                <Link to={`/five-years-in-germany?city=${input.city}&style=${input.style}`} className={buttonClass({ variant: 'ghost' })}>
                  <GraduationCap className="size-4" aria-hidden /> {t('moneyHome.actions.fiveYears')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </section>

            {r.azn != null && r.azn > 0 && (
              <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="mh-baku-h">
                <h2 id="mh-baku-h" className="font-display text-lg font-semibold text-ink">
                  {t('moneyHome.baku.title', { amount: aznText(r.azn, lng) })}
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {r.equivalents.map((e, i) => {
                    const Icon = BAKU_ICON[e.key];
                    const f = BAKU[e.key];
                    return (
                      <li key={e.key} className="motion-safe:animate-[page-in_0.6s_ease-out_both] flex gap-3 rounded-2xl border border-line bg-sunken p-3" style={{ animationDelay: `${i * 90}ms` }}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                          <Icon className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="font-display text-xl font-semibold text-ink tabular-nums">{t(`moneyHome.baku.${e.key}.times`, { n: decimal(e.times, lng) })}</p>
                          <p className="text-xs text-muted">
                            {t(`moneyHome.baku.${e.key}.what`, { amount: f.range ? `${aznText(f.range[0], lng)} – ${aznText(f.range[1], lng)}` : aznText(f.azn, lng), period: f.period })}
                            {f.estimate && <span className="ml-1 font-semibold text-warning-fg">· {t('moneyHome.baku.estimate')}</span>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted">{t('moneyHome.baku.note')}</p>
              </section>
            )}

            <section className="rounded-3xl border border-line bg-card p-5 sm:p-6" aria-labelledby="mh-transfer-h">
              <h2 id="mh-transfer-h" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Landmark className="size-5 text-primary" aria-hidden /> {t('moneyHome.transfer.title')}
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink">
                <li>{t('moneyHome.transfer.bank')}</li>
                <li>{t('moneyHome.transfer.online')}</li>
                <li>{t('moneyHome.transfer.margin')}</li>
                <li className="text-muted">{t('moneyHome.transfer.worldBank', { quarter: WORLD_BANK_RPW.quarter, banks: decimal(WORLD_BANK_RPW.banksPct, lng, 2), digital: decimal(WORLD_BANK_RPW.digitalPct, lng, 2), global: decimal(WORLD_BANK_RPW.globalPct, lng, 2) })}</li>
              </ul>
              <p className="mt-3 text-xs text-muted">{t('moneyHome.transfer.noAdvice')}</p>
            </section>

            <GlossaryLinks
              terms={[
                { slug: 'nettolohn', label: 'Nettolohn' },
                { slug: 'warmmiete', label: 'Warmmiete' },
                { slug: 'ueberweisung', label: 'Überweisung' },
                { slug: 'iban', label: 'IBAN' },
                { slug: 'bic', label: 'BIC' },
                { slug: 'girokonto', label: 'Girokonto' },
              ]}
            />
            <Sources checked={MONEY_HOME_AS_OF} items={MONEY_HOME_SOURCES} />
            <Disclaimer>{t('moneyHome.disclaimer')}</Disclaimer>
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool={PATH} />
    </>
  );
}
