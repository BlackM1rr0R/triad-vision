import { useEffect, useState } from 'react';
import { Link, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Inbox, Languages, Lock, Mail, Phone, Search, Settings2, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesTranslations } from '@/i18n/pagesTranslations';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, StatTile, Switch } from '@/components/admin/ui';
import { MultiFileDrop } from '@/components/translations/MultiFileDrop';
import { PricingDialog } from '@/components/translations/PricingDialog';
import { OrderDraftButton } from '@/components/aiDocs/OrderDraftButton';
import {
  SERVICES,
  STATUSES,
  TrFileRow,
  TrStatusPill,
  TrStepper,
  useTrError,
  useTrFormat,
  type TrPricing,
  type TrService,
  type TrStaffOrder,
  type TrStatus,
} from '@/components/translations/shared';
import { optimizeImages } from '@/lib/imageCompress';

registerCopy(pagesTranslations);

interface ListItem {
  id: string;
  number: number;
  key: string;
  service: TrService;
  sourceLang: string;
  targetLang: string;
  pages: number;
  urgency: 'STANDARD' | 'EXPRESS';
  status: TrStatus;
  priceCents: number | null;
  currency: string;
  dueAt: string | null;
  createdAt: string;
  overdue: boolean;
  client: { id: string; firstName: string; lastName: string; email: string };
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  case: { id: string; number: string } | null;
  fileCount: number;
}

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

