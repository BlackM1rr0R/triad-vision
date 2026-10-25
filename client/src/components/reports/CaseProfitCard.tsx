import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, Pencil, Plus, Save, Trash2, TrendingUp } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesReports } from '@/i18n/pagesReports';
import { Panel } from '@/components/admin/ui';
import { Modal } from '@/components/settlement/Modal';
import { useReportFormat } from './types';
import { COST_KEYS, MANUAL_CATEGORIES, type CaseCost, type CaseProfitResponse, type ManualCategory } from './profitTypes';

registerCopy(pagesReports);

/** Case page card (ADMIN+): revenue, costs by category, margin and manual costs ("Add cost"). */
export default function CaseProfitCard({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const f = useReportFormat();
  const [details, setDetails] = useState(false);
  const [edit, setEdit] = useState<CaseCost | 'new' | null>(null);
  const q = useQuery({ queryKey: ['case-profit', caseId], queryFn: async () => (await api.get<CaseProfitResponse>(`/admin/profitability/cases/${caseId}`)).data });
  if (!q.data?.profit) return null;
  const { profit: p, settings, costs } = q.data;
  const rate = settings.eurAzn;
  const usedCosts = COST_KEYS.filter((k) => p.costs[k]);
  const empty = p.revenue.total === 0 && p.costs.total === 0;

  return (
    <Panel
      title={t('profit.card.title')}
      icon={TrendingUp}
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit('new')}>
          <Plus className="size-4" /> {t('profit.card.addCost')}
        </button>
      }
    >
      {empty ? (
        <p className="text-sm text-muted">{t('profit.card.noData')}</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { k: 'revenue', v: p.revenue.total },
              { k: 'costs', v: p.costs.total },
              { k: 'margin', v: p.marginCents },
            ].map(({ k, v }) => (
              <div key={k} className="rounded-lg bg-sunken px-2 py-2.5">
                <dt className="text-[11px] text-muted">{t(`profit.card.${k}`)}</dt>
                <dd className={clsx('mt-0.5 text-sm font-bold tabular-nums', k === 'margin' && (v < 0 ? 'text-danger-fg' : 'text-success-fg'))}>{f.eur(v)}</dd>
                <dd className="text-[10px] text-muted tabular-nums">{f.azn(v, rate)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            {t('profit.kpi.marginPct')}: <strong className="text-ink">{f.pct(p.marginPct)}</strong> · {t('profit.rate', { rate: f.num(rate) })}
          </p>
          {usedCosts.length > 0 && (
            <ul className="space-y-1 text-sm">
              {usedCosts.map((k) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="text-muted">{t(`profit.costCats.${k}`)}</span>
                  <span className="tabular-nums">{f.eur(p.costs[k])}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="flex items-center gap-1 text-xs font-semibold text-link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            <ChevronDown className={clsx('size-3.5 transition', details && 'rotate-180')} /> {t('profit.card.lines')}
          </button>
          {details && (
            <ul className="space-y-1 text-xs">
              {p.lines.map((l, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-2 rounded-md bg-sunken px-2 py-1.5">
                  <span className="min-w-0">
                    <span className={clsx('font-semibold', l.kind === 'revenue' ? 'text-success-fg' : 'text-warning-fg')}>
                      {l.kind === 'revenue' ? t(`profit.sources.${l.source}`, { defaultValue: l.source }) : t(`profit.costCats.${l.category ?? 'OTHER'}`)}
                    </span>{' '}
                    · {l.ref}
                    {l.allocation && <span className="text-muted"> · {l.allocation === 'line' ? t('profit.card.alloc.line') : t('profit.card.alloc.split', { n: l.splitOver })}</span>}
                    {l.date && <span className="text-muted"> · {f.date(l.date)}</span>}
                  </span>
                  <span className="tabular-nums">
                    {l.currency !== 'EUR' && <span className="text-muted">{(l.amountCents / 100).toFixed(2)} {l.currency} → </span>}
                    {l.kind === 'cost' ? '−' : ''}
                    {f.eur(l.eurCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs font-semibold text-ink">{t('profit.card.manual')}</p>
        {costs.length === 0 ? (
          <p className="text-xs text-muted">{t('profit.card.noManual')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {costs.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {t(`profit.costCats.${c.category}`)}
                  {c.note && <span className="text-xs text-muted"> · {c.note}</span>}
                  {c.documentName && <span className="text-xs text-muted"> · {c.documentName}</span>}
                </span>
                <span className="text-xs whitespace-nowrap tabular-nums">
                  {(c.amountCents / 100).toFixed(2)} {c.currency}
                </span>
                <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" onClick={() => setEdit(c)} aria-label={t('profit.card.editCost')}>
                  <Pencil className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/profitability" className="mt-3 inline-block text-xs font-semibold text-link hover:underline">
          {t('profit.card.openOverview')}
        </Link>
      </div>
      {edit && <CostDialog caseId={caseId} cost={edit === 'new' ? null : edit} defaultRate={rate} documents={q.data.documents} onClose={() => setEdit(null)} />}
    </Panel>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

const CostDialog = ({ caseId, cost, defaultRate, documents, onClose }: { caseId: string; cost: CaseCost | null; defaultRate: number; documents: CaseProfitResponse['documents']; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    category: (cost?.category ?? 'COURIER') as ManualCategory,
    amount: cost ? (cost.amountCents / 100).toFixed(2) : '',
    currency: cost?.currency ?? 'EUR',
    fxRate: String(cost?.fxRate ?? defaultRate),
    incurredAt: cost?.incurredAt.slice(0, 10) ?? today(),
    note: cost?.note ?? '',
    documentId: cost?.documentId ?? '',
  });
  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['case-profit', caseId] });
    void qc.invalidateQueries({ queryKey: ['profitability'] });
    onClose();
  };
  const onError = (err: unknown) => toast.error(t(`reports.errors.${errorCode(err)}`, { defaultValue: t('reports.errors.generic') }));
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        category: form.category,
        amount: Number(form.amount.replace(',', '.')),
        currency: form.currency,
        fxRate: Number(form.fxRate.replace(',', '.')) || null,
        incurredAt: form.incurredAt,
        note: form.note || null,
        documentId: form.documentId || null,
      };
      return cost ? api.patch(`/admin/profitability/costs/${cost.id}`, body) : api.post(`/admin/profitability/cases/${caseId}/costs`, body);
    },
    onSuccess: () => done(t('profit.card.savedToast')),
    onError,
  });
  const remove = useMutation({ mutationFn: async () => api.delete(`/admin/profitability/costs/${cost!.id}`), onSuccess: () => done(t('profit.card.deletedToast')), onError });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <Modal title={cost ? t('profit.card.editCost') : t('profit.card.addCost')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="label">{t('profit.card.category')}</span>
          <select className="input" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value as ManualCategory }))}>
            {MANUAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`profit.costCats.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <label>
            <span className="label">{t('profit.card.amount')}</span>
            <input className="input" inputMode="decimal" value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} required />
          </label>
          <label>
            <span className="label">{t('profit.card.currency')}</span>
            <select className="input" value={form.currency} onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value as 'EUR' | 'AZN' }))}>
              <option value="EUR">EUR</option>
              <option value="AZN">AZN</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">{t('profit.card.date')}</span>
            <input type="date" className="input" value={form.incurredAt} onChange={(e) => setForm((s) => ({ ...s, incurredAt: e.target.value }))} required />
          </label>
          <label>
            <span className="label">{t('profit.card.fxRate')}</span>
            <input className="input" inputMode="decimal" value={form.fxRate} onChange={(e) => setForm((s) => ({ ...s, fxRate: e.target.value }))} />
          </label>
        </div>
        <p className="text-[11px] text-muted">{t('profit.card.fxHint')}</p>
        <label className="block">
          <span className="label">{t('profit.card.document')}</span>
          <select className="input" value={form.documentId} onChange={(e) => setForm((s) => ({ ...s, documentId: e.target.value }))}>
            <option value="">{t('profit.card.noDocument')}</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.originalName}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('profit.card.note')}</span>
          <textarea className="input" rows={2} maxLength={2000} value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} />
        </label>
        <div className="flex flex-wrap justify-between gap-2 pt-1">
          {cost ? (
            <button type="button" className="btn-secondary btn-sm" disabled={remove.isPending} onClick={() => window.confirm(t('profit.card.confirmDelete')) && remove.mutate()}>
              <Trash2 className="size-4" /> {t('profit.card.delete')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
              {t('profit.card.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              <Save className="size-4" /> {t('profit.card.save')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
