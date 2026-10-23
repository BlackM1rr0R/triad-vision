import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Euro,
  ExternalLink,
  FileSignature,
  FileText,
  Link2,
  Pencil,
  Percent,
  Plus,
  Receipt,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesQuotes } from '@/i18n/pagesQuotes';
import { Chip, DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile, Switch } from '@/components/admin/ui';
import { Modal } from '@/components/admin/Modal';
import { Drawer } from '@/components/admin/Drawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { errorMessage, fmtDate, fmtDateTime } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { QUOTE_STATUS_TONE, type QuoteStatus } from '@/components/quotes/QuoteDocument';

registerCopy(pagesQuotes);

// ─── Types / helpers ────────────────────────────────────────────────

const STATUSES: QuoteStatus[] = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED'];
const UNITS = ['PERSON', 'PIECE', 'FLAT', 'MONTH'] as const;
type Unit = (typeof UNITS)[number];
type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';

interface Item {
  description: string;
  quantity: number;
  unit: Unit;
  unitPriceCents: number;
  vatRate: number | null;
  catalogueId: string | null;
  convertedQty: number;
}
interface ListQuote {
  id: string;
  number: string | null;
  status: QuoteStatus;
  title: string;
  companyId: string;
  company: { id: string; name: string; email: string | null; city: string | null; status: string };
  contactName: string | null;
  contactEmail: string | null;
  netCents: number;
  grossCents: number;
  validUntil: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  invoiceId: string | null;
  createdAt: string;
  createdBy: string | null;
}
interface QuoteEvent {
  id: string;
  type: string;
  actorName: string | null;
  note: string | null;
  meta: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}
interface DetailQuote extends ListQuote {
  vacancyId: string | null;
  locale: 'de' | 'en';
  salutation: string | null;
  introText: string | null;
  closingText: string | null;
  items: Item[];
  discount: { type: DiscountType; value: number };
  vatRate: number;
  subtotalCents: number;
  discountCents: number;
  vatCents: number;
  vatBreakdown: { rate: number; netCents: number; vatCents: number }[];
  paymentTerms: string | null;
  deliveryTerms: string | null;
  acceptedByName: string | null;
  acceptedIp: string | null;
  acceptedUa: string | null;
  declinedReason: string | null;
  publicUrl: string | null;
  recipient: string;
  invoices: { id: string; number: string | null; status: string; grossCents: number }[];
  events: QuoteEvent[];
}
interface Totals {
  openCents: number;
  openCount: number;
  acceptedCents: number;
  acceptedCount: number;
  toConvertCount: number;
  declinedCount: number;
  expiredCount: number;
  draftCount: number;
  expiringSoon: number;
  acceptanceRate: number | null;
  byStatus: Record<QuoteStatus, number>;
}
interface CatalogueItem {
  id: string;
  name: string;
  unit: Unit;
  unitPriceCents: number;
  vatRate: number | null;
  active: boolean;
}
interface Template {
  id: string;
  name: string;
  text: string;
}
interface QuoteSettings {
  catalogue: CatalogueItem[];
  introTemplates: Template[];
  closingTemplates: Template[];
  validDays: number;
  paymentTerms: string;
  deliveryTerms: string;
  reminderDays: number;
}
interface SettingsResponse {
  settings: QuoteSettings;
  invoicing: { smallBusiness: boolean; defaultVatRate: number };
  legalMissing: string[];
}
interface CompanyOpt {
  id: string;
  name: string;
  legalForm: string | null;
  email: string | null;
  contactName: string | null;
  city: string | null;
  address: string | null;
  status: string;
}
interface VacancyOpt {
  id: string;
  companyId: string;
  title: string;
  positions: number;
  status: string;
}
interface Options {
  companies: CompanyOpt[];
  vacancies: VacancyOpt[];
  ai: { available: boolean };
}

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmtEur = (cents: number) => eur.format(cents / 100);
const eurWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEurShort = (cents: number) => eurWhole.format(Math.round(cents / 100));
const qtyFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

/** "1.234,56" / "1234.56" → cents (NaN when not a number). */
const parseEuro = (s: string) => {
  const raw = s.replace(/[\s€]/g, '');
  if (!raw) return NaN;
  const normalised = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  if (!/^\d+(\.\d{0,2})?$/.test(normalised)) return NaN;
  return Math.round(Number(normalised) * 100);
};
const parseQty = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 && Math.round(n * 100) === Math.round(n * 1e6) / 1e4 ? n : NaN;
};
const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDaysIso = (n: number) => isoDay(new Date(Date.now() + n * 86400000));
const deDate = (iso: string) => new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));

/** Same math as the server (lib/quotes/math.ts): discount spread over the VAT groups. */
const computeTotals = (items: { quantity: number; unitPriceCents: number; vatRate: number | null }[], defaultRate: number, type: DiscountType, value: number) => {
  const line = (l: { quantity: number; unitPriceCents: number }) => Math.round(l.quantity * l.unitPriceCents);
  const subtotal = items.reduce((a, l) => a + line(l), 0);
  const discount = type === 'PERCENT' ? Math.min(subtotal, Math.round((subtotal * Math.round(value * 100)) / 10000)) : type === 'AMOUNT' ? Math.min(subtotal, Math.max(0, value)) : 0;
  const groups = new Map<number, number>();
  for (const l of items) groups.set(l.vatRate ?? defaultRate, (groups.get(l.vatRate ?? defaultRate) ?? 0) + line(l));
  const rates = [...groups.keys()].sort((a, b) => b - a);
  let rest = discount;
  const vat = rates.map((rate, i) => {
    const sub = groups.get(rate)!;
    const share = i === rates.length - 1 ? rest : subtotal ? Math.round((discount * sub) / subtotal) : 0;
    rest -= share;
    return { rate, vatCents: Math.round(((sub - share) * rate) / 100) };
  });
  const net = subtotal - discount;
  const vatCents = vat.reduce((a, g) => a + g.vatCents, 0);
  return { subtotal, discount, net, vat, vatCents, gross: net + vatCents };
};

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`adminQuotes.errors.${code}`) ? i18n.t(`adminQuotes.errors.${code}`) : errorMessage(err, i18n.t('adminQuotes.errors.default'));
};

const KEY = ['admin-quotes'] as const;
const pdfUrl = (id: string) => `/api/admin/quotes/${id}/pdf`;

const useQuoteSettings = () =>
  useQuery({ queryKey: ['admin-quote-settings'], queryFn: async () => (await api.get<SettingsResponse>('/admin/quotes/settings')).data, staleTime: 60_000 });
const useOptions = () => useQuery({ queryKey: ['admin-quote-options'], queryFn: async () => (await api.get<Options>('/admin/quotes/options')).data, staleTime: 60_000 });

// ─── Page ───────────────────────────────────────────────────────────

type WizardState = { quote?: DetailQuote; companyId?: string } | null;

