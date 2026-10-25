import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, Percent, Wallet } from 'lucide-react';
import { PAYOUT_EVENTS, type CommissionType, type PayoutEvent } from '../types';

export interface TermsValue {
  commissionType: CommissionType;
  /** Euros (FIXED) or percent (PERCENT) as typed. */
  value: string;
  currency: string;
  payoutEvents: PayoutEvent[];
}

/** FIXED vs PERCENT and the payout events, explained in plain language. */
export const TermsFields = ({ value, onChange }: { value: TermsValue; onChange: (v: TermsValue) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const set = (patch: Partial<TermsValue>) => onChange({ ...value, ...patch });
  const toggle = (e: PayoutEvent) =>
    set({ payoutEvents: value.payoutEvents.includes(e) ? value.payoutEvents.filter((x) => x !== e) : PAYOUT_EVENTS.filter((x) => x === e || value.payoutEvents.includes(x)) });
  const types: { type: CommissionType; icon: typeof Wallet; label: string; help: string }[] = [
    { type: 'FIXED', icon: Wallet, label: t('agents.admin.terms.fixed'), help: t('agents.admin.terms.fixedHelp') },
    { type: 'PERCENT', icon: Percent, label: t('agents.admin.terms.percent'), help: t('agents.admin.terms.percentHelp') },
  ];
  const percentWithoutInvoice = value.commissionType === 'PERCENT' && !value.payoutEvents.includes('INVOICE_PAID');

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">{t('agents.admin.terms.type')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((o) => (
            <label
              key={o.type}
              className={clsx(
                'flex cursor-pointer gap-3 rounded-xl border p-3.5 transition',
                value.commissionType === o.type ? 'border-primary bg-primary/[0.04] ring-2 ring-focus/20' : 'border-line hover:border-line-strong',
              )}
            >
              <input type="radio" name={`${id}-type`} className="mt-1 accent-primary" checked={value.commissionType === o.type} onChange={() => set({ commissionType: o.type })} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <o.icon className="size-4 text-link" aria-hidden /> {o.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{o.help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-value`}>
            {value.commissionType === 'FIXED' ? t('agents.admin.terms.amount') : t('agents.admin.terms.rate')}
          </label>
          <div className="relative">
            <input
              id={`${id}-value`}
              className="input pr-14 tabular-nums"
              inputMode="decimal"
              value={value.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={value.commissionType === 'FIXED' ? '150' : '10'}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs font-semibold text-muted">
              {value.commissionType === 'FIXED' ? value.currency : '%'}
            </span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-cur`}>
            {t('agents.admin.terms.currency')}
          </label>
          <select id={`${id}-cur`} className="input" value={value.currency} onChange={(e) => set({ currency: e.target.value })}>
            {['EUR', 'AZN', 'USD'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">{t('agents.admin.terms.events')}</legend>
        <p className="mb-2 text-xs text-muted">{t('agents.admin.terms.eventsHelp')}</p>
        <div className="space-y-1.5">
          {PAYOUT_EVENTS.map((e) => (
            <label key={e} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 hover:border-line-strong">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={value.payoutEvents.includes(e)} onChange={() => toggle(e)} />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{t(`agents.events.${e}`)}</span>
                <span className="block text-xs text-muted">{t(`agents.eventsHelp.${e}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {percentWithoutInvoice && (
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-fg">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('agents.admin.terms.percentWarn')}
          </p>
        )}
      </fieldset>
    </div>
  );
};
