import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, Check, Coins, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONE, type AdminCommission } from '../types';
import { money } from '../format';
import { useAgentToastError } from './shared';

/** Commission rows with approve / cancel and a bulk "mark as paid". Invalidates every agents query on change. */
export const CommissionsTable = ({ items, showAgent = true }: { items: AdminCommission[]; showAgent?: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toastError = useAgentToastError();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<AdminCommission | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payoutRef, setPayoutRef] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-agents'] });
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/agents/commissions/${id}/approve`),
    onSuccess: () => {
      toast.success(t('agents.admin.com.approved'));
      void refresh();
    },
    onError: toastError,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/admin/agents/commissions/${id}/cancel`, { note: cancelNote.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('agents.admin.com.cancelled'));
      setCancelling(null);
      setCancelNote('');
      void refresh();
    },
    onError: toastError,
  });
  const markPaid = useMutation({
    mutationFn: async () => (await api.post<{ updated: number; skipped: number }>('/admin/agents/commissions/mark-paid', { ids: [...selected], payoutRef: payoutRef.trim() })).data,
    onSuccess: (r) => {
      toast.success(t('agents.admin.com.paidDone', { updated: r.updated }), { description: r.skipped ? t('agents.admin.com.paidSkipped', { skipped: r.skipped }) : undefined });
      setPayOpen(false);
      setPayoutRef('');
      setSelected(new Set());
      void refresh();
    },
    onError: toastError,
  });

  const selectable = items.filter((c) => c.status === 'APPROVED');
  const allSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!items.length) return <EmptyState icon={Coins} title={t('agents.admin.com.empty')} />;

  return (
    <>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
          <span className="font-semibold text-ink">{t('agents.admin.com.selected', { count: selected.size })}</span>
          <button type="button" className="btn-primary btn-sm" onClick={() => setPayOpen(true)}>
            <Wallet className="size-3.5" aria-hidden /> {t('agents.admin.com.markPaid')}
          </button>
        </div>
      )}
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="w-10 px-5 py-2 sm:px-6">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-600"
                  aria-label={t('agents.admin.com.selectAll')}
                  checked={allSelected}
                  disabled={!selectable.length}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((c) => c.id)))}
                />
              </th>
              <th className="px-3 py-2 font-semibold">{t('agents.admin.com.date')}</th>
              {showAgent && <th className="px-3 py-2 font-semibold">{t('agents.admin.com.agent')}</th>}
              <th className="px-3 py-2 font-semibold">{t('agents.admin.com.client')}</th>
              <th className="px-3 py-2 font-semibold">{t('agents.admin.com.event')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('agents.admin.com.amount')}</th>
              <th className="px-3 py-2 font-semibold">{t('agents.admin.com.status')}</th>
              <th className="px-5 py-2 text-right font-semibold sm:px-6" />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className="border-b border-line align-top last:border-0">
                <td className="px-5 py-3 sm:px-6">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-600"
                    aria-label={c.id}
                    disabled={c.status !== 'APPROVED'}
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-muted">{fmtDate(c.createdAt)}</td>
                {showAgent && (
                  <td className="px-3 py-3">
                    <Link to={`/admin/agents/${c.agent.id}`} className="font-semibold text-brand-700 hover:underline">
                      {c.agent.user.firstName} {c.agent.user.lastName}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">{c.agent.code}</span>
                  </td>
                )}
                <td className="px-3 py-3 text-ink">
                  {c.client ? `${c.client.firstName} ${c.client.lastName}` : '—'}
                  {c.case && (
                    <Link to={`/admin/cases/${c.case.id}`} className="block font-mono text-[11px] text-brand-700 hover:underline">
                      {c.case.number}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-3 text-ink">
                  {t(`agents.events.${c.event}`, { defaultValue: c.event })}
                  {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                </td>
                <td className={clsx('px-3 py-3 text-right font-semibold tabular-nums', c.amountCents < 0 ? 'text-danger' : 'text-ink')}>{money(c.amountCents, c.currency)}</td>
                <td className="px-3 py-3">
                  <span className={`badge ${STATUS_TONE[c.status]}`}>{t(`agents.status.${c.status}`)}</span>
                  {c.paidAt && (
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {fmtDate(c.paidAt)}
                      {c.payoutRef ? ` · ${c.payoutRef}` : ''}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap sm:px-6">
                  {c.status === 'PENDING' && (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      onClick={() => approve.mutate(c.id)}
                      disabled={approve.isPending}
                    >
                      <Check className="size-3.5" aria-hidden /> {t('agents.admin.com.approve')}
                    </button>
                  )}
                  {(c.status === 'PENDING' || c.status === 'APPROVED') && (
                    <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-danger hover:bg-red-50" onClick={() => setCancelling(c)}>
                      <Ban className="size-3.5" aria-hidden /> {t('agents.admin.com.cancel')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        title={t('agents.admin.com.cancelTitle')}
        message={cancelling ? money(cancelling.amountCents, cancelling.currency) : undefined}
        confirmLabel={t('agents.admin.com.cancel')}
        loading={cancel.isPending}
      >
        <label className="label mt-3" htmlFor="agent-cancel-note">
          {t('agents.admin.com.cancelNote')}
        </label>
        <input id="agent-cancel-note" className="input" value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} maxLength={500} />
      </ConfirmDialog>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="sm"
        title={t('agents.admin.com.markPaidTitle')}
        description={t('agents.admin.com.markPaidText')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPayOpen(false)}>
              {t('agents.common.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={!payoutRef.trim() || markPaid.isPending} onClick={() => markPaid.mutate()}>
              {markPaid.isPending && <Spinner className="size-4" />} {t('agents.admin.com.markPaid')}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink">
          {t('agents.admin.com.selected', { count: selected.size })} ·{' '}
          <strong>
            {money(
              items.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.amountCents, 0),
              items.find((c) => selected.has(c.id))?.currency ?? 'EUR',
            )}
          </strong>
        </p>
        <label className="label" htmlFor="agent-payout-ref">
          {t('agents.admin.com.payoutRef')}
        </label>
        <input id="agent-payout-ref" className="input" value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} maxLength={120} placeholder="SEPA-2026-10-01" />
      </Modal>
    </>
  );
};