export default function AdminQuotes() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settings' ? 'settings' : 'list';
  const openId = params.get('id');
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const [wizard, setWizard] = useState<WizardState>(null);

  // /admin/quotes?new=1&companyId=… (from the company drawer) opens the wizard right away.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setWizard({ companyId: params.get('companyId') ?? undefined });
    const next = new URLSearchParams(params);
    next.delete('new');
    next.delete('companyId');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const settingsQ = useQuoteSettings();

  return (
    <div>
      <PageHead
        title={t('admin.nav.quotes')}
        subtitle={t('adminQuotes.subtitle')}
        actions={
          tab === 'list' && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setWizard({})}>
              <Plus className="size-4" aria-hidden /> {t('adminQuotes.create')}
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
            onClick={() => setParam('tab', v === 'settings' ? 'settings' : null)}
            className={clsx(
              '-mb-px inline-flex min-h-10 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold transition',
              tab === v ? 'border-brand-600 text-navy-900' : 'border-transparent text-muted hover:text-navy-900',
            )}
          >
            {v === 'list' ? <FileSignature className="size-4" aria-hidden /> : <Settings2 className="size-4" aria-hidden />}
            {t(`adminQuotes.tabs.${v}`)}
          </button>
        ))}
      </div>

      {tab === 'list' ? <QuoteList onOpen={(id) => setParam('id', id)} /> : <SettingsTab q={settingsQ} />}

      <QuoteDrawer id={tab === 'list' ? openId : null} onClose={() => setParam('id', null)} onEdit={(q) => setWizard({ quote: q })} onOpen={(id) => setParam('id', id)} />
      {wizard && settingsQ.data && (
        <Wizard
          initial={wizard}
          settings={settingsQ.data}
          onClose={() => setWizard(null)}
          onSaved={(id) => {
            setWizard(null);
            setParam('id', id);
          }}
        />
      )}
    </div>
  );
}

// ─── List ───────────────────────────────────────────────────────────

