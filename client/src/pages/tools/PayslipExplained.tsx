import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BadgeEuro, HeartHandshake, Info, Link2, Printer, RotateCcw } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesPayslip } from '@/i18n/pagesPayslip';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { formatEuro } from '@/lib/seoContent/types';
import { CURRENT_PARAMS, FEDERAL_STATES, STATE_NAMES, type FederalState, type TaxClass } from '@/lib/salary';
import {
  DEFAULT_PAYSLIP,
  PAYSLIP_GROSS_MAX,
  PAYSLIP_GROSS_MIN,
  buildPayslip,
  payslipFromParams,
  payslipToParams,
  type Payslip,
  type PayslipInput,
  type PayslipLine,
} from '@/lib/salary/payslip';

registerCopy(pagesPayslip);

type Lng = 'az' | 'de' | 'en' | 'ru' | 'tr' | 'uk';
const asLng = (l: string | undefined): Lng => (['az', 'de', 'en', 'ru', 'tr', 'uk'].includes((l ?? '').slice(0, 2)) ? ((l ?? '').slice(0, 2) as Lng) : 'az');

/** German figures on the payslip itself ("1.234,56 €"), as on a real Lohnabrechnung. */
const eur = (n: number) => formatEuro(n, 'de', true);
/** Rate in the visitor's style without trailing zeros: 9,3 % / 9.3 % / %9,3. Deterministic (no Intl). */
const pctIn = (rate: number, lng: Lng) => {
  const v = String(Math.round(rate * 100_000) / 1_000);
  const num = lng === 'en' ? v : v.replace('.', ',');
  return lng === 'tr' ? `%${num}` : `${num} %`;
};
const pctDe = (rate: number) => pctIn(rate, 'de');

const S = CURRENT_PARAMS.payroll.social;

/** One payslip row whose label is a button: hover, focus or tap shows the explanation (aria-describedby). */
const Row = ({ id, label, rate, amount, explanation, open, onOpen, onClose, onToggle, strong, minus }: {
  id: string;
  label: string;
  rate?: string | null;
  amount: string;
  explanation: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  strong?: boolean;
  minus?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <Fragment>
      <tr className={clsx('border-t border-line/70', open && 'bg-primary/5')} onMouseEnter={onOpen} onMouseLeave={onClose}>
        <td className="py-1.5 pr-2">
          <button
            type="button"
            className={clsx('w-full rounded text-left underline decoration-dotted decoration-from-font underline-offset-4 focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none', strong && 'font-bold')}
            aria-expanded={open}
            aria-describedby={`${id}-tip`}
            aria-label={t('payslip.sheet.explain', { label })}
            onFocus={onOpen}
            onBlur={onClose}
            onClick={onToggle}
          >
            {label}
          </button>
        </td>
        <td className="py-1.5 pr-2 text-right text-xs text-muted tabular-nums print:text-black">{rate ?? ''}</td>
        <td className={clsx('py-1.5 text-right tabular-nums', strong && 'font-bold')}>
          {minus ? '− ' : ''}
          {amount}
        </td>
      </tr>
      <tr className="print:hidden">
        <td colSpan={3} className="p-0">
          <div id={`${id}-tip`} role="tooltip" hidden={!open} className="mb-2 rounded-xl border border-primary/30 bg-card px-3 py-2 text-sm leading-snug text-ink shadow-[var(--tv-shadow-card)]">
            {explanation}
          </div>
        </td>
      </tr>
    </Fragment>
  );
};

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <tr>
      <th colSpan={3} scope="colgroup" className="pt-4 pb-1 text-left text-[11px] font-bold tracking-wide text-muted uppercase print:text-black">
        {title}
      </th>
    </tr>
    {children}
  </>
);

