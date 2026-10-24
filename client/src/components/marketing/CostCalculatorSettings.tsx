import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { LoadingBlock, Panel, Switch } from '@/components/admin/ui';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { CURRENCIES, type CostSettings, type Fees } from './api';

interface AdminCostResponse {
  settings: CostSettings;
  defaults: CostSettings;
  categories: { id: string; slug: string; title: L10n; visaLabel: string; configured: boolean }[];
  listPrices: { translation: number; apostille: number };
}

const MONEY_FIELDS: (keyof Fees)[] = ['visaFeeAdult', 'visaFeeChild', 'recognition', 'languageCourse', 'languageExam', 'blockedAccount', 'healthInsurance', 'flight', 'serviceFeeMin', 'serviceFeeMax'];
const COUNT_FIELDS: (keyof Fees)[] = ['translationDocs', 'apostilleDocs'];

const num = (s: string, max: number) => Math.max(0, Math.min(max, Math.round((Number(s) || 0) * 100) / 100));

/** Admin → Sayt alətləri → Xərclər: fees of the client cost calculator (Setting `costCalculator`). */
export const CostCalculatorSettings = ({ canEdit }: { canEdit: boolean }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin', 'cost-calculator'], queryFn: async () => (await api.get<AdminCostResponse>('/admin/marketing/cost-calculator')).data });
  const [s, setS] = useState<CostSettings | null>(null);
  const [slug, setSlug] = useState('');
  useEffect(() => {
    if (data && !s) setS(data.settings);
  }, [data, s]);
  const save = useMutation({
    mutationFn: (v: CostSettings) => api.put('/admin/marketing/cost-calculator', v),
    onSuccess: () => {
      toast.success(t('mk.common.saved'));
      void qc.invalidateQueries({ queryKey: ['admin', 'cost-calculator'] });
      void qc.invalidateQueries({ queryKey: ['growth'] });
    },
    onError: () => toast.error(t('mk.common.error')),
  });
  if (!data || !s) return <LoadingBlock />;
  const up = (patch: Partial<CostSettings>) => setS({ ...s, ...patch });
  const own = slug ? (s.categories[slug] ?? {}) : null;
  const setFee = (k: keyof Fees, v: number | boolean | undefined) => {
    if (!slug) {
      up({ defaults: { ...s.defaults, [k]: v } });
      return;
    }
    const next = { ...(s.categories[slug] ?? {}) } as Partial<Fees>;
    if (v === undefined) delete next[k];
    else (next as Record<string, unknown>)[k] = v;
    const categories = { ...s.categories };
    if (Object.keys(next).length) categories[slug] = next;
    else delete categories[slug];
    up({ categories });
  };
  const eff = (k: keyof Fees) => (own && own[k] !== undefined ? own[k] : s.defaults[k]);
  const invalid =
    s.defaults.serviceFeeMin > s.defaults.serviceFeeMax ||
    Object.values(s.categories).some((c) => (c.serviceFeeMin ?? s.defaults.serviceFeeMin) > (c.serviceFeeMax ?? s.defaults.serviceFeeMax));

  const feeInput = (k: keyof Fees, max: number, step: number) => {
    const inherited = !!own && own[k] === undefined;
    return (
      <label key={k} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-ink">
        <span>
          {t(`mk.cost.admin.fees.${k}`)}
          {inherited && <span className="ml-1.5 text-xs text-muted">({t('mk.cost.admin.inherit')})</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            className="input w-28 py-1.5 text-right tabular-nums"
            min={0}
            max={max}
            step={step}
            value={Number(eff(k))}
            disabled={!canEdit}
            onChange={(e) => setFee(k, num(e.target.value, max))}
          />
          {own && !inherited && (
            <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" disabled={!canEdit} onClick={() => setFee(k, undefined)}>
              {t('mk.cost.admin.inherit')}
            </button>
          )}
        </span>
      </label>
    );
  };

  return (
    <div className="space-y-5">
      <Panel title={t('mk.cost.admin.tab')} icon={Wallet} actions={<Switch checked={s.enabled} label={t('mk.cost.admin.enabled')} disabled={!canEdit} onChange={(v) => up({ enabled: v })} />}>
        <p className="mb-4 text-sm text-muted">{t('mk.cost.admin.intro')}</p>
        <label className="mb-4 block max-w-md">
          <span className="label">{t('mk.cost.admin.perCategory')}</span>
          <select className="input" value={slug} onChange={(e) => setSlug(e.target.value)}>
            <option value="">{t('mk.cost.admin.defaults')}</option>
            {data.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {tr(c.title)} · {c.visaLabel}
                {s.categories[c.slug] ? ` — ${t('mk.cost.admin.configured')}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-x-10 lg:grid-cols-2">
          <div className="divide-y divide-line">{MONEY_FIELDS.slice(0, 5).map((k) => feeInput(k, 1_000_000, 0.5))}</div>
          <div className="divide-y divide-line">
            {MONEY_FIELDS.slice(5).map((k) => feeInput(k, 1_000_000, 0.5))}
            {COUNT_FIELDS.map((k) => feeInput(k, 50, 1))}
            <label className="flex items-center justify-between gap-2 py-2 text-sm text-ink">
              <span>
                {t('mk.cost.admin.fees.recognitionDefault')}
                {own && own.recognitionDefault === undefined && <span className="ml-1.5 text-xs text-muted">({t('mk.cost.admin.inherit')})</span>}
              </span>
              <Switch checked={!!eff('recognitionDefault')} label={t('mk.cost.admin.fees.recognitionDefault')} disabled={!canEdit} onChange={(v) => setFee('recognitionDefault', v)} />
            </label>
          </div>
        </div>
        {slug && s.categories[slug] && canEdit && (
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => {
            const categories = { ...s.categories };
            delete categories[slug];
            up({ categories });
          }}>
            {t('mk.cost.admin.clearCategory')}
          </button>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('mk.cost.admin.prices')}>
          {(['translationPrice', 'apostillePrice'] as const).map((k) => {
            const list = k === 'translationPrice' ? data.listPrices.translation : data.listPrices.apostille;
            const fromList = s[k] === null;
            return (
              <div key={k} className="space-y-1.5 py-2">
                <p className="text-sm font-semibold text-ink">{t(`mk.cost.admin.${k}`)}</p>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={fromList} disabled={!canEdit} onChange={(e) => up({ [k]: e.target.checked ? null : list } as Partial<CostSettings>)} />
                  {t('mk.cost.admin.fromList', { price: t('mk.common.eur', { n: list }) })}
                </label>
                {!fromList && (
                  <input type="number" className="input w-28 py-1.5 text-right tabular-nums" min={0} step={0.5} value={s[k] ?? 0} disabled={!canEdit} onChange={(e) => up({ [k]: num(e.target.value, 100_000) } as Partial<CostSettings>)} />
                )}
              </div>
            );
          })}
          <label className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm text-ink">
            {t('mk.cost.admin.blockedAccountAmount')}
            <input type="number" className="input w-28 py-1.5 text-right tabular-nums" min={0} step={1} value={s.blockedAccountAmount} disabled={!canEdit} onChange={(e) => up({ blockedAccountAmount: num(e.target.value, 1_000_000) })} />
          </label>
        </Panel>
        <Panel title={t('mk.cost.admin.rates')}>
          <div className="divide-y divide-line">
            {CURRENCIES.map((c) => (
              <label key={c} className="flex items-center justify-between gap-2 py-2 text-sm text-ink">
                {c}
                <input type="number" className="input w-28 py-1.5 text-right tabular-nums" min={0} step={0.01} value={s.rates[c]} disabled={!canEdit} onChange={(e) => up({ rates: { ...s.rates, [c]: num(e.target.value, 1_000_000) } })} />
              </label>
            ))}
            <label className="flex items-center justify-between gap-2 py-2 text-sm text-ink">
              {t('mk.cost.admin.ratesUpdatedAt')}
              <input type="date" className="input w-44 py-1.5" value={s.ratesUpdatedAt} disabled={!canEdit} onChange={(e) => up({ ratesUpdatedAt: e.target.value })} />
            </label>
          </div>
        </Panel>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {invalid && <span className="text-xs text-danger">{t('mk.cost.admin.invalid')}</span>}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setS({ ...data.defaults })}>
            {t('mk.common.reset')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={invalid || save.isPending} onClick={() => save.mutate(s)}>
            {t('mk.common.save')}
          </button>
        </div>
      )}
    </div>
  );
};