const QuoteList = ({ onOpen }: { onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<QuoteStatus | ''>('');
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
    queryFn: async () => (await api.get<{ quotes: ListQuote[]; totals: Totals }>('/admin/quotes', { params: filters })).data,
    placeholderData: (prev) => prev,
  });
  const optionsQ = useOptions();
  const totals = listQ.data?.totals;

  return (
    <>
      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label={t('adminQuotes.tiles.open')} value={fmtEurShort(totals.openCents)} hint={t('adminQuotes.countHint', { count: totals.openCount })} icon={Euro} />
          <StatTile
            label={t('adminQuotes.tiles.acceptance')}
            value={totals.acceptanceRate === null ? '—' : `${totals.acceptanceRate} %`}
            hint={t('adminQuotes.rateHint')}
            icon={Percent}
            tone={totals.acceptanceRate !== null && totals.acceptanceRate >= 50 ? 'good' : undefined}
          />
          <StatTile label={t('adminQuotes.tiles.accepted')} value={fmtEurShort(totals.acceptedCents)} hint={t('adminQuotes.countHint', { count: totals.acceptedCount })} icon={CheckCircle2} tone="good" />
          <StatTile
            label={t('adminQuotes.tiles.toConvert')}
            value={totals.toConvertCount}
            hint={`${t('adminQuotes.tiles.expiring')}: ${totals.expiringSoon} · ${t('adminQuotes.tiles.drafts')}: ${totals.draftCount}`}
            icon={Receipt}
            tone={totals.toConvertCount ? 'warn' : undefined}
          />
        </div>
      )}

      <div className="mb-4 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_10rem_10rem]">
          <label className="relative">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" className="input pl-9" placeholder={t('adminQuotes.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <select className="input" aria-label={t('adminQuotes.cols.company')} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">{t('adminQuotes.allCompanies')}</option>
            {optionsQ.data?.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input type="date" className="input" aria-label={t('adminQuotes.from')} title={t('adminQuotes.from')} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input" aria-label={t('adminQuotes.to')} title={t('adminQuotes.to')} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={!status} onClick={() => setStatus('')}>
            {t('adminQuotes.all')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)} count={totals?.byStatus[s]}>
              {t(`adminQuotes.status.${s}`)}
            </Chip>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        <LoadingBlock />
      ) : listQ.error ? (
        <ErrorBlock error={listQ.error} onRetry={() => listQ.refetch()} />
      ) : !listQ.data?.quotes.length ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={FileSignature} title={t('adminQuotes.empty')}>
            {t('adminQuotes.emptyText')}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="hidden bg-surface text-left text-xs text-muted md:table-header-group">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t('adminQuotes.cols.number')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminQuotes.cols.company')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminQuotes.cols.validUntil')}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{t('adminQuotes.cols.amount')}</th>
                <th className="px-4 py-2.5 font-semibold">{t('adminQuotes.cols.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {listQ.data.quotes.map((qt) => (
                <tr key={qt.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface md:table-row md:p-0" onClick={() => onOpen(qt.id)}>
                  <td className="font-semibold text-navy-900 tabular-nums md:px-4 md:py-3">
                    <button type="button" className="text-left hover:underline" onClick={(e) => { e.stopPropagation(); onOpen(qt.id); }}>
                      {qt.number ?? <span className="text-muted italic">{t('adminQuotes.draftNo')}</span>}
                    </button>
                  </td>
                  <td className="min-w-0 basis-full md:basis-auto md:px-4 md:py-3">
                    <span className="line-clamp-1 text-ink">{qt.company.name}</span>
                    <span className="line-clamp-1 text-xs text-muted">{qt.title}</span>
                  </td>
                  <td className={clsx('text-xs md:px-4 md:py-3 md:text-sm', qt.status === 'EXPIRED' ? 'text-amber-700' : 'text-muted md:text-ink')}>{fmtDate(qt.validUntil)}</td>
                  <td className="ml-auto font-semibold text-navy-900 tabular-nums md:ml-0 md:px-4 md:py-3 md:text-right">{fmtEur(qt.grossCents)}</td>
                  <td className="md:px-4 md:py-3">
                    <span className={clsx('badge', QUOTE_STATUS_TONE[qt.status])}>{t(`adminQuotes.status.${qt.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

// ─── Detail drawer ──────────────────────────────────────────────────

const QuoteDrawer = ({ id, onClose, onEdit, onOpen }: { id: string | null; onClose: () => void; onEdit: (q: DetailQuote) => void; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const detailQ = useQuery({
    queryKey: ['admin-quote', id],
    queryFn: async () => (await api.get<{ quote: DetailQuote }>(`/admin/quotes/${id}`)).data.quote,
    enabled: !!id,
  });
  const [dialog, setDialog] = useState<'send' | 'delete' | 'convert' | null>(null);
  const q = detailQ.data;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['admin-quote', id] });
  };
  const duplicate = useMutation({
    mutationFn: async () => (await api.post<{ quote: DetailQuote }>(`/admin/quotes/${id}/duplicate`)).data.quote,
    onSuccess: (dup) => {
      toast.success(t('adminQuotes.toasts.duplicated'));
      refresh();
      onOpen(dup.id);
    },
    onError: (e) => toast.error(errText(e)),
  });
  const copyLink = async () => {
    if (!q?.publicUrl) return;
    try {
      await navigator.clipboard.writeText(q.publicUrl);
      toast.success(t('adminQuotes.toasts.linkCopied'));
    } catch {
      window.prompt(t('adminQuotes.detail.link'), q.publicUrl);
    }
  };

  return (
    <Drawer open={!!id} onClose={onClose} title={q ? (q.number ?? t('adminQuotes.draftNo')) : t('admin.nav.quotes')}>
      {detailQ.isLoading || !q ? (
        detailQ.error ? <ErrorBlock error={detailQ.error} onRetry={() => detailQ.refetch()} /> : <LoadingBlock />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('badge', QUOTE_STATUS_TONE[q.status])}>{t(`adminQuotes.status.${q.status}`)}</span>
            <span className="font-display text-xl font-bold text-navy-900 tabular-nums">{fmtEur(q.grossCents)}</span>
            <span className="text-xs text-muted">netto {fmtEur(q.netCents)}</span>
          </div>
          <p className="text-sm font-semibold text-navy-900">{q.title}</p>

          <div className="flex flex-wrap gap-2">
            <a href={pdfUrl(q.id)} className="btn-white btn-sm border border-line" download>
              <Download className="size-3.5" aria-hidden /> {t('adminQuotes.actions.pdf')}
            </a>
            {q.status === 'DRAFT' && (
              <button type="button" className="btn-white btn-sm border border-line" onClick={() => onEdit(q)}>
                <Pencil className="size-3.5" aria-hidden /> {t('adminQuotes.actions.edit')}
              </button>
            )}
            {(q.status === 'DRAFT' || q.status === 'SENT' || q.status === 'VIEWED') && (
              <button type="button" className={clsx('btn-sm', q.status === 'DRAFT' ? 'btn-primary' : 'btn-white border border-line')} onClick={() => setDialog('send')}>
                <Send className="size-3.5" aria-hidden /> {q.status === 'DRAFT' ? t('adminQuotes.actions.send') : t('adminQuotes.actions.resend')}
              </button>
            )}
            {q.status === 'ACCEPTED' && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setDialog('convert')}>
                <Receipt className="size-3.5" aria-hidden /> {t('adminQuotes.actions.convert')}
              </button>
            )}
            {q.publicUrl && (
              <button type="button" className="btn-white btn-sm border border-line" onClick={() => void copyLink()}>
                <Link2 className="size-3.5" aria-hidden /> {t('adminQuotes.actions.copyLink')}
              </button>
            )}
            <button type="button" className="btn-white btn-sm border border-line" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
              <Copy className="size-3.5" aria-hidden /> {t('adminQuotes.actions.duplicate')}
            </button>
            {q.status === 'DRAFT' && (
              <button type="button" className="btn-white btn-sm border border-line text-danger" onClick={() => setDialog('delete')}>
                <Trash2 className="size-3.5" aria-hidden /> {t('adminQuotes.actions.delete')}
              </button>
            )}
          </div>

          {(q.status === 'ACCEPTED' || q.status === 'CONVERTED') && q.acceptedByName && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-900">
              <p className="font-semibold">
                {t('adminQuotes.detail.acceptedBy')}: {q.acceptedByName} · {q.acceptedAt && fmtDateTime(q.acceptedAt)}
              </p>
              {(q.acceptedIp || q.acceptedUa) && (
                <p className="mt-1 text-xs break-all opacity-80">
                  {t('adminQuotes.detail.technical')}: {q.acceptedIp ?? '—'} · {q.acceptedUa ?? '—'}
                </p>
              )}
            </div>
          )}
          {q.status === 'DECLINED' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-900">
              <p className="font-semibold">{t('adminQuotes.detail.declinedReason')}</p>
              <p className="mt-1 whitespace-pre-line">{q.declinedReason || '—'}</p>
            </div>
          )}

          <Panel>
            <dl>
              <DefRow label={t('adminQuotes.cols.company')}>
                <Link to={`/admin/companies?id=${q.companyId}`} className="text-brand-700 hover:underline">
                  {q.company.name}
                </Link>
              </DefRow>
              <DefRow label={t('adminQuotes.detail.recipient')}>{q.recipient || <span className="text-amber-700">{t('adminQuotes.detail.noRecipient')}</span>}</DefRow>
              <DefRow label={t('adminQuotes.detail.validUntil')}>{fmtDate(q.validUntil)}</DefRow>
              {q.sentAt && <DefRow label={t('adminQuotes.detail.sentAt')}>{fmtDateTime(q.sentAt)}</DefRow>}
              {q.createdBy && <DefRow label={t('adminQuotes.detail.createdBy')}>{q.createdBy}</DefRow>}
              {q.publicUrl && (
                <DefRow label={t('adminQuotes.detail.link')}>
                  <a href={q.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                    /angebot/… <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </DefRow>
              )}
            </dl>
          </Panel>

          <Panel title={t('adminQuotes.detail.items')}>
            <ul className="divide-y divide-line text-sm">
              {q.items.map((it, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="min-w-0 flex-1 text-ink">{it.description}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {qtyFmt.format(it.quantity)} × {fmtEur(it.unitPriceCents)}
                    {(q.status === 'ACCEPTED' || q.status === 'CONVERTED') && ` · ${t('adminQuotes.detail.converted', { done: qtyFmt.format(it.convertedQty), total: qtyFmt.format(it.quantity) })}`}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 border-t border-line pt-2 tabular-nums">
              {q.discountCents > 0 && <DefRow label={t('adminQuotes.wizard.discountRow')}>-{fmtEur(q.discountCents)}</DefRow>}
              <DefRow label={t('adminQuotes.wizard.net')}>{fmtEur(q.netCents)}</DefRow>
              {q.vatBreakdown.map((g) => (
                <DefRow key={g.rate} label={t('adminQuotes.wizard.vatAmount', { rate: g.rate })}>
                  {fmtEur(g.vatCents)}
                </DefRow>
              ))}
              <DefRow label={t('adminQuotes.wizard.gross')}>{fmtEur(q.grossCents)}</DefRow>
            </dl>
          </Panel>

          {q.invoices.length > 0 && (
            <Panel title={t('adminQuotes.detail.invoices')} icon={Receipt}>
              <ul className="space-y-1.5 text-sm">
                {q.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2">
                    <Link to={inv.status === 'DRAFT' ? `/admin/invoices?edit=${inv.id}` : `/admin/invoices`} className="font-semibold text-brand-700 hover:underline">
                      {inv.number ?? t('adminQuotes.draftNo')}
                    </Link>
                    <span className="tabular-nums">{fmtEur(inv.grossCents)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title={t('adminQuotes.detail.timeline')} icon={Clock3}>
            <ol className="relative space-y-3 border-l border-line pl-4">
              {q.events.map((e) => {
                const via = (e.meta as { via?: string } | null)?.via;
                return (
                  <li key={e.id} className="text-sm">
                    <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-brand-500" aria-hidden />
                    <p className="font-semibold text-navy-900">
                      {i18n.exists(`adminQuotes.detail.events.${e.type}`) ? t(`adminQuotes.detail.events.${e.type}`) : e.type}
                      {via && <span className="font-normal text-muted"> · {via === 'portal' ? t('adminQuotes.detail.viaPortal') : t('adminQuotes.detail.viaLink')}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {fmtDateTime(e.createdAt)}
                      {e.actorName && ` · ${e.actorName}`}
                      {typeof e.meta?.to === 'string' && ` · ${e.meta.to}`}
                    </p>
                    {e.note && <p className="mt-0.5 text-xs whitespace-pre-line text-ink">{e.note}</p>}
                  </li>
                );
              })}
            </ol>
          </Panel>

          <SendDialog open={dialog === 'send'} quote={q} onClose={() => setDialog(null)} onDone={refresh} />
          <DeleteDialog
            open={dialog === 'delete'}
            id={q.id}
            onClose={() => setDialog(null)}
            onDone={() => {
              refresh();
              onClose();
            }}
          />
          {dialog === 'convert' && (
            <ConvertDialog
              quote={q}
              onClose={() => setDialog(null)}
              onDone={(invoiceId) => {
                refresh();
                setDialog(null);
                navigate(`/admin/invoices?edit=${invoiceId}`);
              }}
            />
          )}
        </div>
      )}
    </Drawer>
  );
};

const SendDialog = ({ open, quote, onClose, onDone }: { open: boolean; quote: DetailQuote; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const [to, setTo] = useState(quote.recipient);
  const [locale, setLocale] = useState<'de' | 'en'>(quote.locale);
  useEffect(() => {
    if (open) {
      setTo(quote.recipient);
      setLocale(quote.locale);
    }
  }, [open, quote]);
  const m = useMutation({
    mutationFn: async () => (await api.post<{ quote: DetailQuote; emailed: boolean }>(`/admin/quotes/${quote.id}/send`, { to: to.trim() || undefined, locale })).data,
    onSuccess: (r) => {
      if (r.emailed) toast.success(t('adminQuotes.toasts.sent', { number: r.quote.number }));
      else toast.warning(t('adminQuotes.toasts.sentNoMail', { number: r.quote.number }));
      onDone();
      onClose();
    },
    onError: (e) => toast.error(errText(e)),
  });
  const first = quote.status === 'DRAFT';
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => m.mutate()}
      loading={m.isPending}
      tone="primary"
      title={first ? t('adminQuotes.send.title') : t('adminQuotes.send.resendTitle')}
      message={first ? t('adminQuotes.send.text') : t('adminQuotes.send.resendText')}
      confirmLabel={first ? t('adminQuotes.actions.send') : t('adminQuotes.actions.resend')}
    >
      <label className="label mt-3" htmlFor="qs-to">
        {t('adminQuotes.send.to')}
      </label>
      <input id="qs-to" type="email" className="input" maxLength={200} value={to} onChange={(e) => setTo(e.target.value)} />
      <p className="label mt-3">{t('adminQuotes.send.language')}</p>
      <div className="flex gap-1.5">
        {(['de', 'en'] as const).map((l) => (
          <Chip key={l} active={locale === l} onClick={() => setLocale(l)}>
            {t(`adminQuotes.wizard.languages.${l}`)}
          </Chip>
        ))}
      </div>
    </ConfirmDialog>
  );
};

const DeleteDialog = ({ open, id, onClose, onDone }: { open: boolean; id: string; onClose: () => void; onDone: () => void }) => {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: () => api.delete(`/admin/quotes/${id}`),
    onSuccess: () => {
      toast.success(t('adminQuotes.toasts.deleted'));
      onDone();
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={() => m.mutate()}
      loading={m.isPending}
      title={t('adminQuotes.confirm.deleteTitle')}
      message={t('adminQuotes.confirm.deleteText')}
      confirmLabel={t('adminQuotes.actions.delete')}
    />
  );
};

const ConvertDialog = ({ quote, onClose, onDone }: { quote: DetailQuote; onClose: () => void; onDone: (invoiceId: string) => void }) => {
  const { t } = useTranslation();
  const remaining = quote.items.map((it) => Math.max(0, Math.round((it.quantity - it.convertedQty) * 100) / 100));
  const [qty, setQty] = useState<string[]>(remaining.map((r) => String(r).replace('.', ',')));
  const parsed = qty.map((s) => (s.trim() === '' ? 0 : Number(s.replace(',', '.'))));
  const valid = parsed.every((n, i) => Number.isFinite(n) && n >= 0 && n <= remaining[i]) && parsed.some((n) => n > 0);
  const rates = new Set(quote.items.filter((_, i) => parsed[i] > 0).map((it) => it.vatRate ?? quote.vatRate));
  const m = useMutation({
    mutationFn: async () => {
      const full = parsed.every((n, i) => n === remaining[i]);
      return (await api.post<{ invoiceId: string }>(`/admin/quotes/${quote.id}/convert`, full ? {} : { lines: parsed.map((quantity, index) => ({ index, quantity })).filter((l) => l.quantity > 0) })).data;
    },
    onSuccess: (r) => {
      toast.success(t('adminQuotes.toasts.converted'));
      onDone(r.invoiceId);
    },
    onError: (e) => toast.error(errText(e)),
  });
  return (
    <Modal
      open
      onClose={() => !m.isPending && onClose()}
      title={t('adminQuotes.convert.title')}
      description={t('adminQuotes.convert.text')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={m.isPending}>
            {t('adminQuotes.wizard.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || rates.size > 1 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <Spinner className="size-3.5" />} {t('adminQuotes.convert.confirm')}
          </button>
        </>
      }
    >
      <ul className="space-y-2">
        {quote.items.map((it, i) => (
          <li key={i} className="grid grid-cols-[1fr_6rem] items-center gap-3 rounded-xl border border-line p-2.5 text-sm">
            <div className="min-w-0">
              <p className="text-ink">{it.description}</p>
              <p className="text-xs text-muted">
                {t('adminQuotes.convert.remaining', { qty: qtyFmt.format(remaining[i]) })} · {fmtEur(it.unitPriceCents)}
              </p>
            </div>
            <input
              className={clsx('input text-right tabular-nums', !(parsed[i] >= 0 && parsed[i] <= remaining[i]) && 'border-danger')}
              inputMode="decimal"
              aria-label={t('adminQuotes.convert.quantity')}
              disabled={remaining[i] === 0}
              value={qty[i]}
              onChange={(e) => setQty((q) => q.map((x, k) => (k === i ? e.target.value : x)))}
            />
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 text-sm font-semibold text-brand-600 hover:underline" onClick={() => setQty(remaining.map((r) => String(r).replace('.', ',')))}>
        {t('adminQuotes.convert.all')}
      </button>
      {rates.size > 1 && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {t('adminQuotes.convert.mixedVat')}
        </p>
      )}
    </Modal>
  );
};

// ─── Wizard ─────────────────────────────────────────────────────────

interface LineDraft {
  key: number;
  description: string;
  qty: string;
  unit: Unit;
  price: string;
  vat: string;
  catalogueId: string | null;
}
let lineSeq = 0;

const STEPS = ['company', 'vacancy', 'items', 'texts', 'preview'] as const;

const Wizard = ({ initial, settings, onClose, onSaved }: { initial: NonNullable<WizardState>; settings: SettingsResponse; onClose: () => void; onSaved: (id: string) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const optionsQ = useOptions();
  const src = initial.quote;
  const s = settings.settings;
  const small = settings.invoicing.smallBusiness;
  const [step, setStep] = useState(src ? 2 : 0);
  const [companyId, setCompanyId] = useState(src?.companyId ?? initial.companyId ?? '');
  const [companySearch, setCompanySearch] = useState('');
  const [prospectOpen, setProspectOpen] = useState(false);
  const [contactName, setContactName] = useState(src?.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(src?.contactEmail ?? '');
  const [vacancyId, setVacancyId] = useState(src?.vacancyId ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (src?.items ?? []).map((l) => ({
      key: ++lineSeq,
      description: l.description,
      qty: String(l.quantity).replace('.', ','),
      unit: l.unit,
      price: centsToInput(l.unitPriceCents),
      vat: l.vatRate === null ? '' : String(l.vatRate),
      catalogueId: l.catalogueId,
    })),
  );
  const [discountType, setDiscountType] = useState<DiscountType>(src?.discount.type ?? 'NONE');
  const [discountValue, setDiscountValue] = useState(
    src ? (src.discount.type === 'AMOUNT' ? centsToInput(src.discount.value) : src.discount.type === 'PERCENT' ? String(src.discount.value).replace('.', ',') : '') : '',
  );
  const [vatRate, setVatRate] = useState(String(src?.vatRate ?? settings.invoicing.defaultVatRate));
  const [validUntil, setValidUntil] = useState(src ? src.validUntil.slice(0, 10) : addDaysIso(s.validDays));
  const [title, setTitle] = useState(src?.title ?? '');
  const [salutation, setSalutation] = useState(src?.salutation ?? '');
  const [introText, setIntroText] = useState(src?.introText ?? '');
  const [closingText, setClosingText] = useState(src?.closingText ?? '');
  const [paymentTerms, setPaymentTerms] = useState(src?.paymentTerms ?? s.paymentTerms);
  const [deliveryTerms, setDeliveryTerms] = useState(src?.deliveryTerms ?? s.deliveryTerms);
  const [locale, setLocale] = useState<'de' | 'en'>(src?.locale ?? 'de');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  const companies = optionsQ.data?.companies ?? [];
  const company = companies.find((c) => c.id === companyId);
  const vacancies = (optionsQ.data?.vacancies ?? []).filter((v) => v.companyId === companyId);
  const vacancy = vacancies.find((v) => v.id === vacancyId);
  const filteredCompanies = useMemo(() => {
    const n = companySearch.trim().toLowerCase();
    return n ? companies.filter((c) => `${c.name} ${c.city ?? ''}`.toLowerCase().includes(n)) : companies;
  }, [companies, companySearch]);

  const pickCompany = (c: CompanyOpt) => {
    setCompanyId(c.id);
    if (!src) {
      setContactName(c.contactName ?? '');
      setContactEmail('');
      setVacancyId('');
    }
  };
  useEffect(() => {
    // Prefill the contact from the company chosen via ?companyId=.
    if (!src && company && !contactName && initial.companyId === company.id) setContactName(company.contactName ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const parsed = lines.map((l) => ({
    description: l.description.trim(),
    quantity: parseQty(l.qty),
    unit: l.unit,
    unitPriceCents: parseEuro(l.price),
    vatRate: small || l.vat.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(l.vat)))),
    catalogueId: l.catalogueId,
  }));
  const rate = small ? 0 : Math.max(0, Math.min(100, Math.round(Number(vatRate) || 0)));
  const discountNum = discountType === 'AMOUNT' ? parseEuro(discountValue || '0') : discountType === 'PERCENT' ? Number((discountValue || '0').replace(',', '.')) : 0;
  const linesValid = parsed.length > 0 && parsed.every((l) => l.description && Number.isFinite(l.quantity) && Number.isFinite(l.unitPriceCents));
  const discountValid = discountType === 'NONE' || (Number.isFinite(discountNum) && discountNum >= 0 && (discountType !== 'PERCENT' || discountNum <= 100));
  const totals = computeTotals(
    parsed.map((l) => ({ quantity: Number.isFinite(l.quantity) ? l.quantity : 0, unitPriceCents: Number.isFinite(l.unitPriceCents) ? l.unitPriceCents : 0, vatRate: l.vatRate })),
    rate,
    discountType,
    Number.isFinite(discountNum) ? discountNum : 0,
  );
  const persons = vacancy?.positions ?? Math.max(0, ...parsed.filter((l) => l.unit === 'PERSON' && Number.isFinite(l.quantity)).map((l) => l.quantity));
  const valid = !!companyId && linesValid && discountValid && !!title.trim() && !!validUntil;

  const fill = (text: string) =>
    text
      .replace(/\{firma\}/g, company?.name ?? '')
      .replace(/\{ansprechpartner\}/g, contactName.trim() || 'Damen und Herren')
      .replace(/\{anzahl\}/g, persons ? String(persons) : 'mehreren')
      .replace(/\{gueltigBis\}/g, validUntil ? deDate(validUntil) : '');

  const addFromCatalogue = (c: CatalogueItem) =>
    setLines((ls) => [
      ...ls,
      {
        key: ++lineSeq,
        description: c.name,
        qty: c.unit === 'PERSON' && persons ? String(persons) : '1',
        unit: c.unit,
        price: centsToInput(c.unitPriceCents),
        vat: c.vatRate === null ? '' : String(c.vatRate),
        catalogueId: c.id,
      },
    ]);
  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pickVacancy = (v: VacancyOpt | null) => {
    setVacancyId(v?.id ?? '');
    // Positions prefill the quantity of the "per person" lines already chosen.
    if (v) setLines((ls) => ls.map((l) => (l.unit === 'PERSON' ? { ...l, qty: String(v.positions) } : l)));
  };

  const goTo = (n: number) => {
    // Entering the texts step: suggest a subject and the first templates when still empty.
    if (n === 3) {
      if (!title.trim()) setTitle(vacancy ? `Personalvermittlung: ${vacancy.title} (${vacancy.positions} ${vacancy.positions === 1 ? 'Fachkraft' : 'Fachkräfte'})` : persons ? `Personalvermittlung von ${persons} ${persons === 1 ? 'Fachkraft' : 'Fachkräften'}` : 'Personalvermittlung und Begleitung');
      if (!introText.trim() && s.introTemplates[0]) setIntroText(fill(s.introTemplates[0].text));
      if (!closingText.trim() && s.closingTemplates[0]) setClosingText(fill(s.closingTemplates[0].text));
    }
    if (previewUrl && n !== 4) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setStep(n);
  };

  const payload = () => ({
    companyId,
    vacancyId: vacancyId || null,
    contactName: contactName.trim() || null,
    contactEmail: contactEmail.trim(),
    locale,
    title: title.trim(),
    salutation: salutation.trim() || null,
    introText: introText.trim() || null,
    closingText: closingText.trim() || null,
    items: parsed,
    discount: { type: discountType, value: discountType === 'NONE' ? 0 : discountNum },
    ...(small ? {} : { vatRate: rate }),
    validUntil,
    paymentTerms: paymentTerms.trim() || null,
    deliveryTerms: deliveryTerms.trim() || null,
  });

  const preview = useMutation({
    mutationFn: async () => (await api.post<Blob>('/admin/quotes/preview', payload(), { responseType: 'blob' })).data,
    onSuccess: (blob) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })));
    },
    onError: (e) => toast.error(errText(e)),
  });
  const save = useMutation({
    mutationFn: async (send: boolean) => {
      const saved = src
        ? (await api.put<{ quote: DetailQuote }>(`/admin/quotes/${src.id}`, payload())).data.quote
        : (await api.post<{ quote: DetailQuote }>('/admin/quotes', payload())).data.quote;
      if (!send) return { quote: saved, emailed: null as boolean | null };
      const r = (await api.post<{ quote: DetailQuote; emailed: boolean }>(`/admin/quotes/${saved.id}/send`, { locale })).data;
      return { quote: r.quote, emailed: r.emailed as boolean | null };
    },
    onSuccess: (r) => {
      if (r.emailed === null) toast.success(t('adminQuotes.toasts.saved'));
      else if (r.emailed) toast.success(t('adminQuotes.toasts.sent', { number: r.quote.number }));
      else toast.warning(t('adminQuotes.toasts.sentNoMail', { number: r.quote.number }));
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['admin-quote', r.quote.id] });
      onSaved(r.quote.id);
    },
    onError: (e) => toast.error(errText(e)),
  });
  const improve = useMutation({
    mutationFn: async (a: { kind: 'intro' | 'closing'; text: string }) => ({ kind: a.kind, text: (await api.post<{ text: string }>('/admin/quotes/improve', a)).data.text }),
    onSuccess: (r) => {
      if (r.kind === 'intro') setIntroText(r.text);
      else setClosingText(r.text);
      toast.success(t('adminQuotes.wizard.improved'));
    },
    onError: (e) => toast.error(errText(e)),
  });

  const canNext = step === 0 ? !!companyId : step === 2 ? linesValid && discountValid : step === 3 ? !!title.trim() && !!validUntil : true;
  const busy = save.isPending;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      size="lg"
      title={src ? t('adminQuotes.wizard.editTitle') : t('adminQuotes.wizard.newTitle')}
      footer={
        <>
          {step > 0 && (
            <button type="button" className="btn-white btn-sm mr-auto border border-line" onClick={() => goTo(step - 1)} disabled={busy}>
              <ArrowLeft className="size-3.5" aria-hidden /> {t('adminQuotes.wizard.back')}
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn-primary btn-sm" disabled={!canNext} onClick={() => goTo(step + 1)}>
              {t('adminQuotes.wizard.next')} <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : (
            <>
              <button type="button" className="btn-white btn-sm border border-line" disabled={!valid || busy} onClick={() => save.mutate(false)}>
                {busy && save.variables === false && <Spinner className="size-3.5" />} {t('adminQuotes.wizard.saveDraft')}
              </button>
              <button type="button" className="btn-primary btn-sm" disabled={!valid || busy} onClick={() => save.mutate(true)}>
                {busy && save.variables === true && <Spinner className="size-3.5" />} <Send className="size-3.5" aria-hidden /> {t('adminQuotes.wizard.saveAndSend')}
              </button>
            </>
          )}
        </>
      }
    >
      {/* Steps */}
      <ol className="mb-5 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {STEPS.map((k, i) => (
          <li key={k} className="shrink-0">
            <button
              type="button"
              disabled={i > step && !(i <= 4 && companyId && (i <= 2 || linesValid))}
              onClick={() => goTo(i)}
              className={clsx(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:opacity-40',
                i === step ? 'bg-navy-900 text-white' : i < step ? 'bg-brand-100 text-brand-700' : 'bg-surface text-muted',
              )}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="tabular-nums">{i + 1}</span> {t(`adminQuotes.wizard.steps.${k}`)}
            </button>
          </li>
        ))}
      </ol>

      {settings.legalMissing.length > 0 && step === 4 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('adminQuotes.wizard.legalMissing')}
        </p>
      )}

      {step === 0 && (
        <div className="space-y-4">
          {optionsQ.isLoading ? (
            <LoadingBlock className="min-h-40" />
          ) : prospectOpen ? (
            <ProspectForm
              onCancel={() => setProspectOpen(false)}
              onCreated={(c) => {
                void qc.invalidateQueries({ queryKey: ['admin-quote-options'] });
                qc.setQueryData<Options>(['admin-quote-options'], (o) => (o ? { ...o, companies: [...o.companies, c].sort((a, b) => a.name.localeCompare(b.name)) } : o));
                pickCompany(c);
                setProspectOpen(false);
              }}
            />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">{t('adminQuotes.wizard.searchCompany')}</span>
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
                  <input type="search" className="input pl-9" placeholder={t('adminQuotes.wizard.searchCompany')} value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} />
                </label>
                <button type="button" className="btn-white btn-sm border border-line" onClick={() => setProspectOpen(true)}>
                  <Plus className="size-3.5" aria-hidden /> {t('adminQuotes.wizard.newProspect')}
                </button>
              </div>
              <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line" role="listbox" aria-label={t('adminQuotes.wizard.chooseCompany')}>
                {filteredCompanies.slice(0, 200).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={c.id === companyId}
                      onClick={() => pickCompany(c)}
                      className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition', c.id === companyId ? 'bg-brand-50' : 'hover:bg-surface')}
                    >
                      <Building2 className={clsx('size-4 shrink-0', c.id === companyId ? 'text-brand-600' : 'text-muted')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-navy-900">{c.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {[c.city, c.email].filter(Boolean).join(' · ') || '—'}
                          {c.status === 'PENDING' && ` · ${t('adminQuotes.wizard.pending')}`}
                        </span>
                      </span>
                      {c.id === companyId && <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden />}
                    </button>
                  </li>
                ))}
              </ul>
              {company && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="qw-contact" label={t('adminQuotes.wizard.contactName')}>
                    <input id="qw-contact" className="input" maxLength={160} value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  </Field>
                  <Field id="qw-email" label={t('adminQuotes.wizard.contactEmail')} hint={t('adminQuotes.wizard.contactEmailHint')}>
                    <input id="qw-email" type="email" className="input" maxLength={200} placeholder={company.email ?? ''} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
                  </Field>
                  {!company.email && !contactEmail.trim() && <p className="text-xs text-amber-700 sm:col-span-2">{t('adminQuotes.wizard.noEmail')}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">{t('adminQuotes.wizard.vacancyHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ChoiceCard active={!vacancyId} onClick={() => pickVacancy(null)} title={t('adminQuotes.wizard.noVacancy')} />
            {vacancies.map((v) => (
              <ChoiceCard key={v.id} active={vacancyId === v.id} onClick={() => pickVacancy(v)} title={v.title || '—'} hint={t('adminQuotes.wizard.positions', { count: v.positions })} />
            ))}
          </div>
          {vacancies.length === 0 && <p className="text-sm text-muted">{t('adminQuotes.wizard.noVacancies')}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <p className="label">{t('adminQuotes.wizard.catalogue')}</p>
            <div className="flex flex-wrap gap-1.5">
              {s.catalogue
                .filter((c) => c.active)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addFromCatalogue(c)}
                    className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-left text-xs font-semibold text-navy-900 transition hover:border-brand-400 hover:bg-brand-50"
                  >
                    <Plus className="size-3.5 shrink-0 text-brand-600" aria-hidden />
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 font-normal text-muted tabular-nums">{fmtEur(c.unitPriceCents)}</span>
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setLines((ls) => [...ls, { key: ++lineSeq, description: '', qty: '1', unit: 'FLAT', price: '', vat: '', catalogueId: null }])}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand-400 hover:text-navy-900"
              >
                <Pencil className="size-3.5" aria-hidden /> {t('adminQuotes.wizard.customLine')}
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('adminQuotes.wizard.noItems')}</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l, i) => {
                const p = parsed[i];
                const total = Number.isFinite(p.quantity) && Number.isFinite(p.unitPriceCents) ? Math.round(p.quantity * p.unitPriceCents) : null;
                return (
                  <li key={l.key} className="space-y-2 rounded-xl border border-line p-2.5">
                    <div className="flex gap-2">
                      <input className="input min-w-0 flex-1" aria-label={t('adminQuotes.wizard.description')} placeholder={t('adminQuotes.wizard.description')} maxLength={500} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                      <button type="button" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger" aria-label={t('adminQuotes.wizard.removeLine')} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                        <X className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[5rem_8rem_8rem_7rem_1fr] sm:items-center">
                      <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.quantity) && l.qty && 'border-danger')} inputMode="decimal" aria-label={t('adminQuotes.wizard.qty')} placeholder={t('adminQuotes.wizard.qty')} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                      <select className="input" aria-label={t('adminQuotes.wizard.unit')} value={l.unit} onChange={(e) => setLine(l.key, { unit: e.target.value as Unit })}>
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {t(`adminQuotes.wizard.units.${u}`)}
                          </option>
                        ))}
                      </select>
                      <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.unitPriceCents) && l.price && 'border-danger')} inputMode="decimal" aria-label={t('adminQuotes.wizard.unitPrice')} placeholder={t('adminQuotes.wizard.unitPrice')} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                      {small ? (
                        <span className="text-xs text-muted">0 %</span>
                      ) : (
                        <select className="input" aria-label={t('adminQuotes.wizard.vat')} value={l.vat} onChange={(e) => setLine(l.key, { vat: e.target.value })}>
                          <option value="">{t('adminQuotes.wizard.vatDefault', { rate })}</option>
                          {[19, 7, 0].map((r) => (
                            <option key={r} value={String(r)}>
                              {r} %
                            </option>
                          ))}
                        </select>
                      )}
                      <span className="col-span-2 text-right text-sm font-semibold text-navy-900 tabular-nums sm:col-span-1">{total === null ? '—' : fmtEur(total)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <div className="grid content-start gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="label">{t('adminQuotes.wizard.discount')}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['NONE', 'PERCENT', 'AMOUNT'] as const).map((d) => (
                    <Chip key={d} active={discountType === d} onClick={() => setDiscountType(d)}>
                      {t(`adminQuotes.wizard.discountType.${d}`)}
                    </Chip>
                  ))}
                  {discountType !== 'NONE' && (
                    <input
                      className={clsx('input w-28 text-right tabular-nums', !discountValid && 'border-danger')}
                      inputMode="decimal"
                      aria-label={t('adminQuotes.wizard.discount')}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'PERCENT' ? '10' : '500,00'}
                    />
                  )}
                </div>
              </div>
              {small ? (
                <p className="text-xs text-muted sm:col-span-2">{t('adminQuotes.wizard.smallBusiness')}</p>
              ) : (
                <Field id="qw-vat" label={t('adminQuotes.wizard.vatRate')}>
                  <input id="qw-vat" type="number" min={0} max={100} className="input" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
                </Field>
              )}
              <Field id="qw-valid" label={t('adminQuotes.wizard.validUntil')}>
                <input id="qw-valid" type="date" className="input" min={isoDay(new Date())} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            </div>
            <TotalsBox totals={totals} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Field id="qw-title" label={`${t('adminQuotes.wizard.title')} *`}>
            <input id="qw-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="qw-salutation" label={t('adminQuotes.wizard.salutation')} hint={t('adminQuotes.wizard.salutationHint', { name: contactName || '…' })}>
            <input id="qw-salutation" className="input" maxLength={200} value={salutation} onChange={(e) => setSalutation(e.target.value)} />
          </Field>
          <TextBlock
            id="qw-intro"
            label={t('adminQuotes.wizard.intro')}
            value={introText}
            onChange={setIntroText}
            templates={s.introTemplates}
            fill={fill}
            ai={optionsQ.data?.ai.available ? () => improve.mutate({ kind: 'intro', text: introText }) : undefined}
            aiBusy={improve.isPending && improve.variables?.kind === 'intro'}
          />
          <TextBlock
            id="qw-closing"
            label={t('adminQuotes.wizard.closing')}
            value={closingText}
            onChange={setClosingText}
            templates={s.closingTemplates}
            fill={fill}
            ai={optionsQ.data?.ai.available ? () => improve.mutate({ kind: 'closing', text: closingText }) : undefined}
            aiBusy={improve.isPending && improve.variables?.kind === 'closing'}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="qw-pay" label={t('adminQuotes.wizard.payment')}>
              <textarea id="qw-pay" className="input resize-y" rows={3} maxLength={2000} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </Field>
            <Field id="qw-del" label={t('adminQuotes.wizard.delivery')}>
              <textarea id="qw-del" className="input resize-y" rows={3} maxLength={2000} value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} />
            </Field>
          </div>
          <div>
            <p className="label">{t('adminQuotes.wizard.emailLanguage')}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['de', 'en'] as const).map((l) => (
                <Chip key={l} active={locale === l} onClick={() => setLocale(l)}>
                  {t(`adminQuotes.wizard.languages.${l}`)}
                </Chip>
              ))}
              <span className="text-xs text-muted">{t('adminQuotes.wizard.emailLanguageHint')}</span>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-navy-900">{company?.name}</p>
              <p className="text-ink">{title}</p>
              <p className="text-xs text-muted">
                {t('adminQuotes.wizard.validUntil')}: {validUntil ? deDate(validUntil) : '—'} · {parsed.length} × {t('adminQuotes.detail.items')}
              </p>
              {!valid && <p className="text-xs text-amber-700">{t('adminQuotes.wizard.invalid')}</p>}
            </div>
            <TotalsBox totals={totals} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-white btn-sm border border-line" disabled={!valid || preview.isPending} onClick={() => preview.mutate()}>
              {preview.isPending ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" aria-hidden />} {t('adminQuotes.wizard.previewPdf')}
            </button>
            {previewUrl && (
              <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                <ExternalLink className="size-3.5" aria-hidden /> {t('adminQuotes.wizard.openPdf')}
              </a>
            )}
            <span className="text-xs text-muted">{t('adminQuotes.wizard.previewHint')}</span>
          </div>
          {previewUrl && <iframe title={t('adminQuotes.wizard.previewPdf')} src={previewUrl} className="h-[60vh] w-full rounded-xl border border-line bg-white" />}
        </div>
      )}
    </Modal>
  );
};

const TotalsBox = ({ totals }: { totals: ReturnType<typeof computeTotals> }) => {
  const { t } = useTranslation();
  return (
    <dl className="space-y-1.5 rounded-xl bg-surface p-4 text-sm tabular-nums">
      {totals.discount > 0 && (
        <>
          <div className="flex justify-between">
            <dt className="text-muted">{t('adminQuotes.wizard.subtotal')}</dt>
            <dd>{fmtEur(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">{t('adminQuotes.wizard.discountRow')}</dt>
            <dd>-{fmtEur(totals.discount)}</dd>
          </div>
        </>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">{t('adminQuotes.wizard.net')}</dt>
        <dd>{fmtEur(totals.net)}</dd>
      </div>
      {totals.vat.map((g) => (
        <div key={g.rate} className="flex justify-between">
          <dt className="text-muted">{t('adminQuotes.wizard.vatAmount', { rate: g.rate })}</dt>
          <dd>{fmtEur(g.vatCents)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold text-navy-900">
        <dt>{t('adminQuotes.wizard.gross')}</dt>
        <dd>{fmtEur(totals.gross)}</dd>
      </div>
    </dl>
  );
};

const TextBlock = ({
  id,
  label,
  value,
  onChange,
  templates,
  fill,
  ai,
  aiBusy,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  templates: Template[];
  fill: (s: string) => string;
  ai?: () => void;
  aiBusy?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className="label mb-0" htmlFor={id}>
          {label}
        </label>
        {ai && (
          <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50" disabled={aiBusy || value.trim().length < 3} onClick={ai}>
            {aiBusy ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" aria-hidden />} {aiBusy ? t('adminQuotes.wizard.improving') : t('adminQuotes.wizard.improve')}
          </button>
        )}
      </div>
      {templates.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">{t('adminQuotes.wizard.templates')}:</span>
          {templates.map((tp) => (
            <Chip key={tp.id} active={fill(tp.text) === value} onClick={() => onChange(fill(tp.text))}>
              {tp.name}
            </Chip>
          ))}
        </div>
      )}
      <textarea id={id} className="input resize-y" rows={4} maxLength={5000} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
};

const ChoiceCard = ({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint?: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx('flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left text-sm transition', active ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-400')}
  >
    <span className={clsx('grid size-5 shrink-0 place-items-center rounded-full border', active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line')}>{active && <CheckCircle2 className="size-3.5" aria-hidden />}</span>
    <span className="min-w-0">
      <span className="block truncate font-semibold text-navy-900">{title}</span>
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </span>
  </button>
);

const ProspectForm = ({ onCancel, onCreated }: { onCancel: () => void; onCreated: (c: CompanyOpt) => void }) => {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', contactName: '', email: '', city: '', address: '' });
  const m = useMutation({
    mutationFn: async () => (await api.post<{ company: CompanyOpt }>('/admin/quotes/prospect', f)).data.company,
    onSuccess: (c) => {
      toast.success(t('adminQuotes.toasts.prospect'));
      onCreated(c);
    },
    onError: (e) => toast.error(errText(e)),
  });
  const input = (k: keyof typeof f, type = 'text', max = 200) => (
    <Field id={`qp-${k}`} label={`${t(`adminQuotes.wizard.prospect.${k}`)}${k === 'name' ? ' *' : ''}`}>
      <input id={`qp-${k}`} type={type} className="input" maxLength={max} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </Field>
  );
  return (
    <form
      className="space-y-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (f.name.trim().length >= 2) m.mutate();
      }}
    >
      <p className="text-sm font-semibold text-navy-900">{t('adminQuotes.wizard.prospect.title')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {input('name')}
        {input('contactName', 'text', 160)}
        {input('email', 'email')}
        {input('city', 'text', 100)}
        <div className="sm:col-span-2">
          <Field id="qp-address" label={t('adminQuotes.wizard.prospect.address')}>
            <textarea id="qp-address" className="input resize-y" rows={2} maxLength={1000} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-white btn-sm border border-line" onClick={onCancel} disabled={m.isPending}>
          {t('adminQuotes.wizard.prospect.cancel')}
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={f.name.trim().length < 2 || m.isPending}>
          {m.isPending && <Spinner className="size-3.5" />} {t('adminQuotes.wizard.prospect.create')}
        </button>
      </div>
    </form>
  );
};

const Field = ({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

// ─── Settings tab ───────────────────────────────────────────────────

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const SettingsTab = ({ q }: { q: { data?: SettingsResponse; isLoading: boolean; error: unknown; refetch: () => unknown } }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<QuoteSettings | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data && !form) {
      setForm(q.data.settings);
      setPrices(Object.fromEntries(q.data.settings.catalogue.map((c) => [c.id, centsToInput(c.unitPriceCents)])));
    }
  }, [q.data, form]);

  const save = useMutation({
    mutationFn: async (value: QuoteSettings) => (await api.put<SettingsResponse>('/admin/quotes/settings', { settings: value })).data,
    onSuccess: (data) => {
      qc.setQueryData(['admin-quote-settings'], data);
      setForm(data.settings);
      setPrices(Object.fromEntries(data.settings.catalogue.map((c) => [c.id, centsToInput(c.unitPriceCents)])));
      toast.success(t('adminQuotes.toasts.settings'));
    },
    onError: (e) => toast.error(errText(e)),
  });

  if (q.isLoading || (!form && !q.error)) return <LoadingBlock />;
  if (q.error || !q.data || !form) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const set = <K extends keyof QuoteSettings>(k: K, v: QuoteSettings[K]) => setForm({ ...form, [k]: v });
  const setItem = (id: string, patch: Partial<CatalogueItem>) => set('catalogue', form.catalogue.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const priceValid = (id: string) => Number.isFinite(parseEuro(prices[id] ?? ''));
  const allValid = form.catalogue.every((c) => c.name.trim() && priceValid(c.id)) && [...form.introTemplates, ...form.closingTemplates].every((x) => x.name.trim());

  const templates = (k: 'introTemplates' | 'closingTemplates', title: string) => (
    <Panel
      title={title}
      icon={FileText}
      actions={
        form[k].length < 20 && (
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => set(k, [...form[k], { id: newId('t'), name: '', text: '' }])}>
            <Plus className="size-3.5" aria-hidden /> {t('adminQuotes.settings.addTemplate')}
          </button>
        )
      }
    >
      <p className="mb-3 text-[11px] text-muted">{t('adminQuotes.settings.placeholders')}</p>
      <ul className="space-y-3">
        {form[k].map((tp) => (
          <li key={tp.id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1" aria-label={t('adminQuotes.settings.templateName')} placeholder={t('adminQuotes.settings.templateName')} maxLength={80} value={tp.name} onChange={(e) => set(k, form[k].map((x) => (x.id === tp.id ? { ...x, name: e.target.value } : x)))} />
              <button type="button" className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger" aria-label={t('adminQuotes.settings.remove')} onClick={() => set(k, form[k].filter((x) => x.id !== tp.id))}>
                <Trash2 className="size-4" />
              </button>
            </div>
            <textarea className="input resize-y" rows={3} maxLength={4000} aria-label={t('adminQuotes.settings.templateText')} value={tp.text} onChange={(e) => set(k, form[k].map((x) => (x.id === tp.id ? { ...x, text: e.target.value } : x)))} />
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!allValid) return;
        save.mutate({ ...form, catalogue: form.catalogue.map((c) => ({ ...c, name: c.name.trim(), unitPriceCents: parseEuro(prices[c.id] ?? '0') })) });
      }}
    >
      <Panel
        title={t('adminQuotes.settings.catalogue')}
        icon={Receipt}
        actions={
          form.catalogue.length < 100 && (
            <button
              type="button"
              className="btn-white btn-sm border border-line"
              onClick={() => {
                const id = newId('c');
                set('catalogue', [...form.catalogue, { id, name: '', unit: 'PERSON', unitPriceCents: 0, vatRate: null, active: true }]);
                setPrices((p) => ({ ...p, [id]: '' }));
              }}
            >
              <Plus className="size-3.5" aria-hidden /> {t('adminQuotes.settings.add')}
            </button>
          )
        }
      >
        <p className="mb-3 text-xs text-muted">{t('adminQuotes.settings.catalogueHint')}</p>
        <ul className="space-y-2">
          {form.catalogue.map((c) => (
            <li key={c.id} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_auto_auto] sm:items-center">
              <input className="input col-span-2 sm:col-span-1" aria-label={t('adminQuotes.settings.name')} placeholder={t('adminQuotes.settings.name')} maxLength={300} value={c.name} onChange={(e) => setItem(c.id, { name: e.target.value })} />
              <select className="input" aria-label={t('adminQuotes.wizard.unit')} value={c.unit} onChange={(e) => setItem(c.id, { unit: e.target.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`adminQuotes.wizard.units.${u}`)}
                  </option>
                ))}
              </select>
              <input
                className={clsx('input text-right tabular-nums', !priceValid(c.id) && 'border-danger')}
                inputMode="decimal"
                aria-label={t('adminQuotes.settings.price')}
                placeholder={t('adminQuotes.settings.price')}
                value={prices[c.id] ?? ''}
                onChange={(e) => setPrices((p) => ({ ...p, [c.id]: e.target.value }))}
              />
              <select className="input" aria-label={t('adminQuotes.wizard.vat')} value={c.vatRate === null ? '' : String(c.vatRate)} onChange={(e) => setItem(c.id, { vatRate: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t('adminQuotes.settings.vatPlaceholder')}</option>
                {[19, 7, 0].map((r) => (
                  <option key={r} value={String(r)}>
                    {r} %
                  </option>
                ))}
              </select>
              <span className="flex items-center gap-2 text-xs text-muted">
                <Switch checked={c.active} onChange={(v) => setItem(c.id, { active: v })} label={t('adminQuotes.settings.active')} />
                <span className="sm:sr-only">{t('adminQuotes.settings.active')}</span>
              </span>
              <button type="button" className="grid size-10 place-items-center justify-self-end rounded-lg text-muted hover:bg-red-50 hover:text-danger" aria-label={t('adminQuotes.settings.remove')} onClick={() => set('catalogue', form.catalogue.filter((x) => x.id !== c.id))}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {templates('introTemplates', t('adminQuotes.settings.intro'))}
        {templates('closingTemplates', t('adminQuotes.settings.closing'))}
      </div>

      <Panel title={t('adminQuotes.settings.defaults')} icon={Settings2}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="qs-valid" label={t('adminQuotes.settings.validDays')}>
            <input id="qs-valid" type="number" min={1} max={365} className="input" value={form.validDays} onChange={(e) => set('validDays', Number(e.target.value))} />
          </Field>
          <Field id="qs-remind" label={t('adminQuotes.settings.reminderDays')}>
            <input id="qs-remind" type="number" min={1} max={30} className="input" value={form.reminderDays} onChange={(e) => set('reminderDays', Number(e.target.value))} />
          </Field>
          <Field id="qs-pay" label={t('adminQuotes.settings.paymentTerms')}>
            <textarea id="qs-pay" className="input resize-y" rows={3} maxLength={2000} value={form.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
          </Field>
          <Field id="qs-del" label={t('adminQuotes.settings.deliveryTerms')}>
            <textarea id="qs-del" className="input resize-y" rows={3} maxLength={2000} value={form.deliveryTerms} onChange={(e) => set('deliveryTerms', e.target.value)} />
          </Field>
        </div>
      </Panel>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={save.isPending || !allValid}>
          {save.isPending && <Spinner className="size-4" />}
          {t('adminQuotes.settings.save')}
        </button>
      </div>
    </form>
  );
};
