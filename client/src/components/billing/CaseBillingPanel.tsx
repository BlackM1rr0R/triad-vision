import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Ban, CalendarClock, CheckCircle2, Download, ListOrdered, Pencil, Plus, Receipt, Send, Trash2, Wallet, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBilling } from '@/i18n/pagesBilling';
import { Panel, LoadingBlock, ErrorBlock } from '@/components/admin/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDate } from '@/components/admin/labels';
import { InvoiceEditor } from './InvoiceEditor';
import { InstallmentDialog, InvoiceActionDialogs, PlanDialog, type InvoiceAction } from './Dialogs';
import {
  BILLING_KEY,
  INSTALLMENT_BADGE,
  OPEN_STATUSES,
  STATUS_BADGE,
  billingErrText,
  fmtEur,
  triggerLabel,
  type CaseBilling,
  type ClientInvoice,
  type Installment,
} from './api';

registerCopy(pagesBilling);

export const IconBtn = ({ label, icon: I, onClick, href, tone }: { label: string; icon: typeof Send; onClick?: () => void; href?: string; tone?: 'primary' | 'good' | 'danger' }) => {
  const cls = clsx(
    'grid size-9 place-items-center rounded-lg border transition',
    tone === 'primary' ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' : tone === 'good' ? 'border-line text-success-fg hover:bg-success-bg' : tone === 'danger' ? 'border-line text-danger hover:bg-danger-bg' : 'border-line text-navy-900 hover:bg-surface',
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

/** Invoice row actions shared by the case panel and the admin list. */
export const InvoiceRowActions = ({ inv, onEdit, onAction }: { inv: ClientInvoice; onEdit: (i: ClientInvoice) => void; onAction: (kind: InvoiceAction['kind']) => void }) => {
  const { t } = useTranslation();
  const open = OPEN_STATUSES.includes(inv.status);
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <IconBtn href={`/api/admin/client-billing/invoices/${inv.id}/pdf`} label={t('bill.admin.actions.pdf')} icon={Download} />
      {inv.status === 'DRAFT' && <IconBtn onClick={() => onEdit(inv)} label={t('bill.admin.actions.edit')} icon={Pencil} />}
      {(inv.status === 'DRAFT' || open) && <IconBtn onClick={() => onAction('send')} label={inv.status === 'DRAFT' ? t('bill.admin.actions.send') : t('bill.admin.actions.resend')} icon={Send} tone={inv.status === 'DRAFT' ? 'primary' : undefined} />}
      {open && <IconBtn onClick={() => onAction('pay')} label={t('bill.admin.actions.pay')} icon={CheckCircle2} tone="good" />}
      {open && inv.paidCents === 0 && <IconBtn onClick={() => onAction('cancel')} label={t('bill.admin.actions.cancel')} icon={Ban} tone="danger" />}
      {inv.status === 'DRAFT' && <IconBtn onClick={() => onAction('delete')} label={t('bill.admin.actions.delete')} icon={Trash2} tone="danger" />}
    </div>
  );
};

/** Case card › Maliyyə: the client's invoices, payments, balance and payment plan for this case. */
export default function CaseBillingPanel({ caseId, isAdmin }: { caseId: string; isAdmin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...BILLING_KEY, 'case', caseId],
    queryFn: async () => (await api.get<CaseBilling>(`/admin/client-billing/cases/${caseId}`)).data,
  });
  const [editing, setEditing] = useState<ClientInvoice | 'new' | null>(null);
  const [action, setAction] = useState<InvoiceAction | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [inst, setInst] = useState<{ planId: string; installment: Installment | null } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'void' | 'cancelPlan' | 'deleteInst'; id: string } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: BILLING_KEY });

  const act = useMutation({
    mutationFn: async (c: { kind: 'void' | 'cancelPlan' | 'deleteInst' | 'invoiceNow'; id: string }) => {
      if (c.kind === 'void') return api.delete(`/admin/client-billing/payments/${c.id}`);
      if (c.kind === 'cancelPlan') return api.post(`/admin/client-billing/plans/${c.id}/cancel`);
      if (c.kind === 'deleteInst') return api.delete(`/admin/client-billing/installments/${c.id}`);
      return api.post(`/admin/client-billing/installments/${c.id}/invoice`);
    },
    onSuccess: (_d, c) => {
      toast.success(c.kind === 'void' ? t('bill.admin.toasts.voided') : c.kind === 'invoiceNow' ? t('bill.admin.toasts.invoiced') : t('bill.admin.toasts.planUpdated'));
      setConfirm(null);
      refresh();
    },
    onError: (e) => toast.error(billingErrText(e)),
  });

  const d = q.data;
  return (
    <Panel
      id="case-billing"
      title={t('bill.admin.panel.title')}
      icon={Wallet}
      actions={
        d && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setPlanOpen(true)}>
              <ListOrdered className="size-3.5" aria-hidden /> {t('bill.admin.actions.newPlan')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden /> {t('bill.admin.panel.newInvoice')}
            </button>
          </div>
        )
      }
    >
      {q.isLoading ? (
        <LoadingBlock className="min-h-[12vh]" />
      ) : q.error || !d ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['invoiced', d.totals.invoicedCents, ''],
                ['paid', d.totals.paidCents, 'text-success-fg'],
                ['open', d.totals.openCents, d.totals.openCents ? 'text-warning-fg' : ''],
                ['overdue', d.totals.overdueCents, d.totals.overdueCents ? 'text-danger-fg' : ''],
              ] as const
            ).map(([k, v, tone]) => (
              <div key={k} className="rounded-xl bg-surface px-3 py-2.5">
                <dt className="text-xs text-muted">{t(`bill.admin.panel.${k}`)}</dt>
                <dd className={clsx('font-display text-lg font-bold text-navy-900 tabular-nums', tone)}>{fmtEur(v)}</dd>
              </div>
            ))}
          </dl>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <Receipt className="size-4" aria-hidden /> {t('bill.admin.panel.invoices')}
            </h3>
            {d.invoices.length === 0 ? (
              <p className="text-sm text-muted">{t('bill.admin.panel.noInvoices')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy-900 tabular-nums">
                        {inv.number ?? <span className="text-muted italic">{t('bill.admin.draftNo')}</span>}
                        {!inv.caseId && <span className="ml-2 text-xs font-normal text-muted">({t('bill.admin.panel.withoutCase')})</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {fmtDate(inv.issueDate)} → <span className={clsx(inv.status === 'OVERDUE' && 'font-semibold text-danger')}>{fmtDate(inv.dueDate)}</span>
                        {inv.paidCents > 0 && inv.status !== 'PAID' && ` · ${t('bill.admin.cols.paid')} ${fmtEur(inv.paidCents)}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-navy-900 tabular-nums">{fmtEur(inv.grossCents)}</span>
                    <span className={clsx('badge', STATUS_BADGE[inv.status])}>{t(`bill.status.${inv.status}`)}</span>
                    <InvoiceRowActions inv={inv} onEdit={setEditing} onAction={(kind) => setAction({ kind, invoice: inv, email: d.client.email })} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <ListOrdered className="size-4" aria-hidden /> {t('bill.admin.panel.plans')}
            </h3>
            {d.plans.length === 0 ? (
              <p className="text-sm text-muted">{t('bill.admin.panel.noPlans')}</p>
            ) : (
              <div className="space-y-3">
                {d.plans.map((p) => (
                  <div key={p.id} className="rounded-xl border border-line">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                      <p className="min-w-0 flex-1 text-sm font-semibold text-navy-900">{p.title}</p>
                      <span className="text-sm tabular-nums">{fmtEur(p.totalCents)}</span>
                      <span className="badge">{t(`bill.planStatus.${p.status}`)}</span>
                      {p.status !== 'CANCELLED' && (
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setInst({ planId: p.id, installment: null })}>
                          <Plus className="size-3.5" aria-hidden /> {t('bill.admin.actions.addInst')}
                        </button>
                      )}
                      {isAdmin && p.status === 'ACTIVE' && (
                        <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setConfirm({ kind: 'cancelPlan', id: p.id })}>
                          {t('bill.admin.actions.cancelPlan')}
                        </button>
                      )}
                    </div>
                    <ol className="divide-y divide-line">
                      {p.installments.map((i) => (
                        <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                          <span className="w-6 text-xs text-muted tabular-nums">{i.seq}.</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-ink">{i.label}</span>
                            <span className="flex items-center gap-1 text-xs text-muted">
                              <CalendarClock className="size-3" aria-hidden /> {triggerLabel(i.trigger)}
                              {i.dueDate && ` · ${fmtDate(i.dueDate)}`}
                            </span>
                          </span>
                          <span className="tabular-nums">{fmtEur(i.amountCents)}</span>
                          <span className={clsx('badge', INSTALLMENT_BADGE[i.status])}>{t(`bill.instStatus.${i.status}`)}</span>
                          {i.status === 'PENDING' && p.status === 'ACTIVE' && (
                            <span className="flex gap-1">
                              <IconBtn label={t('bill.admin.actions.invoiceNow')} icon={Zap} onClick={() => act.mutate({ kind: 'invoiceNow', id: i.id })} />
                              <IconBtn label={t('bill.admin.actions.editInst')} icon={Pencil} onClick={() => setInst({ planId: p.id, installment: i })} />
                              <IconBtn label={t('bill.admin.actions.deleteInst')} icon={Trash2} tone="danger" onClick={() => setConfirm({ kind: 'deleteInst', id: i.id })} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-navy-900">
              <CheckCircle2 className="size-4" aria-hidden /> {t('bill.admin.panel.payments')}
            </h3>
            {d.payments.length === 0 ? (
              <p className="text-sm text-muted">{t('bill.admin.panel.noPayments')}</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">
                        {fmtDate(p.paidAt)} · {t(`bill.method.${p.method}`)}
                      </span>
                      <span className="text-xs text-muted">
                        {p.invoiceNumber ?? '—'}
                        {p.reference && ` · ${p.reference}`}
                      </span>
                    </span>
                    <span className="font-semibold text-success-fg tabular-nums">{fmtEur(p.amountCents)}</span>
                    <IconBtn href={`/api/admin/client-billing/payments/${p.id}/receipt`} label={t('bill.admin.actions.receipt')} icon={Download} />
                    {isAdmin && <IconBtn label={t('bill.admin.actions.void')} icon={Trash2} tone="danger" onClick={() => setConfirm({ kind: 'void', id: p.id })} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin && (
            <Link to="/admin/client-invoices" className="inline-flex text-sm font-semibold text-brand-600 hover:underline">
              {t('bill.admin.panel.allInvoices')} →
            </Link>
          )}
        </div>
      )}

      {editing && d && <InvoiceEditor invoice={editing === 'new' ? null : editing} fixed={{ clientId: d.client.id, clientName: d.client.name, caseId: d.case.id }} onClose={() => setEditing(null)} />}
      <InvoiceActionDialogs action={action} onClose={() => setAction(null)} />
      {planOpen && d && <PlanDialog clientId={d.client.id} caseId={d.case.id} clientLocale={d.client.locale} onClose={() => setPlanOpen(false)} />}
      {inst && <InstallmentDialog planId={inst.planId} installment={inst.installment} onClose={() => setInst(null)} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && act.mutate(confirm)}
        loading={act.isPending}
        title={confirm?.kind === 'void' ? t('bill.admin.confirm.voidTitle') : confirm?.kind === 'cancelPlan' ? t('bill.admin.confirm.cancelPlanTitle') : t('bill.admin.confirm.deleteInstTitle')}
        message={confirm?.kind === 'void' ? t('bill.admin.confirm.voidText') : confirm?.kind === 'cancelPlan' ? t('bill.admin.confirm.cancelPlanText') : undefined}
        confirmLabel={confirm?.kind === 'cancelPlan' ? t('bill.admin.actions.cancelPlan') : t('bill.admin.actions.delete')}
      />
    </Panel>
  );
}
