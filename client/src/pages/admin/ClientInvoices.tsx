import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, Euro, FileText, Landmark, Plus, Receipt, Search, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBilling } from '@/i18n/pagesBilling';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { useNewParam } from '@/components/command/useNewParam';
import { InvoiceEditor, useBillingSettings } from '@/components/billing/InvoiceEditor';
import { InvoiceActionDialogs, type InvoiceAction } from '@/components/billing/Dialogs';
import { InvoiceRowActions } from '@/components/billing/CaseBillingPanel';
import {
  BILLING_KEY,
  INVOICE_STATUSES,
  STATUS_BADGE,
  billingErrText,
  fmtEur,
  fmtEurShort,
  type BillingSettings,
  type BillingTotals,
  type ClientInvoice,
  type InvoiceStatus,
} from '@/components/billing/api';

registerCopy(pagesBilling);

/** Admin → Maliyyə → Müştəri hesab-fakturaları: every client invoice (filters, totals, CSV) + billing settings. */
export default function AdminClientInvoices() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'list';
  const setTab = (v: 'list' | 'settings') => {
    const next = new URLSearchParams(params);
    if (v === 'settings') next.set('tab', 'settings');
    else next.delete('tab');
    setParams(next, { replace: true });
  };
  const [editing, setEditing] = useState<ClientInvoice | 'new' | null>(null);
  useNewParam(() => setEditing('new'));
  const settingsQ = useBillingSettings();

  return (
    <div>
      <PageHead
        title={t('admin.nav.clientInvoices')}
        subtitle={t('bill.admin.subtitle')}
        actions={
          tab === 'list' && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> {t('bill.admin.create')}
            </button>
          )
        }
      />
      <Tabs
        className="mb-5"
        label={t('bill.admin.tabs.list')}
        items={(['list', 'settings'] as const).map((v) => ({
          key: v,
          icon: v === 'list' ? Receipt : Settings2,
          label: (
            <>
              {t(`bill.admin.tabs.${v}`)}
              {v === 'settings' && (settingsQ.data?.legalMissing.length ?? 0) > 0 && <span className="size-2 rounded-full bg-warning" aria-hidden />}
            </>
          ),
        }))}
        value={tab}
        onChange={setTab}
      />
      {tab === 'list' ? <List onEdit={setEditing} /> : <SettingsTab />}
      {editing && <InvoiceEditor invoice={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const List = ({ onEdit }: { onEdit: (i: ClientInvoice) => void }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(h);
  }, [q]);
  const filters = { status: status || undefined, overdue: overdue ? '1' : undefined, from: from || undefined, to: to || undefined, q: debounced || undefined };
  const listQ = useQuery({
    queryKey: [...BILLING_KEY, 'list', filters],
    queryFn: async () => (await api.get<{ invoices: ClientInvoice[]; totals: BillingTotals & { count: number } }>('/admin/client-billing/invoices', { params: filters })).data,
    placeholderData: (prev) => prev,
  });
  const [action, setAction] = useState<InvoiceAction | null>(null);
  const totals = listQ.data?.totals;
  const csvHref = `/api/admin/client-billing/invoices.csv?${new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1])).toString()}`;

  return (
    <>
      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('bill.admin.tiles.open')} value={fmtEurShort(totals.openCents, totals.currency)} hint={t('bill.admin.countHint', { count: totals.count })} icon={Euro} />
          <StatTile label={t('bill.admin.tiles.overdue')} value={fmtEurShort(totals.overdueCents, totals.currency)} hint={t('bill.admin.countHint', { count: totals.overdueCount })} icon={AlertTriangle} tone={totals.overdueCount ? 'danger' : undefined} />
          <StatTile label={t('bill.admin.tiles.paid')} value={fmtEurShort(totals.paidCents, totals.currency)} icon={CheckCircle2} tone="good" />
          <StatTile label={t('bill.admin.tiles.drafts')} value={totals.draftCount} icon={FileText} />
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_auto]">
          <label className="relative">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('bill.admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <input type="date" className="input" aria-label={t('bill.admin.from')} title={t('bill.admin.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input" aria-label={t('bill.admin.to')} title={t('bill.admin.to')} value={to} onChange={(e) => setTo(e.target.value)} />
          <a href={csvHref} className="btn-secondary btn-sm self-center" download>
            <Download className="size-3.5" aria-hidden /> {t('bill.admin.export')}
          </a>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!status && !overdue} onClick={() => { setStatus(''); setOverdue(false); }}>
            {t('bill.admin.all')}
          </Chip>
          <Chip active={overdue} onClick={() => setOverdue((v) => !v)}>
            {t('bill.admin.overdueOnly')}
          </Chip>
          {INVOICE_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)}>
              {t(`bill.status.${s}`)}
            </Chip>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        <LoadingBlock />
      ) : listQ.error ? (
        <ErrorBlock error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : !listQ.data?.invoices.length ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={Receipt} title={t('bill.admin.empty')}>
            {t('bill.admin.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="hidden bg-surface text-left text-xs text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('bill.admin.cols.number')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('bill.admin.cols.client')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('bill.admin.cols.issued')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('bill.admin.cols.due')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('bill.admin.cols.amount')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('bill.admin.cols.open')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('bill.admin.cols.status')}</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">{t('bill.admin.more')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {listQ.data.invoices.map((inv) => (
                <tr key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:table-row md:p-0">
                  <td className="font-semibold text-navy-900 tabular-nums md:px-4 md:py-3">{inv.number ?? <span className="text-muted italic">{t('bill.admin.draftNo')}</span>}</td>
                  <td className="min-w-0 basis-full md:basis-auto md:px-4 md:py-3">
                    <span className="line-clamp-1 text-ink">{inv.clientName}</span>
                    {inv.caseId && inv.caseNumber && (
                      <Link to={`/admin/cases/${inv.caseId}?tab=finance`} className="text-xs text-brand-600 hover:underline">
                        {inv.caseNumber}
                      </Link>
                    )}
                  </td>
                  <td className="text-xs text-muted md:px-4 md:py-3 md:text-sm md:text-ink">{fmtDate(inv.issueDate)}</td>
                  <td className={clsx('text-xs md:px-4 md:py-3 md:text-sm', inv.status === 'OVERDUE' ? 'font-semibold text-danger' : 'text-muted md:text-ink')}>
                    <span className="md:hidden">→ </span>
                    {fmtDate(inv.dueDate)}
                  </td>
                  <td className="ml-auto font-semibold text-navy-900 tabular-nums md:ml-0 md:px-4 md:py-3 md:text-right">{fmtEur(inv.grossCents, inv.currency)}</td>
                  <td className="text-xs tabular-nums md:px-4 md:py-3 md:text-right md:text-sm">{inv.openCents ? fmtEur(inv.openCents, inv.currency) : '—'}</td>
                  <td className="md:px-4 md:py-3">
                    <span className={clsx('badge', STATUS_BADGE[inv.status])}>{t(`bill.status.${inv.status}`)}</span>
                  </td>
                  <td className="basis-full md:basis-auto md:px-3 md:py-2">
                    <InvoiceRowActions inv={inv} onEdit={onEdit} onAction={(kind) => setAction({ kind, invoice: inv, email: inv.clientEmail })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <InvoiceActionDialogs action={action} onClose={() => setAction(null)} />
    </>
  );
};

const SettingsTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useBillingSettings();
  const [form, setForm] = useState<BillingSettings | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(q.data.settings);
  }, [q.data, form]);
  const save = useMutation({
    mutationFn: async (value: BillingSettings) => (await api.put('/admin/client-billing/settings', { settings: value })).data,
    onSuccess: (data) => {
      qc.setQueryData([...BILLING_KEY, 'settings'], data);
      toast.success(t('bill.admin.toasts.settings'));
    },
    onError: (e) => toast.error(billingErrText(e)),
  });
  if (q.isLoading || (!form && !q.error)) return <LoadingBlock />;
  if (q.error || !q.data || !form) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const set = <K extends keyof BillingSettings>(k: K, v: BillingSettings[K]) => setForm({ ...form, [k]: v });
  const { seller, bank, legalMissing } = q.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Panel title={t('bill.admin.settings.vat')} icon={Euro}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="cbs-mode">
                {t('bill.admin.settings.vatMode')}
              </label>
              <select id="cbs-mode" className="input" value={form.vatMode} onChange={(e) => set('vatMode', e.target.value as BillingSettings['vatMode'])}>
                {(['STANDARD', 'SMALL_BUSINESS', 'EXEMPT'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`bill.admin.settings.vatModes.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cbs-rate">
                {t('bill.admin.settings.vatRate')}
              </label>
              <input id="cbs-rate" type="number" min={0} max={100} className="input" disabled={form.vatMode !== 'STANDARD'} value={form.vatRate} onChange={(e) => set('vatRate', Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="cbs-terms">
                {t('bill.admin.settings.terms')}
              </label>
              <input id="cbs-terms" type="number" min={0} max={120} className="input" value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Number(e.target.value))} />
            </div>
            {form.vatMode === 'EXEMPT' && (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="cbs-note">
                  {t('bill.admin.settings.exemptionNote')}
                </label>
                <textarea id="cbs-note" className="input resize-y" rows={2} maxLength={500} value={form.exemptionNote} onChange={(e) => set('exemptionNote', e.target.value)} />
              </div>
            )}
          </div>
        </Panel>
        <Panel title={t('bill.admin.settings.reminders')} icon={AlertTriangle}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cbs-r1">
                {t('bill.admin.settings.reminder1')}
              </label>
              <input id="cbs-r1" type="number" min={1} max={60} className="input" value={form.reminder1Days} onChange={(e) => set('reminder1Days', Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="cbs-r2">
                {t('bill.admin.settings.reminder2')}
              </label>
              <input id="cbs-r2" type="number" min={2} max={120} className="input" value={form.reminder2Days} onChange={(e) => set('reminder2Days', Number(e.target.value))} />
            </div>
            <p className="text-xs text-muted sm:col-span-2">{t('bill.admin.settings.reminderHint')}</p>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="cbs-footer">
                {t('bill.admin.settings.footer')}
              </label>
              <textarea id="cbs-footer" className="input resize-y" rows={2} maxLength={500} value={form.footer} onChange={(e) => set('footer', e.target.value)} />
            </div>
          </div>
        </Panel>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4" />}
            {t('bill.admin.settings.save')}
          </button>
        </div>
      </form>
      <aside className="space-y-4">
        <Panel title={t('bill.admin.settings.bank')} icon={Landmark}>
          <p className="mb-3 text-xs text-muted">{t('bill.admin.settings.bankHint')}</p>
          <p className="text-sm text-ink">
            {bank.accountHolder || '—'}
            <br />
            <span className="font-mono">{bank.iban || t('bill.admin.settings.noIban')}</span>
            {bank.bic && (
              <>
                <br />
                BIC {bank.bic}
              </>
            )}
          </p>
          <Link to="/admin/invoices?tab=settings" className="btn-white btn-sm mt-4 border border-line">
            <Settings2 className="size-3.5" aria-hidden /> {t('bill.admin.settings.openInvoiceSettings')}
          </Link>
        </Panel>
        <Panel title={legalMissing.length ? t('bill.admin.settings.legalMissing') : t('bill.admin.settings.legal')} icon={legalMissing.length ? AlertTriangle : FileText}>
          <address className="text-sm leading-relaxed text-ink not-italic">
            <strong className="text-navy-900">{seller.name || '—'}</strong>
            <br />
            {seller.street || '—'}
            <br />
            {seller.zipCity || '—'}
            {(seller.vatId || seller.taxNumber) && (
              <>
                <br />
                <span className="text-muted">{seller.vatId ? `USt-IdNr. ${seller.vatId}` : `St.-Nr. ${seller.taxNumber}`}</span>
              </>
            )}
          </address>
        </Panel>
      </aside>
    </div>
  );
};