const Sheet = ({ slip, view }: { slip: Payslip; view: 'employee' | 'employer' }) => {
  const { t, i18n } = useTranslation();
  const lng = asLng(i18n.resolvedLanguage);
  const uid = useId().replace(/:/g, '');
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const shown = pinned ?? open;
  const r = slip.result;
  const rowProps = (key: string) => ({
    id: `${uid}-${key}`,
    open: shown === key,
    onOpen: () => setOpen(key),
    onClose: () => setOpen((o) => (o === key ? null : o)),
    onToggle: () => setPinned((p) => (p === key ? null : key)),
  });
  const explain = (l: PayslipLine) =>
    t(`payslip.lines.${l.key}`, {
      rate: l.rate != null ? pctIn(l.rate, lng) : '',
      share: pctIn(r.gross > 0 ? r.incomeTax / r.gross : 0, lng),
      health: formatEuro(S.bbgKvPvYear / 12, lng, true),
      pension: formatEuro(S.bbgRvAlvYear / 12, lng, true),
      interpolation: { escapeValue: false },
    });
  const line = (key: PayslipLine['key']) => slip.lines.find((l) => l.key === key)!;
  const L = (key: PayslipLine['key'], extra: { strong?: boolean; minus?: boolean; showRate?: boolean } = {}) => {
    const l = line(key);
    return <Row key={key} {...rowProps(key)} label={l.label} rate={extra.showRate && l.rate != null ? pctDe(l.rate) : null} amount={eur(l.amount)} explanation={explain(l)} strong={extra.strong} minus={extra.minus} />;
  };
  const name = `${slip.input.firstName || 'Max'} Mustermann`;
  const i = slip.input;

  return (
    <div id="payslip-sheet" className="rounded-2xl border border-line-strong bg-card p-4 font-mono text-[13px] text-ink shadow-[var(--tv-shadow-raised)] sm:p-6 print:border-black print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className="font-sans text-base font-bold">Musterfirma GmbH</p>
          <p className="text-xs text-muted print:text-black">Musterstraße 1 · 10115 Berlin</p>
        </div>
        <div className="text-right">
          <p className="font-sans text-base font-bold">Verdienstabrechnung</p>
          <p className="text-xs text-muted print:text-black">Abrechnungsmonat: Beispielmonat {slip.year}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted print:text-black">Name</dt>
          <dd className="font-semibold" translate="no">
            {name}
          </dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">Personal-Nr.</dt>
          <dd className="font-semibold">00042</dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">StKl. / Kinder</dt>
          <dd className="font-semibold">
            {['I', 'II', 'III', 'IV', 'V', 'VI'][i.taxClass - 1]} / {i.childless ? '0' : '1,0'}
          </dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">Konfession</dt>
          <dd className="font-semibold">{i.church ? 'rk' : '--'}</dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">Bundesland</dt>
          <dd className="font-semibold">{STATE_NAMES[i.state]}</dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">KV-Zusatzbeitrag</dt>
          <dd className="font-semibold">{pctDe(i.zusatzbeitrag)}</dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">PV-Satz AN</dt>
          <dd className="font-semibold">{pctDe(r.careRate)}</dd>
        </div>
        <div>
          <dt className="text-muted print:text-black">Krankenkasse</dt>
          <dd className="font-semibold">Muster-BKK</dd>
        </div>
      </dl>

      <table className="mt-2 w-full border-collapse">
        <thead className="sr-only">
          <tr>
            <th scope="col">Bezeichnung</th>
            <th scope="col">Satz</th>
            <th scope="col">Betrag</th>
          </tr>
        </thead>
        <tbody>
          <Section title="Bezüge">{L('brutto', { strong: true })}</Section>
          <Section title="Bemessungsgrundlagen">
            {L('steuerBrutto')}
            {L('svBrutto')}
          </Section>
          <Section title="Steuerrechtliche Abzüge">
            {L('lohnsteuer', { minus: true })}
            {L('soli', { minus: true })}
            {L('kirchensteuer', { minus: true, showRate: true })}
            <tr className="border-t border-ink/60">
              <td className="py-1 text-xs font-semibold">Summe Steuern</td>
              <td />
              <td className="py-1 text-right font-semibold tabular-nums">− {eur(slip.taxes)}</td>
            </tr>
          </Section>
          <Section title="Sozialversicherung (Arbeitnehmeranteil)">
            {L('kv', { minus: true, showRate: true })}
            {L('rv', { minus: true, showRate: true })}
            {L('av', { minus: true, showRate: true })}
            {L('pv', { minus: true, showRate: true })}
            <tr className="border-t border-ink/60">
              <td className="py-1 text-xs font-semibold">Summe Sozialversicherung</td>
              <td />
              <td className="py-1 text-right font-semibold tabular-nums">− {eur(slip.social)}</td>
            </tr>
          </Section>
          <Section title="Netto">
            {L('netto', { strong: true })}
            {L('auszahlung', { strong: true })}
          </Section>
          {view === 'employer' &&
            (slip.employer ? (
              <Section title="Arbeitgeberanteile (nicht vom Lohn abgezogen)">
                {slip.employer.map((e) => (
                  <Row
                    key={`ag-${e.key}`}
                    {...rowProps(`ag-${e.key}`)}
                    label={e.label}
                    rate={e.rate != null ? pctDe(e.rate) : null}
                    amount={eur(e.amount)}
                    strong={e.key === 'cost'}
                    explanation={t(`payslip.employer.${e.key}`, { rate: e.rate != null ? pctIn(e.rate, lng) : '', interpolation: { escapeValue: false } })}
                  />
                ))}
              </Section>
            ) : (
              <tr>
                <td colSpan={3} className="pt-3 font-sans text-sm text-muted">
                  {t('payslip.sheet.noEmployer')}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="mt-4 border-t border-line pt-2 font-sans text-[11px] leading-snug text-muted print:text-black">
        {t('payslip.sheet.example')} — {t('payslip.sheet.exampleNote')}
      </p>
    </div>
  );
};

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * /payslip-explained — German payslip explainer. Inputs live in the URL (shareable); every amount comes from the
 * site's payroll engine via lib/salary/payslip.ts (no own formulas). Server-rendered with the payslip of the URL
 * (default: 3,000 €, class I); explanations are disclosure tooltips that hydrate closed, as rendered.
 */
export default function PayslipExplainedPage() {
  const { t, i18n } = useTranslation();
  const lng = asLng(i18n.resolvedLanguage);
  usePageTitle(t('payslip.heroTitle'));
  const [params, setParams] = useSearchParams();
  const input = useMemo(() => payslipFromParams(params), [params]);
  const slip = useMemo(() => buildPayslip(input), [input]);
  const [view, setView] = useState<'employee' | 'employer'>(params.get('view') === 'employer' ? 'employer' : 'employee');
  const [grossText, setGrossText] = useState(String(input.gross));
  const [nameText, setNameText] = useState(input.firstName);
  useEffect(() => setGrossText((g) => (num(g) === input.gross ? g : String(input.gross))), [input.gross]);

  const update = (patch: Partial<PayslipInput>) => {
    const q = payslipToParams({ ...input, ...patch });
    const p = new URLSearchParams(q);
    if (view === 'employer') p.set('view', 'employer');
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const setViewAndUrl = (v: 'employee' | 'employer') => {
    setView(v);
    const p = new URLSearchParams(payslipToParams(input));
    if (v === 'employer') p.set('view', 'employer');
    setParams(p, { replace: true, preventScrollReset: true });
  };
  const share = async () => {
    const q = params.toString();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${localePath('/payslip-explained')}${q ? `?${q}` : ''}`);
      toast.success(t('payslip.sheet.copied'));
    } catch {
      toast.error(t('payslip.sheet.copyFailed'));
    }
  };

  return (
    <>
      {/* Print only the payslip (Print / PDF button and the browser's print). */}
      <style>{'@media print{body *{visibility:hidden!important}#payslip-sheet,#payslip-sheet *{visibility:visible!important}#payslip-sheet{position:absolute;left:0;top:0;width:100%;color:#000;background:#fff}}'}</style>
      <PageHero title={t('payslip.heroTitle')} subtitle={t('payslip.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 print:hidden" onSubmit={(e) => e.preventDefault()} aria-labelledby="ps-form-h">
            <h2 id="ps-form-h" className="font-display text-lg font-semibold text-ink">
              {t('payslip.form.title')}
            </h2>
            <div>
              <label htmlFor="ps-gross" className="label">
                {t('payslip.form.gross')}
              </label>
              <input
                id="ps-gross"
                className="input tabular-nums"
                inputMode="decimal"
                value={grossText}
                aria-describedby="ps-gross-hint"
                onChange={(e) => {
                  setGrossText(e.target.value);
                  const v = num(e.target.value);
                  if (Number.isFinite(v) && v >= PAYSLIP_GROSS_MIN && v <= PAYSLIP_GROSS_MAX) update({ gross: v });
                }}
                onBlur={() => setGrossText(String(input.gross))}
              />
              <input
                type="range"
                className="mt-2 w-full accent-[var(--tv-primary,currentColor)]"
                min={PAYSLIP_GROSS_MIN}
                max={8000}
                step={50}
                value={Math.min(8000, input.gross)}
                aria-label={t('payslip.form.gross')}
                onChange={(e) => update({ gross: Number(e.target.value) })}
              />
              <p id="ps-gross-hint" className="mt-1 text-[11px] text-muted">
                {t('payslip.form.grossHint', { min: PAYSLIP_GROSS_MIN, max: PAYSLIP_GROSS_MAX })}
              </p>
            </div>
            <div>
              <label htmlFor="ps-class" className="label">
                {t('payslip.form.taxClass')}
              </label>
              <select id="ps-class" className="input" value={input.taxClass} aria-describedby="ps-class-hint" onChange={(e) => update({ taxClass: Number(e.target.value) as TaxClass })}>
                {[1, 2, 3, 4, 5, 6].map((c) => (
                  <option key={c} value={c}>
                    {['I', 'II', 'III', 'IV', 'V', 'VI'][c - 1]}
                  </option>
                ))}
              </select>
              <p id="ps-class-hint" className="mt-1 text-[11px] leading-snug text-muted">
                {t('payslip.form.taxClassHint')}
              </p>
            </div>
            <fieldset>
              <legend className="label">{t('payslip.form.church')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['no', 'yes'] as const).map((v) => (
                  <label key={v} className={clsx('flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40', (v === 'yes') === input.church ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}>
                    <input type="radio" className="sr-only" name="ps-church" checked={(v === 'yes') === input.church} onChange={() => update({ church: v === 'yes' })} />
                    {t(`payslip.form.churchOptions.${v}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">{t('payslip.form.children')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['none', 'some'] as const).map((v) => (
                  <label key={v} className={clsx('flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40', (v === 'none') === input.childless ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}>
                    <input type="radio" className="sr-only" name="ps-kids" checked={(v === 'none') === input.childless} onChange={() => update({ childless: v === 'none' })} />
                    {t(`payslip.form.childrenOptions.${v}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor="ps-state" className="label">
                {t('payslip.form.state')}
              </label>
              <select id="ps-state" className="input" value={input.state} onChange={(e) => update({ state: e.target.value as FederalState })}>
                {FEDERAL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_NAMES[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ps-zb" className="label">
                {t('payslip.form.zusatz')}
              </label>
              <select id="ps-zb" className="input" value={String(Math.round(input.zusatzbeitrag * 1000))} aria-describedby="ps-zb-hint" onChange={(e) => update({ zusatzbeitrag: Number(e.target.value) / 1000 })}>
                {Array.from({ length: 41 }, (_, k) => k).map((k) => (
                  <option key={k} value={String(k)}>
                    {pctIn(k / 1000, lng)}
                  </option>
                ))}
              </select>
              <p id="ps-zb-hint" className="mt-1 text-[11px] leading-snug text-muted">
                {t('payslip.form.zusatzHint', { avg: pctIn(S.averageZusatzbeitrag, lng) })}
              </p>
            </div>
            <div>
              <label htmlFor="ps-name" className="label">
                {t('payslip.form.firstName')}
              </label>
              <input
                id="ps-name"
                className="input"
                autoComplete="given-name"
                maxLength={30}
                placeholder={t('payslip.form.firstNamePlaceholder')}
                value={nameText}
                onChange={(e) => {
                  setNameText(e.target.value);
                  update({ firstName: e.target.value });
                }}
              />
            </div>
            <button
              type="button"
              className={buttonClass({ variant: 'ghost', size: 'sm' })}
              onClick={() => {
                setNameText('');
                setGrossText(String(DEFAULT_PAYSLIP.gross));
                setView('employee');
                setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> {t('payslip.form.reset')}
            </button>
          </form>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <span className="rounded-full border border-warning-border bg-warning-bg px-2.5 py-1 text-xs font-semibold text-warning-fg">{t('payslip.sheet.example')}</span>
              <div role="radiogroup" aria-label={t('payslip.sheet.viewLabel')} className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-sunken p-1">
                {(['employee', 'employer'] as const).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={view === v} className={clsx('min-h-10 rounded-lg px-3 text-sm font-semibold', view === v ? 'bg-primary text-primary-contrast shadow-sm' : 'text-muted hover:text-ink')} onClick={() => setViewAndUrl(v)}>
                    {v === 'employee' ? t('payslip.sheet.viewEmployee') : t('payslip.sheet.viewEmployer')}
                  </button>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted print:hidden">
              <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('payslip.sheet.hint')}
            </p>
            <Sheet slip={slip} view={view} />
            {(slip.capped.health || slip.capped.pension) && <p className="text-xs text-muted">{t('payslip.capped')}</p>}
            <div className="flex flex-wrap gap-2 print:hidden">
              <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden /> {t('payslip.sheet.print')}
              </button>
              <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => void share()}>
                <Link2 className="size-4" aria-hidden /> {t('payslip.sheet.share')}
              </button>
              <Link to={`/salary-calculator?gross=${input.gross}&class=${input.taxClass}&state=${input.state}${input.church ? '&church=1' : ''}`} className={buttonClass({ variant: 'ghost' })}>
                <BadgeEuro className="size-4" aria-hidden /> {t('payslip.actions.salary')}
              </Link>
              <Link to="/life-in-germany" className={buttonClass({ variant: 'ghost' })}>
                <HeartHandshake className="size-4" aria-hidden /> {t('payslip.actions.life')}
              </Link>
            </div>
            <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg print:hidden" role="note">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('payslip.disclaimer')}
            </p>
          </div>
        </div>
      </section>
      <RelatedGuides tool="/payslip-explained" />
    </>
  );
}
