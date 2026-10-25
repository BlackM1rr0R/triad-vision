import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { celebrate } from '@/components/motion/celebrate';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useBillingSettings } from './InvoiceEditor';
import {
  BILLING_KEY,
  PAYMENT_METHODS,
  TRIGGERS,
  billingErrText,
  centsToInput,
  CURRENCIES,
  fmtEur,
  isoDay,
  parseEuro,
  triggerLabel,
  type ClientInvoice,
  type Installment,
  type PaymentMethod,
} from './api';

export type InvoiceAction = { kind: 'send' | 'pay' | 'cancel' | 'delete'; invoice: ClientInvoice; email?: string };

/** Send / record payment / cancel (Storno) / delete-draft dialogs of one invoice. */
export function InvoiceActionDialogs({ action, onClose }: { action: InvoiceAction | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const inv = action?.invoice;
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK');
  const [paidAt, setPaidAt] = useState(isoDay(new Date()));
  const [reference, setReference] = useState('');
  useEffect(() => {
    setReason('');
    setAmount(inv ? centsToInput(inv.openCents) : '');
    setMethod('BANK');
    setPaidAt(isoDay(new Date()));
    setReference('');
  }, [action, inv]);
  const cents = parseEuro(amount);

  const m = useMutation({
    mutationFn: async () => {
      if (!action) return null;
      const id = action.invoice.id;
      if (action.kind === 'send') return (await api.post<{ invoice: ClientInvoice; emailed: boolean }>(`/admin/client-billing/invoices/${id}/send`)).data;
      if (action.kind === 'pay') return (await api.post(`/admin/client-billing/invoices/${id}/payments`, { amountCents: cents, method, paidAt, reference: reference.trim() || null })).data;
      if (action.kind === 'cancel') return (await api.post(`/admin/client-billing/invoices/${id}/cancel`, { reason: reason.trim() || undefined })).data;
      return (await api.delete(`/admin/client-billing/invoices/${id}`)).data;
    },
    onSuccess: (data) => {
      if (action?.kind === 'send') {
        const r = data as { invoice: ClientInvoice; emailed: boolean };
        if (r.emailed) toast.success(t('bill.admin.toasts.sent', { number: r.invoice.number }));
        else toast.warning(t('bill.admin.toasts.sentNoMail', { number: r.invoice.number }));
      } else if (action?.kind === 'pay') {
        toast.success(t('bill.admin.toasts.paid'));
        celebrate({ count: 45 }); // payment recorded: light success moment
      }
      else if (action?.kind === 'cancel') toast.success(t('bill.admin.toasts.cancelled'));
      else toast.success(t('bill.admin.toasts.deleted'));
      void qc.invalidateQueries({ queryKey: BILLING_KEY });
      onClose();
    },
    onError: (e) => toast.error(billingErrText(e)),
  });

  const email = action?.email || '—';
  return (
    <>
      <ConfirmDialog
        open={action?.kind === 'send'}
        onClose={onClose}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        tone="primary"
        title={inv?.status === 'DRAFT' ? t('bill.admin.confirm.sendTitle') : t('bill.admin.confirm.resendTitle')}
        message={inv?.status === 'DRAFT' ? t('bill.admin.confirm.sendText', { email }) : t('bill.admin.confirm.resendText', { email })}
        confirmLabel={inv?.status === 'DRAFT' ? t('bill.admin.actions.send') : t('bill.admin.actions.resend')}
      />
      <ConfirmDialog open={action?.kind === 'delete'} onClose={onClose} onConfirm={() => m.mutate()} loading={m.isPending} title={t('bill.admin.confirm.deleteTitle')} message={t('bill.admin.confirm.deleteText')} confirmLabel={t('bill.admin.actions.delete')} />
      <ConfirmDialog open={action?.kind === 'cancel'} onClose={onClose} onConfirm={() => m.mutate()} loading={m.isPending} title={t('bill.admin.confirm.cancelTitle')} message={t('bill.admin.confirm.cancelText')} confirmLabel={t('bill.admin.actions.cancel')}>
        <label className="label mt-3" htmlFor="cb-cancel-reason">
          {t('bill.admin.confirm.reason')}
        </label>
        <textarea id="cb-cancel-reason" className="input resize-y" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
      <Modal
        open={action?.kind === 'pay'}
        onClose={() => !m.isPending && onClose()}
        title={t('bill.admin.payment.title')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={m.isPending}>
              {t('bill.admin.editor.close')}
            </button>
            <button type="button" className="btn-primary btn-sm" disabled={m.isPending || !Number.isFinite(cents) || cents <= 0 || (!!inv && cents > inv.openCents)} onClick={() => m.mutate()}>
              {m.isPending && <Spinner className="size-3.5" />}
              {t('bill.admin.payment.save')}
            </button>
          </>
        }
      >
        {inv && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              {inv.number} · {t('bill.admin.payment.open', { amount: fmtEur(inv.openCents, inv.currency) })}
            </p>
            <div>
              <label className="label" htmlFor="cb-pay-amount">
                {t('bill.admin.payment.amount')}
              </label>
              <div className="flex gap-2">
                <input id="cb-pay-amount" className="input text-right tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setAmount(centsToInput(inv.openCents))}>
                  {t('bill.admin.payment.full')}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="cb-pay-method">
                  {t('bill.admin.payment.method')}
                </label>
                <select id="cb-pay-method" className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((k) => (
                    <option key={k} value={k}>
                      {t(`bill.method.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="cb-pay-date">
                  {t('bill.admin.payment.date')}
                </label>
                <input id="cb-pay-date" type="date" className="input" max={isoDay(new Date())} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="cb-pay-ref">
                {t('bill.admin.payment.reference')}
              </label>
              <input id="cb-pay-ref" className="input" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ─── Plans ──────────────────────────────────────────────────────────

interface Row {
  key: number;
  label: string;
  trigger: string;
  dueDate: string;
  amount: string;
}
let rowSeq = 0;

const TriggerSelect = ({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) => {
  const { t } = useTranslation();
  return (
    <select id={id} className="input" aria-label={t('bill.admin.plan.trigger')} value={value} onChange={(e) => onChange(e.target.value)}>
      {TRIGGERS.map((tr) => (
        <option key={tr} value={tr}>
          {triggerLabel(tr)}
        </option>
      ))}
    </select>
  );
};

/** New payment plan for a client / case: from a template (percent split of a gross total) or custom rows. */
export function PlanDialog({ clientId, caseId, clientLocale, onClose }: { clientId: string; caseId: string | null; clientLocale: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settings = useBillingSettings().data;
  const templates = settings?.templates ?? [];
  const lang = (['az', 'de', 'en', 'ru'].includes(clientLocale) ? clientLocale : 'de') as 'az' | 'de' | 'en' | 'ru';
  const [currency, setCurrency] = useState<string>('');
  const cur = currency || settings?.defaultCurrency || 'EUR';
  const [tplKey, setTplKey] = useState('standard');
  const [total, setTotal] = useState('');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const totalCents = parseEuro(total);

  // Template + total → rows (whole cents, the last row takes the rest).
  useEffect(() => {
    const tpl = templates.find((x) => x.key === tplKey);
    if (!tpl) return;
    setTitle((prev) => prev || tpl.title[lang]);
    const base = Number.isFinite(totalCents) ? totalCents : 0;
    const sum = tpl.items.reduce((a, i) => a + i.percent, 0) || 1;
    const amounts = tpl.items.map((i) => Math.round((base * i.percent) / sum));
    amounts[amounts.length - 1] += base - amounts.reduce((a, b) => a + b, 0);
    const now = new Date();
    setRows(
      tpl.items.map((i, k) => ({
        key: ++rowSeq,
        label: i.label[lang] || i.label.de,
        trigger: i.trigger,
        dueDate: i.trigger === 'DATE' ? isoDay(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (i.monthsAfterStart ?? 0), Math.min(now.getUTCDate(), 28), 12))) : '',
        amount: base ? centsToInput(amounts[k]) : '',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplKey, totalCents, templates.length]);

  const parsed = rows.map((r) => ({ label: r.label.trim(), trigger: r.trigger, dueDate: r.dueDate || null, amountCents: parseEuro(r.amount) }));
  const sum = parsed.reduce((a, r) => a + (Number.isFinite(r.amountCents) ? r.amountCents : 0), 0);
  const valid = title.trim().length >= 2 && parsed.length > 0 && parsed.every((r) => r.label && Number.isFinite(r.amountCents) && r.amountCents > 0 && (r.trigger !== 'DATE' || r.dueDate));
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = useMutation({
    mutationFn: async () => (await api.post<{ invoiced: string[] }>('/admin/client-billing/plans', { clientId, caseId, title: title.trim(), installments: parsed, currency: cur })).data,
    onSuccess: (d) => {
      toast.success(t('bill.admin.toasts.planCreated'));
      if (d.invoiced.length) toast.info(t('bill.admin.plan.catchUp'));
      void qc.invalidateQueries({ queryKey: BILLING_KEY });
      onClose();
    },
    onError: (e) => toast.error(billingErrText(e)),
  });

  return (
    <Modal
      open
      size="lg"
      onClose={() => !save.isPending && onClose()}
      title={t('bill.admin.plan.newTitle')}
      footer={
        <>
          {!valid && <span className="mr-auto self-center text-xs text-muted">{t('bill.admin.plan.invalid')}</span>}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('bill.admin.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('bill.admin.plan.create')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pl-tpl">
            {t('bill.admin.plan.template')}
          </label>
          <select id="pl-tpl" className="input" value={tplKey} onChange={(e) => setTplKey(e.target.value)}>
            {templates.map((x) => (
              <option key={x.key} value={x.key}>
                {x.title[lang]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pl-total">
            {t('bill.admin.plan.total')}
          </label>
          <input id="pl-total" className="input text-right tabular-nums" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted">{t('bill.admin.plan.totalHint')}</p>
        </div>
        <div>
          <label className="label" htmlFor="pl-title">
            {t('bill.admin.plan.planTitle')}
          </label>
          <input id="pl-title" className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pl-currency">
            {t('acct.currency.label')}
          </label>
          <select id="pl-currency" className="input" value={cur} onChange={(e) => setCurrency(e.target.value)}>
            {(settings?.currencies ?? CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {t(`acct.currency.names.${c}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_13rem_9rem_8rem_auto] sm:items-center">
            <input className="input" aria-label={t('bill.admin.plan.label')} placeholder={t('bill.admin.plan.label')} maxLength={160} value={r.label} onChange={(e) => setRow(r.key, { label: e.target.value })} />
            <TriggerSelect value={r.trigger} onChange={(v) => setRow(r.key, { trigger: v })} />
            <input type="date" className="input" aria-label={t('bill.admin.plan.dueDate')} disabled={r.trigger !== 'DATE'} value={r.dueDate} onChange={(e) => setRow(r.key, { dueDate: e.target.value })} />
            <input className="input text-right tabular-nums" inputMode="decimal" aria-label={t('bill.admin.plan.amount')} placeholder={t('bill.admin.plan.amount')} value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })} />
            <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg disabled:opacity-30" aria-label={t('bill.admin.plan.removeRow')} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-link hover:bg-primary/[0.06]" onClick={() => setRows((rs) => [...rs, { key: ++rowSeq, label: '', trigger: 'ON_SIGN', dueDate: '', amount: '' }])}>
          <Plus className="size-4" aria-hidden /> {t('bill.admin.plan.addRow')}
        </button>
        <span className="text-sm font-semibold text-ink tabular-nums">{t('bill.admin.plan.sum', { sum: fmtEur(sum, cur) })}</span>
      </div>
      <p className="mt-3 text-xs text-muted">{t('bill.admin.plan.catchUp')}</p>
    </Modal>
  );
}

/** Edit a pending instalment, or add one to a plan. */
export function InstallmentDialog({ planId, installment, onClose }: { planId: string; installment: Installment | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [label, setLabel] = useState(installment?.label ?? '');
  const [trigger, setTrigger] = useState(installment?.trigger ?? 'ON_SIGN');
  const [dueDate, setDueDate] = useState(installment?.dueDate?.slice(0, 10) ?? '');
  const [amount, setAmount] = useState(installment ? centsToInput(installment.amountCents) : '');
  const cents = parseEuro(amount);
  const valid = useMemo(() => label.trim().length > 0 && Number.isFinite(cents) && cents > 0 && (trigger !== 'DATE' || !!dueDate), [label, cents, trigger, dueDate]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { label: label.trim(), trigger, dueDate: trigger === 'DATE' ? dueDate : null, amountCents: cents };
      return installment ? api.put(`/admin/client-billing/installments/${installment.id}`, body) : api.post(`/admin/client-billing/plans/${planId}/installments`, body);
    },
    onSuccess: () => {
      toast.success(t('bill.admin.toasts.planUpdated'));
      void qc.invalidateQueries({ queryKey: BILLING_KEY });
      onClose();
    },
    onError: (e) => toast.error(billingErrText(e)),
  });
  return (
    <Modal
      open
      size="sm"
      onClose={() => !save.isPending && onClose()}
      title={installment ? t('bill.admin.plan.editTitle') : t('bill.admin.plan.addTitle')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('bill.admin.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('bill.admin.plan.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="in-label">
            {t('bill.admin.plan.label')}
          </label>
          <input id="in-label" className="input" maxLength={160} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="in-trigger">
            {t('bill.admin.plan.trigger')}
          </label>
          <TriggerSelect id="in-trigger" value={trigger} onChange={setTrigger} />
        </div>
        {trigger === 'DATE' && (
          <div>
            <label className="label" htmlFor="in-date">
              {t('bill.admin.plan.dueDate')}
            </label>
            <input id="in-date" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="in-amount">
            {t('bill.admin.plan.amount')}
          </label>
          <input id="in-amount" className="input text-right tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
