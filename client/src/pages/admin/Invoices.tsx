import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  Euro,
  FileText,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { adminInvoicesCopy } from '@/i18n/pagesBooking';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile, Switch } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { errorMessage, fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { isMaskedValue, SensitiveValue } from '@/components/privacyTools/SensitiveValue';

registerCopy(adminInvoicesCopy);

// ─── Types / helpers ────────────────────────────────────────────────

type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
const STATUSES: InvoiceStatus[] = ['DRAFT', 'SENT', 'OVERDUE', 'PAID', 'CANCELLED'];

interface Line {
  description: string;
  quantity: number;
  unitPriceCents: number;
  servicePeriod?: { from?: string | null; to?: string | null } | null;
}
interface Invoice {
  id: string;
  number: string | null;
  companyId: string;
  issueDate: string;
  dueDate: string;
  items: Line[];
  netCents: number;
  vatRate: number;
  vatCents: number;
  grossCents: number;
  status: InvoiceStatus;
  sentAt: string | null;
  paidAt: string | null;
  note: string | null;
  company: { id: string; name: string; email: string | null; city: string | null; vatId: string | null };
}
interface Totals {
  openCents: number;
  openCount: number;
  overdueCents: number;
  overdueCount: number;
  paidThisMonthCents: number;
  paidThisMonthCount: number;
  draftCount: number;
}
interface CompanyOpt {
  id: string;
  name: string;
  legalForm: string | null;
  email: string | null;
  city: string | null;
  vatId: string | null;
}
interface Invoicing {
  accountHolder: string;
  iban: string;
  bic: string;
  bank: string;
  defaultVatRate: number;
  paymentTermsDays: number;
  smallBusiness: boolean;
  footer: string;
}
interface SettingsResponse {
  invoicing: Invoicing;
  seller: { name: string; street: string; zipCity: string; vatId: string; taxNumber: string; register: string };
  legalMissing: ('name' | 'address' | 'vatId')[];
}

const STATUS_TONE: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-brand-100 text-brand-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PAID: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-500 line-through',
};

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtEur = (cents: number) => eur.format(cents / 100);
/** Whole euros for the stat tiles (they must fit next to the icon on phones). */
const eurWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEurShort = (cents: number) => eurWhole.format(Math.round(cents / 100));

/** "1.234,56" / "1234.56" / "1234,5" → cents (NaN when not a number). */
const parseEuro = (s: string) => {
  const raw = s.replace(/[\s€]/g, '');
  if (!raw) return NaN;
  const normalised = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalised)) return NaN;
  return Math.round(Number(normalised) * 100);
};
const parseQty = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && Math.round(n * 100) === n * 100 ? n : NaN;
};
const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDaysIso = (iso: string, n: number) => isoDay(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000));

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`adminInvoices.errors.${code}`) ? i18n.t(`adminInvoices.errors.${code}`) : errorMessage(err, i18n.t('adminInvoices.errors.default'));
};

const KEY = ['admin-invoices'] as const;
const pdfUrl = (id: string) => `/api/admin/invoices/${id}/pdf`;

// ─── Page ───────────────────────────────────────────────────────────

