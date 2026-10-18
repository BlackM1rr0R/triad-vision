import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Check, ChevronLeft, ChevronRight, Download, HandCoins, Pencil, Plus, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState, ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { PARTNERS_KEY, partnerError, usePartnerOptions, type PartnerCase } from './api';

/** Referral-partner commissions: list with filters, totals, single / bulk actions and the add / edit dialog. */

export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
const STATUSES: CommissionStatus[] = ['PENDING', 'APPROVED', 'PAID', 'CANCELLED'];

export interface AdminCommission {
  id: string;
  partnerId: string;
  caseId: string | null;
  amountCents: number;
  currency: string;
  status: CommissionStatus;
  note: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  partner: { id: string; name: string };
  case: { id: string; number: string; status: string; client: string } | null;
  clientName?: string | null;
  settlementEntryId?: string | null;
}

interface ListResponse {
  items: AdminCommission[];
  total: number;
  page: number;
  pageSize: number;
  totals: { pendingCents: number; approvedCents: number; paidCents: number; cancelledCents: number; totalCents: number };
}

const TONE: Record<CommissionStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-brand-100 text-brand-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-surface text-muted',
};

export const COMMISSIONS_KEY = [...PARTNERS_KEY, 'commissions'] as const;

const recentMonths = () => {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
};

/** "150,50" / "150.5" → 15050 cents; null for an empty or invalid value. */
export const toCents = (v: string) => {
  const s = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
export const fromCents = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2));

const CommissionDialog = ({
  open,
  onClose,
  commission,
  partnerId,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  commission: AdminCommission | null;
  partnerId?: string;
  isAdmin: boolean;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const partners = usePartnerOptions();
  const [form, setForm] = useState({ partnerId: '', caseId: '', amount: '', currency: 'EUR', dueAt: '', note: '' });
  useEffect(() => {
    if (!open) return;
    setForm({
      partnerId: commission?.partnerId ?? partnerId ?? '',
      caseId: commission?.caseId ?? '',
      amount: fromCents(commission?.amountCents),
      currency: commission?.currency ?? 'EUR',
      dueAt: commission?.dueAt?.slice(0, 10) ?? '',
      note: commission?.note ?? '',
    });
  }, [open, commission, partnerId]);
  // The chosen partner's cases (for linking the commission to a client).
  const cases = useQuery({
    queryKey: [...PARTNERS_KEY, 'one', form.partnerId],
    queryFn: async () => (await api.get<{ partner: { currency?: string }; cases: PartnerCase[] }>(`/admin/partners/${form.partnerId}`)).data,
    enabled: open && !commission && !!form.partnerId,
  });
  useEffect(() => {
    const cur = cases.data?.partner.currency;
    if (!commission && cur) setForm((f) => ({ ...f, currency: cur }));
  }, [cases.data, commission]);

  const paid = commission?.status === 'PAID';
  const cents = toCents(form.amount);
  const save = useMutation({
    mutationFn: async () => {
      if (commission) {
        const body = paid ? { note: form.note } : { amountCents: cents, currency: form.currency, dueAt: form.dueAt || null, note: form.note };
        await api.patch(`/admin/partners/commissions/${commission.id}`, body);
      } else {
        await api.post('/admin/partners/commissions', {
          partnerId: form.partnerId,
          caseId: form.caseId || null,
          amountCents: cents,
          currency: form.currency,
          dueAt: form.dueAt || null,
          note: form.note,
        });
      }
    },
    onSuccess: async () => {
      toast.success(t('refPartners.com.saved'));
      await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
      onClose();
    },
    onError: partnerError,
  });
  const valid = (paid || cents !== null) && !!form.partnerId;
  return (
    <Modal
      open={open}
      onClose={() => !save.isPending && onClose()}
      title={commission ? t('refPartners.com.edit') : t('refPartners.com.add')}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={save.isPending}>
            {t('refPartners.form.cancel')}
          </button>
          <button type="submit" form="commission-form" className="btn-primary btn-sm" disabled={save.isPending || !valid}>
            {save.isPending && <Spinner className="size-3.5" />} {t('refPartners.form.save')}
          </button>
        </div>
      }
    >
      <form
        id="commission-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        {!commission && !partnerId && (
          <label className="block">
            <span className="label">{t('refPartners.com.partner')}</span>
            <select className="input" required value={form.partnerId} onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value, caseId: '' }))}>
              <option value="">—</option>
              {(partners.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!commission && (
          <label className="block">
            <span className="label">{t('refPartners.com.case')}</span>
            <select className="input" value={form.caseId} onChange={(e) => setForm((f) => ({ ...f, caseId: e.target.value }))} disabled={!form.partnerId}>
              <option value="">{t('refPartners.com.noCase')}</option>
              {(cases.data?.cases ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number} · {c.client.firstName} {c.client.lastName}
                </option>
              ))}
            </select>
          </label>
        )}
        {commission?.case && (
          <p className="text-sm text-muted">
            {commission.case.number} · {commission.case.client}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem_1fr]">
          <label className="block">
            <span className="label">{t('refPartners.com.amount')}</span>
            <input className="input tabular-nums" inputMode="decimal" required={!paid} disabled={paid} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="150.00" />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.currency')}</span>
            <input className="input uppercase" maxLength={3} disabled={paid} value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.com.due')}</span>
            <input className="input" type="date" disabled={paid} value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          </label>
        </div>
        <label className="block">
          <span className="label">{t('refPartners.com.note')}</span>
          <textarea className="input min-h-20" maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </label>
        {!isAdmin && <p className="text-xs text-muted">{t('refPartners.com.adminHint')}</p>}
      </form>
    </Modal>
  );
};

