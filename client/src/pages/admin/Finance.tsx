import { useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Download, Filter, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesFinance } from '@/i18n/pagesFinance';
import { usePageTitle } from '@/lib/usePageTitle';
import { RequireAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { Chip, PageHead } from '@/components/admin/ui';
import { downloadBlob } from '@/components/cv/types';
import { PRESETS, presetRange, useFinanceFormat, type Preset } from '@/components/finance/format';
import { FinanceByType, FinanceCommissions, FinanceOverview, FinanceReceivables, FinanceStaff } from '@/components/finance/FinanceSections';

registerCopy(pagesFinance);

const TABS = [
  { to: '', key: 'overview' },
  { to: 'receivables', key: 'receivables' },
  { to: 'commissions', key: 'commissions' },
  { to: 'staff', key: 'staff' },
  { to: 'by-type', key: 'byType' },
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Admin: financial reports — /admin/finance/* (ADMIN and above; the API enforces it).
 * The period lives in the query string (?p=thisYear or ?p=custom&from=…&to=…) so it survives tab switches and reloads.
 */
export default function AdminFinance() {
  return (
    <RequireAuth roles={['ADMIN', 'SUPER_ADMIN']}>
      <FinancePage />
    </RequireAuth>
  );
}

function FinancePage() {
  const { t } = useTranslation();
  const f = useFinanceFormat();
  usePageTitle(t('finance.title'));
  const [params, setParams] = useSearchParams();
  const preset: Preset = (PRESETS as readonly string[]).includes(params.get('p') ?? '') ? (params.get('p') as Preset) : 'thisYear';
  const customFrom = params.get('from');
  const customTo = params.get('to');
  const range =
    preset === 'custom' && customFrom && customTo && ISO.test(customFrom) && ISO.test(customTo)
      ? { from: customFrom, to: customTo }
      : presetRange(preset === 'custom' ? 'thisYear' : preset);
  const [draft, setDraft] = useState(range);
  const [busy, setBusy] = useState(false);

  const choose = (p: Preset) => {
    const next = new URLSearchParams(params);
    next.set('p', p);
    if (p === 'custom') {
      next.set('from', range.from);
      next.set('to', range.to);
      setDraft(range);
    } else {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  const applyCustom = (e: FormEvent) => {
    e.preventDefault();
    if (!ISO.test(draft.from) || !ISO.test(draft.to)) return;
    const [from, to] = draft.from <= draft.to ? [draft.from, draft.to] : [draft.to, draft.from];
    setParams({ p: 'custom', from, to }, { replace: true });
  };

  const download = async () => {
    setBusy(true);
    try {
      const res = await api.get<Blob>('/admin/finance/export.xlsx', { params: range, responseType: 'blob' });
      downloadBlob(res.data, `Finanzbericht-${range.from}-${range.to}.xlsx`);
    } catch {
      toast.error(t('finance.downloadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const search = params.toString() ? `?${params.toString()}` : '';

  return (
    <div>
      <PageHead
        title={t('finance.title')}
        subtitle={t('finance.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => void download()} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Download className="size-3.5" aria-hidden />} {t('finance.download')}
          </button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-card p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('finance.period')}>
          {PRESETS.map((p) => (
            <Chip key={p} active={preset === p} onClick={() => choose(p)}>
              {t(`finance.presets.${p}`)}
            </Chip>
          ))}
        </div>
        <p className="text-sm font-medium text-navy-900 tabular-nums">{t('finance.rangeLabel', { from: f.day(range.from), to: f.day(range.to) })}</p>
      </div>

      {preset === 'custom' && (
        <form onSubmit={applyCustom} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-card p-3 sm:p-4">
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('finance.from')}</span>
            <input type="date" className="input" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} required />
          </label>
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="label">{t('finance.to')}</span>
            <input type="date" className="input" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} required />
          </label>
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto">
            <Filter className="size-4" aria-hidden /> {t('finance.apply')}
          </button>
        </form>
      )}

      <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label={t('finance.title')}>
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <NavLink
                to={{ pathname: tab.to ? `/admin/finance/${tab.to}` : '/admin/finance', search }}
                end
                className={({ isActive }) =>
                  clsx(
                    '-mb-px inline-flex min-h-10 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition',
                    isActive ? 'border-brand-600 text-navy-900' : 'border-transparent text-muted hover:text-navy-900',
                  )
                }
              >
                {t(`finance.tabs.${tab.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Routes>
        <Route index element={<FinanceOverview range={range} />} />
        <Route path="receivables" element={<FinanceReceivables range={range} />} />
        <Route path="commissions" element={<FinanceCommissions range={range} />} />
        <Route path="staff" element={<FinanceStaff range={range} />} />
        <Route path="by-type" element={<FinanceByType range={range} />} />
        <Route path="*" element={<Navigate to={{ pathname: '/admin/finance', search }} replace />} />
      </Routes>

      <p className="mt-8 flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('finance.definitions')}
      </p>
    </div>
  );
}