export default function AdminInvoices() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'list';
  const setTab = (v: 'list' | 'settings') => {
    const next = new URLSearchParams(params);
    if (v === 'settings') next.set('tab', 'settings');
    else next.delete('tab');
    setParams(next, { replace: true });
  };
  const [editing, setEditing] = useState<Invoice | 'new' | null>(null);
  // ?edit=<id> (e.g. right after converting a quote) opens that draft in the editor.
  const editId = params.get('edit');
  useEffect(() => {
    if (!editId) return;
    void api
      .get<{ invoice: Invoice }>(`/admin/invoices/${editId}`)
      .then((r) => r.data.invoice.status === 'DRAFT' && setEditing(r.data.invoice))
      .catch(() => undefined)
      .finally(() => {
        const next = new URLSearchParams(window.location.search);
        next.delete('edit');
        setParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const settingsQ = useQuery({
    queryKey: ['admin-invoice-settings'],
    queryFn: async () => (await api.get<SettingsResponse>('/admin/invoices/settings')).data,
    staleTime: 60_000,
  });

  return (
    <div>
      <PageHead
        title={t('admin.nav.invoices')}
        subtitle={t('adminInvoices.subtitle')}
        actions={
          tab === 'list' && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> {t('adminInvoices.create')}
            </button>
          )
        }
      />

      <div className="mb-5 flex gap-1 border-b border-line" role="tablist">
        {(['list', 'settings'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={clsx(
              '-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition',
              tab === v ? 'border-brand-600 text-navy-900' : 'border-transparent text-muted hover:text-navy-900',
            )}
          >
            {v === 'list' ? <Receipt className="size-4" aria-hidden /> : <Settings2 className="size-4" aria-hidden />}
            {t(`adminInvoices.tabs.${v}`)}
            {v === 'settings' && (settingsQ.data?.legalMissing.length ?? 0) > 0 && <span className="size-2 rounded-full bg-amber-500" aria-hidden />}
          </button>
        ))}
      </div>

      {tab === 'list' ? <InvoiceList onEdit={setEditing} legalMissing={settingsQ.data?.legalMissing ?? []} /> : <SettingsTab q={settingsQ} />}

      {editing && <Editor invoice={editing === 'new' ? null : editing} settings={settingsQ.data?.invoicing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ─── List ───────────────────────────────────────────────────────────

const InvoiceList = ({ onEdit, legalMissing }: { onEdit: (i: Invoice) => void; legalMissing: string[] }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<InvoiceStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(h);
  }, [q]);

  const filters = { status: status || undefined, companyId: companyId || undefined, from: from || undefined, to: to || undefined, q: debouncedQ || undefined };
  const listQ = useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => (await api.get<{ invoices: Invoice[]; totals: Totals }>('/admin/invoices', { params: filters })).data,
    placeholderData: (prev) => prev,
  });
  const companiesQ = useCompanies();
  const totals = listQ.data?.totals;
  const [action, setAction] = useState<{ kind: 'send' | 'paid' | 'cancel' | 'delete'; invoice: Invoice } | null>(null);
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const duplicate = useMutation({
    mutationFn: async (id: string) => (await api.post<{ invoice: Invoice }>(`/admin/invoices/${id}/duplicate`)).data.invoice,
    onSuccess: (inv) => {
      toast.success(t('adminInvoices.toasts.duplicated'));
      refresh();
      onEdit(inv);
    },
    onError: (e) => toast.error(errText(e)),
  });

  return (
    <>
      {legalMissing.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0">
            <span className="font-semibold">{t('adminInvoices.settings.legalMissing')}.</span> {t('adminInvoices.settings.legalMissingText')}
          </p>
        </div>
      )}

      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('adminInvoices.tiles.open')} value={fmtEurShort(totals.openCents)} hint={t('adminInvoices.countHint', { count: totals.openCount })} icon={Euro} />
          <StatTile label={t('adminInvoices.tiles.overdue')} value={fmtEurShort(totals.overdueCents)} hint={t('adminInvoices.countHint', { count: totals.overdueCount })} icon={AlertTriangle} tone={totals.overdueCount ? 'danger' : undefined} />
          <StatTile label={t('adminInvoices.tiles.paidMonth')} value={fmtEurShort(totals.paidThisMonthCents)} hint={t('adminInvoices.countHint', { count: totals.paidThisMonthCount })} icon={CheckCircle2} tone="good" />
          <StatTile label={t('adminInvoices.tiles.drafts')} value={totals.draftCount} icon={FileText} />
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_10rem_10rem]">
          <label className="relative">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('adminInvoices.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" aria-label={t('adminInvoices.cols.company')} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">{t('adminInvoices.allCompanies')}</option>
            {companiesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" className="input" aria-label={t('adminInvoices.from')} title={t('adminInvoices.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input" aria-label={t('adminInvoices.to')} title={t('adminInvoices.to')} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!status} onClick={() => setStatus('')}>
            {t('adminInvoices.all')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)}>
              {t(`adminInvoices.status.${s}`)}
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
          <EmptyState icon={Receipt} title={t('adminInvoices.empty')}>
            {t('adminInvoices.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="hidden bg-surface text-left text-xs text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('adminInvoices.cols.number')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminInvoices.cols.company')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminInvoices.cols.issued')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminInvoices.cols.due')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('adminInvoices.cols.amount')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminInvoices.cols.status')}</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">{t('adminInvoices.actions.more')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {listQ.data.invoices.map((inv) => (
                <tr key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 md:table-row md:p-0">
                  <td className="font-semibold text-navy-900 tabular-nums md:px-4 md:py-3">{inv.number ?? <span className="text-muted italic">{t('adminInvoices.draftNo')}</span>}</td>
                  <td className="min-w-0 basis-full text-ink md:basis-auto md:px-4 md:py-3">
                    <span className="line-clamp-1">{inv.company.name}</span>
                  </td>
                  <td className="text-xs text-muted md:px-4 md:py-3 md:text-sm md:text-ink">{fmtDate(inv.issueDate)}</td>
                  <td className={clsx('text-xs md:px-4 md:py-3 md:text-sm', inv.status === 'OVERDUE' ? 'font-semibold text-danger' : 'text-muted md:text-ink')}>
                    <span className="md:hidden">→ </span>
                    {fmtDate(inv.dueDate)}
                  </td>
                  <td className="ml-auto font-semibold text-navy-900 tabular-nums md:ml-0 md:px-4 md:py-3 md:text-right">{fmtEur(inv.grossCents)}</td>
                  <td className="md:px-4 md:py-3">
                    <span className={clsx('badge', STATUS_TONE[inv.status])}>{t(`adminInvoices.status.${inv.status}`)}</span>
                  </td>
                  <td className="basis-full md:basis-auto md:px-3 md:py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <IconAction href={pdfUrl(inv.id)} label={t('adminInvoices.actions.pdf')} icon={Download} />
                      {inv.status === 'DRAFT' && <IconAction onClick={() => onEdit(inv)} label={t('adminInvoices.actions.edit')} icon={Pencil} />}
                      {(inv.status === 'DRAFT' || inv.status === 'SENT' || inv.status === 'OVERDUE') && (
                        <IconAction onClick={() => setAction({ kind: 'send', invoice: inv })} label={inv.status === 'DRAFT' ? t('adminInvoices.actions.send') : t('adminInvoices.actions.resend')} icon={Send} tone={inv.status === 'DRAFT' ? 'primary' : undefined} />
                      )}
                      {(inv.status === 'SENT' || inv.status === 'OVERDUE') && (
                        <>
                          <IconAction onClick={() => setAction({ kind: 'paid', invoice: inv })} label={t('adminInvoices.actions.paid')} icon={CheckCircle2} tone="good" />
                          <IconAction onClick={() => setAction({ kind: 'cancel', invoice: inv })} label={t('adminInvoices.actions.cancel')} icon={Ban} tone="danger" />
                        </>
                      )}
                      <IconAction onClick={() => duplicate.mutate(inv.id)} label={t('adminInvoices.actions.duplicate')} icon={Copy} />
                      {inv.status === 'DRAFT' && <IconAction onClick={() => setAction({ kind: 'delete', invoice: inv })} label={t('adminInvoices.actions.delete')} icon={Trash2} tone="danger" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ActionDialogs action={action} onClose={() => setAction(null)} onDone={refresh} />
    </>
  );
};