const PayDialog = ({ ids, onClose }: { ids: string[] | null; onClose: (done: boolean) => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (ids) {
      setPaidAt(new Date().toISOString().slice(0, 10));
      setNote('');
    }
  }, [ids]);
  const pay = useMutation({
    mutationFn: async () => {
      const body = { paidAt: paidAt || undefined, note: note.trim() || undefined };
      if (ids!.length === 1) await api.post(`/admin/partners/commissions/${ids![0]}/pay`, body);
      else {
        const r = (await api.post<{ updated: number }>('/admin/partners/commissions/bulk-pay', { ...body, ids })).data;
        toast.success(t('refPartners.com.bulkDone', { count: r.updated }));
      }
    },
    onSuccess: async () => {
      if (ids!.length === 1) toast.success(t('refPartners.com.saved'));
      await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
      onClose(true);
    },
    onError: partnerError,
  });
  return (
    <Modal
      open={!!ids}
      onClose={() => !pay.isPending && onClose(false)}
      title={ids && ids.length > 1 ? t('refPartners.com.payBulk', { count: ids.length }) : t('refPartners.com.payTitle')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => onClose(false)} disabled={pay.isPending}>
            {t('refPartners.form.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => pay.mutate()} disabled={pay.isPending}>
            {pay.isPending && <Spinner className="size-3.5" />} {t('refPartners.com.pay')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label">{t('refPartners.com.paidAt')}</span>
          <input className="input" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('refPartners.com.payoutNote')}</span>
          <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
};

/** The commissions list — global (all partners, with a partner filter) or for one partner. */
export const CommissionsPanel = ({ partnerId, isAdmin }: { partnerId?: string; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const partners = usePartnerOptions();
  const months = useMemo(recentMonths, []);
  const [filter, setFilter] = useState({ partnerId: partnerId ?? '', status: '' as CommissionStatus | '', month: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ open: boolean; commission: AdminCommission | null }>({ open: false, commission: null });
  const [payIds, setPayIds] = useState<string[] | null>(null);
  const [cancelRow, setCancelRow] = useState<AdminCommission | null>(null);
  const effectivePartner = partnerId ?? filter.partnerId;
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [filter, partnerId]);

  const params = { partnerId: effectivePartner || undefined, status: filter.status || undefined, month: filter.month || undefined, page };
  const q = useQuery({
    queryKey: [...COMMISSIONS_KEY, params],
    queryFn: async () => (await api.get<ListResponse>('/admin/partners/commissions', { params })).data,
    placeholderData: keepPreviousData,
  });
  const done = async () => {
    setSelected(new Set());
    await qc.invalidateQueries({ queryKey: PARTNERS_KEY });
  };
  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/partners/commissions/${id}/approve`),
    onSuccess: async () => {
      toast.success(t('refPartners.com.saved'));
      await done();
    },
    onError: partnerError,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/partners/commissions/${id}/cancel`, {}),
    onSuccess: async () => {
      setCancelRow(null);
      toast.success(t('refPartners.com.saved'));
      await done();
    },
    onError: partnerError,
  });

  const exportHref = `/api/admin/partners/commissions/export.xlsx?${new URLSearchParams({
    ...(filter.month ? { month: filter.month } : {}),
    ...(effectivePartner ? { partnerId: effectivePartner } : {}),
  }).toString()}`;
  const selectable = (r: AdminCommission) => isAdmin && (r.status === 'PENDING' || r.status === 'APPROVED');
  const canEdit = (r: AdminCommission) => (isAdmin ? r.status !== 'CANCELLED' : r.status === 'PENDING');
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const cur = q.data?.items[0]?.currency ?? 'EUR';
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <section className="rounded-xl border border-line bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <HandCoins className="size-4 text-brand-600" aria-hidden /> {t('refPartners.com.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && selected.size > 0 && (
            <button type="button" className="btn-primary btn-sm" onClick={() => setPayIds([...selected])}>
              <Wallet className="size-3.5" /> {t('refPartners.com.payBulk', { count: selected.size })}
            </button>
          )}
          <a href={exportHref} className="btn-white btn-sm border border-line" download>
            <Download className="size-3.5" /> {t('refPartners.com.export')}
          </a>
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => setDialog({ open: true, commission: null })}>
            <Plus className="size-3.5" /> {t('refPartners.com.add')}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
        {!partnerId && (
          <select className="input min-h-9 w-auto py-1 text-sm" aria-label={t('refPartners.com.partner')} value={filter.partnerId} onChange={(e) => setFilter((f) => ({ ...f, partnerId: e.target.value }))}>
            <option value="">{t('refPartners.com.allPartners')}</option>
            {(partners.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select className="input min-h-9 w-auto py-1 text-sm" aria-label={t('refPartners.com.status')} value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as CommissionStatus | '' }))}>
          <option value="">{t('refPartners.com.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`refPartners.com.statuses.${s}`)}
            </option>
          ))}
        </select>
        <select className="input min-h-9 w-auto py-1 text-sm" aria-label={t('refPartners.com.month')} value={filter.month} onChange={(e) => setFilter((f) => ({ ...f, month: e.target.value }))}>
          <option value="">{t('refPartners.com.allMonths')}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 px-5 py-3 sm:grid-cols-4">
            {(
              [
                ['pending', q.data.totals.pendingCents, 'text-amber-700'],
                ['approved', q.data.totals.approvedCents, 'text-brand-700'],
                ['paid', q.data.totals.paidCents, 'text-emerald-700'],
              ] as const
            ).map(([k, v, tone]) => (
              <div key={k} className="rounded-lg bg-surface px-3 py-2">
                <dt className="text-[11px] text-muted">{t(`refPartners.totals.${k}`)}</dt>
                <dd className={clsx('font-bold tabular-nums', tone)}>{money(v, cur)}</dd>
              </div>
            ))}
            <div className="rounded-lg bg-surface px-3 py-2">
              <dt className="text-[11px] text-muted">{t('refPartners.com.total')}</dt>
              <dd className="font-bold text-ink tabular-nums">{money(q.data.totals.totalCents, cur)}</dd>
            </div>
          </dl>
          {q.data.items.length === 0 ? (
            <EmptyState icon={HandCoins} title={t('refPartners.com.empty')}>
              {t('refPartners.com.emptyHint')}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-y border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                  <tr>
                    {isAdmin && <th className="w-10 px-4 py-2.5" />}
                    {!partnerId && <th className="px-4 py-2.5">{t('refPartners.com.partner')}</th>}
                    <th className="px-4 py-2.5">{t('refPartners.com.case')}</th>
                    <th className="px-4 py-2.5 text-right">{t('refPartners.com.amount')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.com.status')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.com.created')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.com.paidAt')}</th>
                    <th className="px-4 py-2.5">{t('refPartners.com.note')}</th>
                    <th className="px-4 py-2.5 text-right">{t('refPartners.com.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {q.data.items.map((r) => (
                    <tr key={r.id} className={clsx(r.status === 'CANCELLED' && 'opacity-60')}>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          {selectable(r) && <input type="checkbox" className="size-4 accent-brand-600" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={t('refPartners.com.selectRow')} />}
                        </td>
                      )}
                      {!partnerId && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Link to={`/admin/partners/${r.partner.id}`} className="font-medium text-brand-700 hover:underline">
                            {r.partner.name}
                          </Link>
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        {r.case ? (
                          <Link to={`/admin/cases/${r.case.id}`} className="hover:text-brand-700">
                            <span className="font-medium text-ink">{r.case.client}</span> <span className="font-mono text-xs text-muted">{r.case.number}</span>
                          </Link>
                        ) : (
                          <span className={r.clientName ? 'font-medium text-ink' : 'text-muted'}>{r.clientName ?? t('refPartners.com.noCase')}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-ink tabular-nums">{money(r.amountCents, r.currency)}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('badge whitespace-nowrap', TONE[r.status])}>{t(`refPartners.com.statuses.${r.status}`)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted">{r.paidAt ? fmtDate(r.paidAt) : r.dueAt ? `${t('refPartners.com.due')}: ${fmtDate(r.dueAt)}` : '—'}</td>
                      <td className="max-w-[16rem] truncate px-4 py-2.5 text-xs text-muted" title={r.note ?? undefined}>
                        {r.note ?? ''}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          {isAdmin && r.status === 'PENDING' && (
                            <button type="button" className="btn-ghost btn-sm" title={t('refPartners.com.approve')} aria-label={t('refPartners.com.approve')} onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                              <Check className="size-3.5" />
                            </button>
                          )}
                          {isAdmin && (r.status === 'PENDING' || r.status === 'APPROVED') && (
                            <button type="button" className="btn-ghost btn-sm" title={t('refPartners.com.pay')} aria-label={t('refPartners.com.pay')} onClick={() => setPayIds([r.id])}>
                              <Wallet className="size-3.5" />
                            </button>
                          )}
                          {canEdit(r) && (
                            <button type="button" className="btn-ghost btn-sm" title={t('refPartners.com.edit')} aria-label={t('refPartners.com.edit')} onClick={() => setDialog({ open: true, commission: r })}>
                              <Pencil className="size-3.5" />
                            </button>
                          )}
                          {isAdmin && (r.status === 'PENDING' || r.status === 'APPROVED') && (
                            <button type="button" className="btn-ghost btn-sm text-danger" title={t('refPartners.com.cancel')} aria-label={t('refPartners.com.cancel')} onClick={() => setCancelRow(r)}>
                              <Ban className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 text-sm">
              <button type="button" className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="‹">
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-muted tabular-nums">
                {page} / {pages}
              </span>
              <button type="button" className="grid size-9 place-items-center rounded-lg border border-line disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="›">
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </>
      )}

      <CommissionDialog open={dialog.open} commission={dialog.commission} partnerId={partnerId} isAdmin={isAdmin} onClose={() => setDialog({ open: false, commission: null })} />
      <PayDialog
        ids={payIds}
        onClose={(ok) => {
          setPayIds(null);
          if (ok) setSelected(new Set());
        }}
      />
      <ConfirmDialog
        open={!!cancelRow}
        onClose={() => setCancelRow(null)}
        onConfirm={() => cancelRow && cancel.mutate(cancelRow.id)}
        title={t('refPartners.com.cancelTitle')}
        message={t('refPartners.com.cancelText')}
        confirmLabel={t('refPartners.com.cancel')}
        loading={cancel.isPending}
      />
    </section>
  );
};
