import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import {
  BILLING_KEY,
  CURRENCIES,
  LINE_CATEGORIES,
  addDaysIso,
  billingErrText,
  centsToInput,
  fmtEur,
  isoDay,
  parseEuro,
  parseQty,
  totalsOf,
  type BillingSettingsResponse,
  type ClientInvoice,
  type Currency,
  type LineCategory,
} from './api';

interface LineDraft {
  key: number;
  description: string;
  qty: string;
  price: string;
  category: LineCategory;
}
let seq = 0;
const blank = (category: LineCategory = 'SERVICE_FEE'): LineDraft => ({ key: ++seq, description: '', qty: '1', price: '', category });

interface ClientOpt {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  cases: { id: string; number: string; status: string }[];
}

export const useBillingSettings = () =>
  useQuery({
    queryKey: [...BILLING_KEY, 'settings'],
    queryFn: async () => (await api.get<BillingSettingsResponse>('/admin/client-billing/settings')).data,
    staleTime: 60_000,
  });

const Field = ({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    {children}
    {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
  </div>
);

/**
 * Create / edit a client invoice draft. With `fixed` (case card) the client and case are set; otherwise the
 * client is searched by name / e-mail and one of their cases can be chosen.
 */
export function InvoiceEditor({ invoice, fixed, onClose }: { invoice: ClientInvoice | null; fixed?: { clientId: string; clientName: string; caseId: string | null }; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const settingsQ = useBillingSettings();
  const s = settingsQ.data?.settings;
  const terms = s?.paymentTermsDays ?? 14;
  const [currency, setCurrency] = useState<Currency>((invoice?.currency as Currency | undefined) ?? 'EUR');
  const [currencyTouched, setCurrencyTouched] = useState(!!invoice);
  useEffect(() => {
    if (!currencyTouched && settingsQ.data?.defaultCurrency) setCurrency(settingsQ.data.defaultCurrency);
  }, [currencyTouched, settingsQ.data?.defaultCurrency]);
  const baseRate = !s || s.vatMode === 'STANDARD' ? (s?.vatRate ?? 19) : 0;
  // The issuing entity of the currency decides the VAT (German company or the Baku office).
  const rate = settingsQ.data?.vatRateByCurrency?.[currency] ?? baseRate;
  const entity = settingsQ.data?.entityByCurrency?.[currency] ?? 'DE';
  const money = (c: number) => fmtEur(c, currency);
  const today = isoDay(new Date());
  const period = invoice?.items.find((l) => l.servicePeriod)?.servicePeriod;

  const [clientId, setClientId] = useState(invoice?.clientId ?? fixed?.clientId ?? '');
  const [caseId, setCaseId] = useState<string>(invoice?.caseId ?? fixed?.caseId ?? '');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(h);
  }, [q]);
  const clientsQ = useQuery({
    queryKey: [...BILLING_KEY, 'clients', debounced],
    queryFn: async () => (await api.get<{ clients: ClientOpt[] }>('/admin/client-billing/clients', { params: { q: debounced } })).data.clients,
    enabled: !fixed,
    staleTime: 30_000,
  });
  const chosen = clientsQ.data?.find((c) => c.id === clientId);

  const [issueDate, setIssueDate] = useState(invoice ? invoice.issueDate.slice(0, 10) : today);
  const [dueDate, setDueDate] = useState(invoice ? invoice.dueDate.slice(0, 10) : addDaysIso(today, terms));
  const [dueTouched, setDueTouched] = useState(!!invoice);
  useEffect(() => {
    if (!dueTouched && issueDate) setDueDate(addDaysIso(issueDate, terms));
  }, [terms, issueDate, dueTouched]);
  const [serviceFrom, setServiceFrom] = useState(period?.from ?? '');
  const [serviceTo, setServiceTo] = useState(period?.to && period.to !== period.from ? period.to : '');
  const [note, setNote] = useState(invoice?.note ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() =>
    invoice?.items.length
      ? invoice.items.map((l) => ({ key: ++seq, description: l.description, qty: String(l.quantity).replace('.', ','), price: centsToInput(l.unitPriceCents), category: l.category }))
      : [blank()],
  );

  const parsed = lines.map((l) => ({ description: l.description.trim(), quantity: parseQty(l.qty), unitPriceCents: parseEuro(l.price), category: l.category }));
  const totals = totalsOf(parsed, rate);
  const valid = !!clientId && parsed.length > 0 && parsed.every((l) => l.description && Number.isFinite(l.quantity) && Number.isFinite(l.unitPriceCents)) && totals.gross > 0;

  const save = useMutation({
    mutationFn: async () => {
      const body = { clientId, caseId: caseId || null, issueDate, dueDate, serviceFrom: serviceFrom || null, serviceTo: serviceTo || null, items: parsed, note: note.trim() || null, currency };
      return invoice ? api.put(`/admin/client-billing/invoices/${invoice.id}`, body) : api.post('/admin/client-billing/invoices', body);
    },
    onSuccess: () => {
      toast.success(t('bill.admin.toasts.saved'));
      void qc.invalidateQueries({ queryKey: BILLING_KEY });
      onClose();
    },
    onError: (e) => toast.error(billingErrText(e)),
  });

  const setLine = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      size="lg"
      title={invoice ? t('bill.admin.editor.editTitle') : t('bill.admin.editor.newTitle')}
      footer={
        <>
          {!valid && <span className="mr-auto self-center text-xs text-muted">{t('bill.admin.editor.invalid')}</span>}
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('bill.admin.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('bill.admin.editor.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fixed ? (
          <div className="sm:col-span-2">
            <p className="label">{t('bill.admin.editor.client')}</p>
            <p className="text-sm font-semibold text-ink">{fixed.clientName}</p>
          </div>
        ) : (
          <>
            <Field label={`${t('bill.admin.editor.client')} *`} id="ci-client">
              <input type="search" className="input mb-2" placeholder={t('bill.admin.editor.searchClient')} aria-label={t('bill.admin.editor.searchClient')} value={q} onChange={(e) => setQ(e.target.value)} />
              <select
                id="ci-client"
                className="input"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setCaseId('');
                }}
              >
                <option value="">—</option>
                {invoice && !chosen && <option value={invoice.clientId}>{invoice.clientName ?? invoice.clientId}</option>}
                {clientsQ.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} · {c.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('bill.admin.editor.case')} id="ci-case">
              <select id="ci-case" className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
                <option value="">{t('bill.admin.editor.noCase')}</option>
                {invoice?.caseId && !chosen && <option value={invoice.caseId}>{invoice.caseNumber ?? invoice.caseId}</option>}
                {chosen?.cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.number}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label={t('bill.admin.editor.issueDate')} id="ci-issue">
          <input id="ci-issue" type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </Field>
        <Field label={t('bill.admin.editor.dueDate')} id="ci-due" hint={t('bill.admin.editor.dueHint', { days: terms })}>
          <input
            id="ci-due"
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
        <Field label={t('bill.admin.editor.serviceFrom')} id="ci-sfrom" hint={t('bill.admin.editor.serviceHint')}>
          <input id="ci-sfrom" type="date" className="input" value={serviceFrom} onChange={(e) => setServiceFrom(e.target.value)} />
        </Field>
        <Field label={t('bill.admin.editor.serviceTo')} id="ci-sto">
          <input id="ci-sto" type="date" className="input" min={serviceFrom || undefined} value={serviceTo} onChange={(e) => setServiceTo(e.target.value)} />
        </Field>
        <Field label={t('acct.currency.label')} id="ci-currency" hint={t(`acct.currency.entityHint.${entity}`)}>
          <select
            id="ci-currency"
            className="input"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value as Currency);
              setCurrencyTouched(true);
            }}
          >
            {(settingsQ.data?.currencies ?? CURRENCIES).map((c) => (
              <option key={c} value={c}>
                {t(`acct.currency.names.${c}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-ink">{t('bill.admin.editor.items')}</h3>
      <ul className="space-y-2">
        {lines.map((l, i) => {
          const p = parsed[i];
          const total = Number.isFinite(p.quantity) && Number.isFinite(p.unitPriceCents) ? Math.round(p.quantity * p.unitPriceCents) : null;
          return (
            <li key={l.key} className="grid gap-2 rounded-xl border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
              <input className="input" placeholder={t('bill.admin.editor.description')} aria-label={t('bill.admin.editor.description')} maxLength={500} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
              <select className="input" aria-label={t('bill.admin.editor.category')} value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value as LineCategory })}>
                {LINE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`bill.category.${c}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="hidden size-9 place-items-center self-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg disabled:opacity-30 sm:grid"
                aria-label={t('bill.admin.editor.removeLine')}
                disabled={lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
              >
                <X className="size-4" aria-hidden />
              </button>
              <div className="grid grid-cols-[5rem_1fr_auto_auto] items-center gap-2 sm:col-span-3">
                <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.quantity) && l.qty && 'border-danger')} inputMode="decimal" aria-label={t('bill.admin.editor.qty')} placeholder={t('bill.admin.editor.qty')} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                <input className={clsx('input text-right tabular-nums', !Number.isFinite(p.unitPriceCents) && l.price && 'border-danger')} inputMode="decimal" aria-label={t('bill.admin.editor.unitPrice')} placeholder={t('bill.admin.editor.unitPrice')} value={l.price} onChange={(e) => setLine(l.key, { price: e.target.value })} />
                <span className="min-w-20 text-right text-sm font-semibold text-ink tabular-nums">{total === null ? '—' : money(total)}</span>
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-bg hover:text-danger-fg disabled:opacity-30 sm:hidden"
                  aria-label={t('bill.admin.editor.removeLine')}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {lines.length < 60 && (
        <button type="button" className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-link hover:bg-primary/[0.06]" onClick={() => setLines((ls) => [...ls, blank()])}>
          <Plus className="size-4" aria-hidden /> {t('bill.admin.editor.addLine')}
        </button>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_17rem]">
        <Field label={t('bill.admin.editor.note')} id="ci-note">
          <textarea id="ci-note" className="input resize-y" rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="rounded-xl bg-sunken p-4 text-sm">
          <p className="mb-3 text-xs text-muted">{entity === 'AZ' ? t('acct.currency.azVat', { rate }) : t(`bill.admin.editor.vatInfo.${s?.vatMode ?? 'STANDARD'}`, { rate })}</p>
          <dl className="space-y-1.5 tabular-nums">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('bill.admin.editor.net')}</dt>
              <dd>{money(totals.taxable)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t('bill.admin.editor.vatAmount', { rate })}</dt>
              <dd>{money(totals.vat)}</dd>
            </div>
            {totals.pass > 0 && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t('bill.admin.editor.passThrough')}</dt>
                <dd>{money(totals.pass)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2 border-t border-line pt-1.5 text-base font-bold text-ink">
              <dt>{t('bill.admin.editor.gross')}</dt>
              <dd>{money(totals.gross)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </Modal>
  );
}