const IconAction = ({
  label,
  icon: I,
  onClick,
  href,
  tone,
}: {
  label: string;
  icon: typeof Send;
  onClick?: () => void;
  href?: string;
  tone?: 'primary' | 'good' | 'danger';
}) => {
  const cls = clsx(
    'grid size-9 place-items-center rounded-lg border transition',
    tone === 'primary'
      ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700'
      : tone === 'good'
        ? 'border-line text-emerald-700 hover:bg-emerald-50'
        : tone === 'danger'
          ? 'border-line text-danger hover:bg-red-50'
          : 'border-line text-navy-900 hover:bg-surface',
  );
  return href ? (
    <a href={href} className={cls} title={label} aria-label={label} download>
      <I className="size-4" aria-hidden />
    </a>
  ) : (
    <button type="button" className={cls} title={label} aria-label={label} onClick={onClick}>
      <I className="size-4" aria-hidden />
    </button>
  );
};

const ActionDialogs = ({ action, onClose, onDone }: { action: { kind: 'send' | 'paid' | 'cancel' | 'delete'; invoice: Invoice } | null; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [paidAt, setPaidAt] = useState(isoDay(new Date()));
  const [reason, setReason] = useState('');
  const inv = action?.invoice;
  useEffect(() => {
    setPaidAt(isoDay(new Date()));
    setReason('');
  }, [action]);

  const m = useMutation({
    mutationFn: async () => {
      if (!action) return null;
      const id = action.invoice.id;
      if (action.kind === 'send') return (await api.post<{ invoice: Invoice; emailed: boolean }>(`/admin/invoices/${id}/send`)).data;
      if (action.kind === 'paid') return (await api.post(`/admin/invoices/${id}/paid`, { paidAt })).data;
      if (action.kind === 'cancel') return (await api.post(`/admin/invoices/${id}/cancel`, { reason: reason.trim() || undefined })).data;
      return (await api.delete(`/admin/invoices/${id}`)).data;
    },
    onSuccess: (data) => {
      if (action?.kind === 'send') {
        const r = data as { invoice: Invoice; emailed: boolean };
        if (r.emailed) toast.success(t('adminInvoices.toasts.sent', { number: r.invoice.number }));
        else toast.warning(t('adminInvoices.toasts.sentNoMail', { number: r.invoice.number }));
      } else if (action?.kind === 'paid') toast.success(t('adminInvoices.toasts.paid'));
      else if (action?.kind === 'cancel') toast.success(t('adminInvoices.toasts.cancelled'));
      else toast.success(t('adminInvoices.toasts.deleted'));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const email = inv?.company.email || t('adminInvoices.confirm.noEmail');
  return (
    <>
      <ConfirmDialog
        open={action?.kind === 'send'}
        onClose={onClose}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        tone="primary"
        title={inv?.status === 'DRAFT' ? t('adminInvoices.confirm.sendTitle') : t('adminInvoices.confirm.resendTitle')}
        message={inv?.status === 'DRAFT' ? t('adminInvoices.confirm.sendText', { email }) : t('adminInvoices.confirm.resendText', { email })}
        confirmLabel={inv?.status === 'DRAFT' ? t('adminInvoices.actions.send') : t('adminInvoices.actions.resend')}
      />
      <ConfirmDialog
        open={action?.kind === 'delete'}
        onClose={onClose}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        title={t('adminInvoices.confirm.deleteTitle')}
        message={t('adminInvoices.confirm.deleteText')}
        confirmLabel={t('adminInvoices.actions.delete')}
      />
      <ConfirmDialog
        open={action?.kind === 'paid'}
        onClose={onClose}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        tone="primary"
        title={t('adminInvoices.confirm.paidTitle')}
        message={inv ? `${inv.number} · ${fmtEur(inv.grossCents)}` : undefined}
        confirmLabel={t('adminInvoices.actions.paid')}
      >
        <label className="label mt-3" htmlFor="inv-paid-at">{t('adminInvoices.confirm.paidDate')}</label>
        <input id="inv-paid-at" type="date" className="input" max={isoDay(new Date())} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
      </ConfirmDialog>
      <ConfirmDialog
        open={action?.kind === 'cancel'}
        onClose={onClose}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        title={t('adminInvoices.confirm.cancelTitle')}
        message={t('adminInvoices.confirm.cancelText')}
        confirmLabel={t('adminInvoices.actions.cancel')}
      >
        <label className="label mt-3" htmlFor="inv-cancel-reason">{t('adminInvoices.confirm.reason')}</label>
        <textarea id="inv-cancel-reason" className="input resize-y" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </>
  );
};

const useCompanies = () =>
  useQuery({
    queryKey: ['admin-invoice-companies'],
    queryFn: async () => (await api.get<{ companies: CompanyOpt[] }>('/admin/invoices/companies')).data.companies,
    staleTime: 5 * 60_000,
  });

// ─── Editor ─────────────────────────────────────────────────────────

interface LineDraft {
  key: number;
  description: string;
  qty: string;
  price: string;
}
let lineSeq = 0;
const blankLine = (): LineDraft => ({ key: ++lineSeq, description: '', qty: '1', price: '' });

const Editor = ({ invoice, settings, onClose }: { invoice: Invoice | null; settings?: Invoicing; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const companiesQ = useCompanies();
  const terms = settings?.paymentTermsDays ?? 14;
  const small = settings?.smallBusiness ?? false;
  const today = isoDay(new Date());
  const period = invoice?.items.find((l) => l.servicePeriod)?.servicePeriod;

  const [companyId, setCompanyId] = useState(invoice?.companyId ?? '');
  const [issueDate, setIssueDate] = useState(invoice ? invoice.issueDate.slice(0, 10) : today);
  const [dueDate, setDueDate] = useState(invoice ? invoice.dueDate.slice(0, 10) : addDaysIso(today, terms));
  const [dueTouched, setDueTouched] = useState(!!invoice);
  const [periodFrom, setPeriodFrom] = useState(period?.from ?? '');
  const [periodTo, setPeriodTo] = useState(period?.to ?? '');
  const [vatRate, setVatRate] = useState(String(invoice?.vatRate ?? settings?.defaultVatRate ?? 19));
  const [note, setNote] = useState(invoice?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    invoice?.items.length
      ? invoice.items.map((l) => ({ key: ++lineSeq, description: l.description, qty: String(l.quantity).replace('.', ','), price: centsToInput(l.unitPriceCents) }))
      : [blankLine()],
  );

  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: parseQty(l.qty), unitPriceCents: parseEuro(l.price) }));
  const rate = small ? 0 : Math.max(0, Math.min(100, Math.round(Number(vatRate) || 0)));
  const net = parsed.reduce((a, l) => a + (Number.isFinite(l.quantity) && Number.isFinite(l.unitPriceCents) ? Math.round(l.quantity * l.unitPriceCents) : 0), 0);
  const vat = Math.round((net * rate) / 100);
  const valid = !!companyId && parsed.length > 0 && parsed.every((l) => l.description && Number.isFinite(l.quantity) && Number.isFinite(l.unitPriceCents));
  const company = companiesQ.data?.find((c) => c.id === companyId);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        companyId,
        issueDate,
        dueDate,
        vatRate: rate,
        items: parsed,
        servicePeriodFrom: periodFrom || null,
        servicePeriodTo: periodTo || null,
        note: note.trim() || null,
      };
      return invoice ? api.put(`/admin/invoices/${invoice.id}`, body) : api.post('/admin/invoices', body);
    },
    onSuccess: () => {
      toast.success(t('adminInvoices.toasts.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      size="lg"
      title={invoice ? t('adminInvoices.editor.editTitle') : t('adminInvoices.editor.newTitle')}
      footer={
        <>
          {!valid && <span className="mr-auto self-center text-xs text-muted">{t('adminInvoices.editor.invalid')}</span>}
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={save.isPending}>
            {t('adminInvoices.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('adminInvoices.editor.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="inv-company">{t('adminInvoices.editor.company')} *</label>
          <select id="inv-company" className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">{t('adminInvoices.editor.chooseCompany')}</option>
            {companiesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.city ? ` · ${c.city}` : ''}
              </option>
            ))}
          </select>
          {company && (
            <p className={clsx('mt-1 flex items-center gap-1.5 text-xs', company.email ? 'text-muted' : 'text-amber-700')}>
              <Building2 className="size-3.5" aria-hidden />
              {company.email ?? t('adminInvoices.editor.noCompanyEmail')}
              {company.vatId && ` · USt-IdNr. ${company.vatId}`}
            </p>
          )}
        </div>
        <Field label={t('adminInvoices.editor.issueDate')} id="inv-issue">
          <input
            id="inv-issue"
            type="date"
            className="input"
            value={issueDate}
            onChange={(e) => {
              setIssueDate(e.target.value);
              if (!dueTouched && e.target.value) setDueDate(addDaysIso(e.target.value, terms));
            }}
          />
        </Field>
        <Field label={t('adminInvoices.editor.dueDate')} id="inv-due" hint={t('adminInvoices.editor.dueHint', { days: terms })}>
          <input
            id="inv-due"
            type="date"
            className="input"
            min={issueDate}
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              setDueTouched(true);
            }}
          />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="label">{t('adminInvoices.editor.period')}</legend>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input" aria-label={t('adminInvoices.editor.periodFrom')} value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            <input type="date" className="input" aria-label={t('adminInvoices.editor.periodTo')} min={periodFrom || undefined} value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
          </div>
        </fieldset>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-navy-900">{t('adminInvoices.editor.items')}</h3>
      <ul className="space-y-2">
        {lines.map((l, i) => {
          const p = parsed[i];
          const total = Number.isFinite(p.quantity) && Number.isFinite(p.unitPriceCents) ? Math.round(p.quantity * p.unitPriceCents) : null;
          return (
            <li key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_5rem_8rem_6.5rem_auto] sm:items-center">
              <input className="input col-span-2 sm:col-span-1" placeholder={t('adminInvoices.editor.description')} aria-label={t('adminInvoices.editor.description')} maxLength={500} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
              <div className="col-span-2 grid grid-cols-[5rem_1fr_auto] items-center gap-2 sm:contents">
                <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.quantity) && l.qty && 'border-danger')} inputMode="decimal" aria-label={t('adminInvoices.editor.qty')} placeholder={t('adminInvoices.editor.qty')} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.unitPriceCents) && l.price && 'border-danger')} inputMode="decimal" aria-label={t('adminInvoices.editor.unitPrice')} placeholder={t('adminInvoices.editor.unitPrice')} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                <span className="text-right text-sm font-semibold text-navy-900 tabular-nums sm:w-full">{total === null ? '—' : fmtEur(total)}</span>
              </div>
              <button
                type="button"
                className="row-start-1 grid size-9 place-items-center self-start rounded-lg text-muted hover:bg-red-50 hover:text-danger disabled:opacity-30 sm:row-start-auto sm:self-center"
                aria-label={t('adminInvoices.editor.removeLine')}
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <X className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {lines.length < 60 && (
        <button type="button" className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-600 hover:bg-brand-50" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          <Plus className="size-4" aria-hidden /> {t('adminInvoices.editor.addLine')}
        </button>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_16rem]">
        <div>
          <label className="label" htmlFor="inv-note">{t('adminInvoices.editor.note')}</label>
          <textarea id="inv-note" className="input resize-y" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="rounded-xl bg-surface p-4 text-sm">
          <div className="mb-3">
            <label className="label" htmlFor="inv-vat">{t('adminInvoices.editor.vat')}</label>
            {small ? (
              <p className="text-xs text-muted">{t('adminInvoices.editor.vatSmall')}</p>
            ) : (
              <input id="inv-vat" type="number" min={0} max={100} className="input" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
            )}
          </div>
          <dl className="space-y-1.5 tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted">{t('adminInvoices.editor.net')}</dt>
              <dd>{fmtEur(net)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t('adminInvoices.editor.vatAmount', { rate })}</dt>
              <dd>{fmtEur(vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold text-navy-900">
              <dt>{t('adminInvoices.editor.gross')}</dt>
              <dd>{fmtEur(net + vat)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Modal>
  );
};

const Field = ({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) => (
  <div>
    <label className="label" htmlFor={id}>{label}</label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

// ─── Settings tab ───────────────────────────────────────────────────

const SettingsTab = ({ q }: { q: { data?: SettingsResponse; isLoading: boolean; error: unknown; refetch: () => unknown } }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<Invoicing | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(q.data.invoicing);
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: async (value: Invoicing) => (await api.put<SettingsResponse>('/admin/invoices/settings', { invoicing: value })).data,
    onSuccess: (data) => {
      qc.setQueryData(['admin-invoice-settings'], data);
      setForm(data.invoicing);
      toast.success(t('adminInvoices.toasts.settings'));
    },
    onError: (e) => toast.error(errText(e)),
  });

  if (q.isLoading || (!form && !q.error)) return <LoadingBlock />;
  if (q.error || !q.data || !form) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { seller, legalMissing } = q.data;
  const set = <K extends keyof Invoicing>(k: K, v: Invoicing[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <Panel title={t('adminInvoices.settings.bank')} icon={Landmark}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('adminInvoices.settings.accountHolder')} id="is-holder">
              <input id="is-holder" className="input" maxLength={160} value={form.accountHolder} onChange={(e) => set('accountHolder', e.target.value)} />
            </Field>
            <Field label={t('adminInvoices.settings.bankName')} id="is-bank">
              <input id="is-bank" className="input" maxLength={160} value={form.bank} onChange={(e) => set('bank', e.target.value)} />
            </Field>
            <Field label={t('adminInvoices.settings.iban')} id="is-iban">
              <input id="is-iban" className="input font-mono uppercase" maxLength={42} autoComplete="off" value={form.iban} onChange={(e) => set('iban', e.target.value)} />
              {isMaskedValue(form.iban) && <SensitiveValue value={form.iban} entity="invoiceSettings" id="invoicing" field="iban" className="mt-1 text-xs" />}
            </Field>
            <Field label={t('adminInvoices.settings.bic')} id="is-bic">
              <input id="is-bic" className="input font-mono uppercase" maxLength={11} autoComplete="off" value={form.bic} onChange={(e) => set('bic', e.target.value)} />
            </Field>
          </div>
        </Panel>
        <Panel title={t('adminInvoices.settings.defaults')} icon={Settings2}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('adminInvoices.settings.vatRate')} id="is-vat">
              <input id="is-vat" type="number" min={0} max={100} className="input" value={form.defaultVatRate} disabled={form.smallBusiness} onChange={(e) => set('defaultVatRate', Number(e.target.value))} />
            </Field>
            <Field label={t('adminInvoices.settings.terms')} id="is-terms">
              <input id="is-terms" type="number" min={0} max={365} className="input" value={form.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Number(e.target.value))} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 sm:col-span-2">
              <span className="text-sm text-ink">{t('adminInvoices.settings.smallBusiness')}</span>
              <Switch checked={form.smallBusiness} onChange={(v) => set('smallBusiness', v)} label={t('adminInvoices.settings.smallBusiness')} />
            </div>
            <div className="sm:col-span-2">
              <Field label={t('adminInvoices.settings.footer')} id="is-footer">
                <textarea id="is-footer" className="input resize-y" rows={2} maxLength={500} value={form.footer} onChange={(e) => set('footer', e.target.value)} />
              </Field>
            </div>
          </div>
        </Panel>
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4" />}
            {t('adminInvoices.settings.save')}
          </button>
        </div>
      </form>

      <aside className="space-y-4">
        <Panel title={legalMissing.length ? t('adminInvoices.settings.legalMissing') : t('adminInvoices.settings.legalOk')} icon={legalMissing.length ? AlertTriangle : Building2}>
          {legalMissing.length > 0 && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <p>{t('adminInvoices.settings.legalMissingText')}</p>
              <ul className="mt-2 list-inside list-disc">
                {legalMissing.map((k) => (
                  <li key={k}>{t(`adminInvoices.settings.missing.${k}`)}</li>
                ))}
              </ul>
            </div>
          )}
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
            {seller.register && (
              <>
                <br />
                <span className="text-muted">{seller.register}</span>
              </>
            )}
          </address>
          <Link to="/admin/settings" className="btn-white btn-sm mt-4 border border-line">
            <Settings2 className="size-3.5" aria-hidden /> {t('adminInvoices.settings.openSettings')}
          </Link>
        </Panel>
      </aside>
    </div>
  );
};