/** Mirrors STATUS_TRANSITIONS on the server (quote and acceptance have their own actions). */
const NEXT: Record<TrStatus, TrStatus[]> = {
  NEW: ['CANCELLED'],
  QUOTED: ['CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'CANCELLED'],
  READY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

const name = (p: { firstName: string; lastName: string } | null | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : '—');
const toDateInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** A picked day means "by the end of the working day" (18:00 local). */
const fromDateInput = (v: string) => (v ? new Date(`${v}T18:00:00`).toISOString() : null);

const usePricing = () =>
  useQuery({ queryKey: ['translations', 'pricing'], queryFn: async () => (await api.get<{ pricing: TrPricing }>('/translations/pricing')).data.pricing, staleTime: 5 * 60_000 });

const usePeople = () =>
  useQuery({ queryKey: ['tasks', 'people'], queryFn: async () => (await api.get<{ people: Person[] }>('/tasks/people')).data.people, staleTime: 5 * 60_000 });

// ─── List ─────────────────────────────────────────────────────────────────

const OrdersTable = () => {
  const { t } = useTranslation();
  const f = useTrFormat();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const [params, setParams] = useSearchParams();
  const [pricingOpen, setPricingOpen] = useState(false);
  const { data: pricing } = usePricing();
  const status = params.get('status') ?? 'open';
  const service = params.get('service') ?? '';
  const assignee = params.get('assignee') ?? '';
  const overdue = params.get('overdue') === '1';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('search') ?? '');

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        if (k !== 'page') n.delete('page');
        return n;
      },
      { replace: true },
    );

  useEffect(() => {
    const h = setTimeout(() => {
      if ((params.get('search') ?? '') !== search.trim()) set('search', search.trim() || null);
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const qs = new URLSearchParams();
  if (status !== 'all') qs.set('status', status);
  if (service) qs.set('service', service);
  if (assignee) qs.set('assignee', assignee);
  if (overdue) qs.set('overdue', '1');
  if (params.get('search')) qs.set('search', params.get('search')!);
  qs.set('page', String(page));
  qs.set('pageSize', '30');

  const list = useQuery({
    queryKey: ['admin-translations', qs.toString()],
    queryFn: async () => (await api.get<{ items: ListItem[]; total: number; page: number; pageSize: number }>(`/admin/translations?${qs}`)).data,
    placeholderData: keepPreviousData,
  });
  const summary = useQuery({
    queryKey: ['admin-translations', 'summary'],
    queryFn: async () => (await api.get<{ open: number; new: number; overdue: number; ready: number }>('/admin/translations/summary')).data,
  });

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div>
      <PageHead
        title={t('trOrders.admin.title')}
        subtitle={t('trOrders.admin.subtitle')}
        actions={
          isAdmin && (
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => setPricingOpen(true)}>
              <Settings2 className="size-4" aria-hidden /> {t('trOrders.admin.prices')}
            </button>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('trOrders.admin.tiles.open')} value={summary.data?.open ?? '—'} icon={ClipboardList} />
        <StatTile label={t('trOrders.admin.tiles.new')} value={summary.data?.new ?? '—'} icon={Inbox} tone={summary.data?.new ? 'warn' : undefined} />
        <StatTile label={t('trOrders.admin.tiles.overdue')} value={summary.data?.overdue ?? '—'} icon={AlertTriangle} tone={summary.data?.overdue ? 'danger' : undefined} />
        <StatTile label={t('trOrders.admin.tiles.ready')} value={summary.data?.ready ?? '—'} icon={CheckCircle2} tone={summary.data?.ready ? 'good' : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder={t('trOrders.admin.filters.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('trOrders.admin.filters.search')} />
        </label>
        <select className="input w-auto" value={status} onChange={(e) => set('status', e.target.value)} aria-label={t('trOrders.admin.cols.status')}>
          <option value="open">{t('trOrders.admin.filters.open')}</option>
          <option value="all">{t('trOrders.admin.filters.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`trOrders.status.${s}`)}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={service} onChange={(e) => set('service', e.target.value || null)} aria-label={t('trOrders.admin.cols.service')}>
          <option value="">{t('trOrders.admin.filters.allServices')}</option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {t(`trOrders.service.${s}`)}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={assignee} onChange={(e) => set('assignee', e.target.value || null)} aria-label={t('trOrders.admin.cols.assignee')}>
          <option value="">{t('trOrders.admin.filters.anyAssignee')}</option>
          <option value="me">{t('trOrders.admin.filters.mine')}</option>
          <option value="none">{t('trOrders.admin.filters.unassigned')}</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <Switch checked={overdue} onChange={(v: boolean) => set('overdue', v ? '1' : null)} label={t('trOrders.admin.filters.overdue')} />
          {t('trOrders.admin.filters.overdue')}
        </label>
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Languages} title={t('trOrders.admin.empty')} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.number')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.client')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.service')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.languages')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.status')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.due')}</th>
                  <th className="px-4 py-2.5">{t('trOrders.admin.cols.assignee')}</th>
                  <th className="px-4 py-2.5 text-right">{t('trOrders.admin.cols.price')}</th>
                </tr>
              </thead>
              <tbody className={clsx('divide-y divide-line', list.isFetching && 'opacity-60')}>
                {list.data.items.map((o) => (
                  <tr key={o.id} className={clsx('transition hover:bg-surface/60', o.overdue && 'bg-red-50/60')}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link to={o.id} className="font-semibold text-brand-700 tabular-nums hover:underline">
                        {o.key}
                      </Link>
                      {o.urgency === 'EXPRESS' && <span className="ml-1.5 badge bg-amber-100 text-amber-800">{t('trOrders.urgency.EXPRESS')}</span>}
                      <span className="block text-[11px] text-muted">{f.day(o.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-ink">{name(o.client)}</span>
                      <span className="block truncate text-[11px] text-muted">{o.client.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {t(`trOrders.service.${o.service}`)}
                      <span className="block text-[11px] text-muted">
                        {t('trOrders.pagesCount', { count: o.pages })} · {o.fileCount} <FileText className="inline size-3" aria-hidden />
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap uppercase">
                      {o.sourceLang} → {o.targetLang}
                    </td>
                    <td className="px-4 py-3">
                      <TrStatusPill status={o.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {o.overdue ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-danger">
                          <AlertTriangle className="size-3.5" aria-hidden /> {f.day(o.dueAt)}
                        </span>
                      ) : (
                        f.day(o.dueAt)
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink/80">{o.assignedStaff ? name(o.assignedStaff) : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{o.priceCents != null ? f.money(o.priceCents, o.currency) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-muted">
            <span>{t('trOrders.admin.total', { count: list.data.total })}</span>
            {pages > 1 && (
              <span className="flex items-center gap-1">
                <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-surface disabled:opacity-40" disabled={page <= 1} onClick={() => set('page', String(page - 1))} aria-label="‹">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="tabular-nums">
                  {page} / {pages}
                </span>
                <button type="button" className="grid size-8 place-items-center rounded-md hover:bg-surface disabled:opacity-40" disabled={page >= pages} onClick={() => set('page', String(page + 1))} aria-label="›">
                  <ChevronRight className="size-4" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {isAdmin && <PricingDialog open={pricingOpen} pricing={pricing} onClose={() => setPricingOpen(false)} />}
    </div>
  );
};

// ─── Detail ───────────────────────────────────────────────────────────────

const QuoteForm = ({ order, onSaved }: { order: TrStaffOrder; onSaved: (o: TrStaffOrder) => void }) => {
  const { t } = useTranslation();
  const f = useTrFormat();
  const onError = useTrError();
  const { data: pricing } = usePricing();
  const estimate = pricing
    ? (() => {
        const base = (pricing.perPage[order.service] ?? 0) * order.pages;
        return base + (order.urgency === 'EXPRESS' ? Math.round((base * pricing.expressSurchargePct) / 100) : 0);
      })()
    : null;
  const [price, setPrice] = useState(order.priceCents != null ? (order.priceCents / 100).toFixed(2) : '');
  const [due, setDue] = useState(toDateInput(order.dueAt));
  const [note, setNote] = useState(order.quoteNote ?? '');

  const send = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ order: TrStaffOrder }>(`/admin/translations/${order.id}/quote`, {
          priceCents: Math.round(Number(price.replace(',', '.')) * 100),
          dueAt: fromDateInput(due),
          quoteNote: note || null,
        })
      ).data.order,
    onSuccess: (o) => {
      onSaved(o);
      toast.success(t('trOrders.admin.quote.sent'));
    },
    onError,
  });

  return (
    <Panel title={t('trOrders.admin.quote.title')} icon={ClipboardList} className="bg-card">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="q-price">
              {t('trOrders.admin.quote.price', { currency: order.currency })}
            </label>
            <input id="q-price" type="number" min={0} step="0.01" required className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
            {estimate != null && (
              <button type="button" className="mt-1 text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => setPrice((estimate / 100).toFixed(2))}>
                {t('trOrders.admin.quote.estimate', { price: f.money(estimate, pricing!.currency) })}
              </button>
            )}
          </div>
          <div>
            <label className="label" htmlFor="q-due">
              {t('trOrders.admin.quote.due')}
            </label>
            <input id="q-due" type="date" required className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="q-note">
            {t('trOrders.admin.quote.note')}
          </label>
          <textarea id="q-note" rows={2} maxLength={2000} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div>
          <button type="submit" className="btn-primary btn-sm" disabled={send.isPending || !price || !due}>
            {send.isPending && <Spinner className="size-4" />} {order.status === 'QUOTED' ? t('trOrders.admin.quote.resend') : t('trOrders.admin.quote.send')}
          </button>
        </div>
      </form>
    </Panel>
  );
};

const StatusActions = ({ order, onSaved }: { order: TrStaffOrder; onSaved: (o: TrStaffOrder) => void }) => {
  const { t } = useTranslation();
  const onError = useTrError();
  const [note, setNote] = useState('');
  const [visible, setVisible] = useState(true);
  const next = NEXT[order.status];

  const change = useMutation({
    mutationFn: async (status: TrStatus) => (await api.post<{ order: TrStaffOrder }>(`/admin/translations/${order.id}/status`, { status, note: note || null, visibleToClient: visible })).data.order,
    onSuccess: (o) => {
      onSaved(o);
      setNote('');
      toast.success(t('trOrders.admin.actions.done'));
    },
    onError,
  });

  return (
    <Panel title={t('trOrders.admin.actions.title')} icon={Clock} className="bg-card">
      {order.status === 'QUOTED' && <p className="mb-3 text-sm text-muted">{t('trOrders.admin.actions.waitingClient')}</p>}
      {next.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Lock className="size-4" aria-hidden /> {t('trOrders.admin.actions.final')}
        </p>
      ) : (
        <div className="grid gap-3">
          <div>
            <label className="label" htmlFor="st-note">
              {t('trOrders.admin.actions.note')}
            </label>
            <textarea
              id="st-note"
              rows={2}
              maxLength={2000}
              className="input"
              placeholder={next.length === 1 ? t('trOrders.admin.actions.reasonPlaceholder') : t('trOrders.admin.actions.notePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {order.status === 'ACCEPTED' && (
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <Switch checked={visible} onChange={(v: boolean) => setVisible(v)} label={t('trOrders.admin.actions.visible')} />
              {t('trOrders.admin.actions.visible')}
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={change.isPending || (s === 'CANCELLED' && !note.trim())}
                title={s === 'CANCELLED' && !note.trim() ? t('trOrders.admin.actions.reasonPlaceholder') : undefined}
                className={s === 'CANCELLED' ? 'btn-white btn-sm border border-red-200 text-danger hover:bg-red-50 disabled:opacity-50' : 'btn-primary btn-sm'}
                onClick={() => change.mutate(s)}
              >
                {t(`trOrders.admin.actions.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
};

const ManagePanel = ({ order, onSaved }: { order: TrStaffOrder; onSaved: (o: TrStaffOrder) => void }) => {
  const { t } = useTranslation();
  const onError = useTrError();
  const { data: people } = usePeople();
  const [assignee, setAssignee] = useState(order.assignedStaff?.id ?? '');
  const [due, setDue] = useState(toDateInput(order.dueAt));
  const [tracking, setTracking] = useState(order.trackingNumber ?? '');
  const [staffNote, setStaffNote] = useState(order.staffNote ?? '');

  useEffect(() => {
    setAssignee(order.assignedStaff?.id ?? '');
    setDue(toDateInput(order.dueAt));
    setTracking(order.trackingNumber ?? '');
    setStaffNote(order.staffNote ?? '');
  }, [order.assignedStaff?.id, order.dueAt, order.trackingNumber, order.staffNote]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch<{ order: TrStaffOrder }>(`/admin/translations/${order.id}`, {
          assignedStaffId: assignee || null,
          dueAt: fromDateInput(due),
          trackingNumber: tracking || null,
          staffNote: staffNote || null,
        })
      ).data.order,
    onSuccess: (o) => {
      onSaved(o);
      toast.success(t('trOrders.admin.manage.saved'));
    },
    onError,
  });

  return (
    <Panel title={t('trOrders.admin.manage.title')} icon={UserRound} className="bg-card">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="m-assignee">
            {t('trOrders.admin.manage.assignee')}
          </label>
          <select id="m-assignee" className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">{t('trOrders.admin.manage.unassigned')}</option>
            {(people ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {name(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-due">
              {t('trOrders.admin.manage.dueAt')}
            </label>
            <input id="m-due" type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="m-track">
              {t('trOrders.admin.manage.tracking')}
            </label>
            <input id="m-track" className="input" maxLength={80} value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-note">
            {t('trOrders.admin.manage.staffNote')}
          </label>
          <textarea id="m-note" rows={3} maxLength={5000} className="input" value={staffNote} onChange={(e) => setStaffNote(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">{t('trOrders.admin.manage.staffNoteHint')}</p>
        </div>
        <div>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4" />} {t('common.save')}
          </button>
        </div>
      </form>
    </Panel>
  );
};

const OrderAdmin = () => {
  const { t } = useTranslation();
  const f = useTrFormat();
  const onError = useTrError();
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['admin-translations', 'order', id], queryFn: async () => (await api.get<{ order: TrStaffOrder }>(`/admin/translations/${id}`)).data.order });
  const order = q.data;
  usePageTitle(order ? `${order.key} · ${t('trOrders.admin.title')}` : t('trOrders.admin.title'));

  const onSaved = (o: TrStaffOrder) => {
    qc.setQueryData(['admin-translations', 'order', id], o);
    void qc.invalidateQueries({ queryKey: ['admin-translations'], predicate: (qq) => qq.queryKey[1] !== 'order' });
  };

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      (await optimizeImages(files)).forEach((file) => form.append('file', file));
      setProgress(0);
      try {
        return (await api.post<{ order: TrStaffOrder }>(`/admin/translations/${id}/files`, form, { onUploadProgress: (e) => setProgress(e.total ? e.loaded / e.total : 0) })).data.order;
      } finally {
        setProgress(null);
      }
    },
    onSuccess: onSaved,
    onError,
  });
  const removeResult = useMutation({
    mutationFn: async (fileId: string) => (await api.delete<{ order: TrStaffOrder }>(`/admin/translations/${id}/files/${fileId}`)).data.order,
    onSuccess: onSaved,
    onError,
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !order) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;

  const sources = order.files.filter((x) => x.kind === 'SOURCE');
  const results = order.files.filter((x) => x.kind === 'RESULT');
  const canUploadResults = ['ACCEPTED', 'IN_PROGRESS', 'READY'].includes(order.status);
  const canRemoveResults = order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  const reached = order.events.map((e) => e.status).filter((s): s is TrStatus => !!s);

  return (
    <div className="space-y-5">
      <Link to="/admin/translations" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand-700">
        <ArrowLeft className="size-4" aria-hidden /> {t('trOrders.backToList')}
      </Link>

      <div className="rounded-xl border border-line bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-ink tabular-nums sm:text-2xl">{order.key}</h1>
          <TrStatusPill status={order.status} />
          {order.urgency === 'EXPRESS' && <span className="badge bg-amber-100 text-amber-800">{t('trOrders.urgency.EXPRESS')}</span>}
          {order.overdue && (
            <span className="badge bg-red-100 text-red-700">
              <AlertTriangle className="size-3.5" aria-hidden /> {t('trOrders.admin.overdueBadge')}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {t(`trOrders.service.${order.service}`)} · {f.lang(order.sourceLang)} → {f.lang(order.targetLang)} · {t('trOrders.pagesCount', { count: order.pages })} ·{' '}
          {order.documentTypes.map(f.docType).join(', ')}
        </p>
        <div className="mt-4">
          <TrStepper status={order.status} reached={reached} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-5">
          {(order.status === 'NEW' || order.status === 'QUOTED') && <QuoteForm key={`${order.id}-${order.updatedAt}`} order={order} onSaved={onSaved} />}
          <StatusActions order={order} onSaved={onSaved} />

          <Panel title={t('trOrders.admin.sources')} icon={FileText} className="bg-card">
            {sources.length ? (
              <ul className="space-y-2">
                {sources.map((file) => (
                  <TrFileRow key={file.id} file={file} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('trOrders.admin.noFiles')}</p>
            )}
            {order.clientNote && <p className="mt-4 rounded-lg bg-surface p-3 text-sm whitespace-pre-line text-ink">{order.clientNote}</p>}
            {/* AI draft translation of a source file for the translator (drive: client folder "Übersetzungen") */}
            <OrderDraftButton orderId={order.id} files={sources} onCreated={() => void q.refetch()} />
          </Panel>

          <Panel title={t('trOrders.admin.results')} icon={CheckCircle2} className="bg-card">
            {results.length ? (
              <ul className="space-y-2">
                {results.map((file) => (
                  <TrFileRow key={file.id} file={file} onRemove={canRemoveResults ? () => removeResult.mutate(file.id) : undefined} busy={removeResult.isPending} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('trOrders.admin.noFiles')}</p>
            )}
            {canUploadResults && (
              <div className="mt-4">
                <MultiFileDrop onFiles={(files) => upload.mutate(files)} progress={progress} label={t('trOrders.admin.uploadResults')} />
              </div>
            )}
          </Panel>

          <Panel title={t('trOrders.admin.events')} icon={Clock} className="bg-card">
            <ol className="space-y-3">
              {[...order.events].reverse().map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', e.visibleToClient ? 'bg-brand-600' : 'bg-slate-400')} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.status && <TrStatusPill status={e.status} />}
                      {!e.visibleToClient && <span className="badge bg-surface text-muted">{t('trOrders.admin.internal')}</span>}
                      <span className="text-xs text-muted">
                        {f.dateTime(e.createdAt)} · {e.actor ? name(e.actor) : t('trOrders.admin.system')}
                      </span>
                    </div>
                    {e.note && <p className="mt-0.5 break-words whitespace-pre-line text-ink">{e.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="min-w-0 space-y-5">
          <Panel title={t('trOrders.admin.client')} icon={UserRound} className="bg-card">
            <p className="font-semibold text-ink">{name(order.client)}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <Mail className="size-3.5" aria-hidden />
              <a href={`mailto:${order.client.email}`} className="truncate hover:text-brand-700">
                {order.client.email}
              </a>
            </p>
            {order.client.phone && (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                <Phone className="size-3.5" aria-hidden /> {order.client.phone}
              </p>
            )}
            {order.case && (
              <Link to={`/admin/cases/${order.case.id}`} className="btn-white btn-sm mt-3 border border-line">
                {t('trOrders.admin.openCase')} · {order.case.number}
              </Link>
            )}
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
              {(
                [
                  [t('trOrders.fields.price'), order.priceCents != null ? f.money(order.priceCents, order.currency) : '—'],
                  [t('trOrders.fields.due'), f.day(order.dueAt)],
                  [t('trOrders.fields.delivery'), t(`trOrders.delivery.${order.deliveryMethod}`)],
                  ...(order.deliveryAddress ? [[t('trOrders.detail.address'), order.deliveryAddress]] : []),
                  [t('trOrders.fields.created'), f.day(order.createdAt)],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <ManagePanel order={order} onSaved={onSaved} />
          {order.status === 'DELIVERED' && order.completedAt && (
            <p className="flex items-center gap-2 text-xs text-muted">
              {t('trOrders.status.DELIVERED')}: {f.dateTime(order.completedAt)}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
};

/** /admin/translations/* — translation & apostille orders for staff. */
export default function AdminTranslations() {
  const { t } = useTranslation();
  usePageTitle(t('trOrders.admin.title'));
  return (
    <Routes>
      <Route index element={<OrdersTable />} />
      <Route path=":id" element={<OrderAdmin />} />
    </Routes>
  );
}
