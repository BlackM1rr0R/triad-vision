import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, CheckCircle2, Copy, Download, GitCommitVertical, Landmark, TriangleAlert } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPortalPlans } from '@/i18n/pagesPortalPlans';
import { useL10n } from '@/lib/l10n';
import { Modal } from '@/components/ui/Modal';
import { OPEN_STATUSES, fmtEur, triggerLabel, type ClientInvoice, type PaymentPlan } from '@/components/billing/api';

registerCopy(pagesPortalPlans);

export type TimelineState = 'paid' | 'due' | 'overdue' | 'upcoming';

export interface TimelineEntry {
  id: string;
  kind: 'invoice' | 'installment';
  state: TimelineState;
  /** Paid: payment day; open: due day; planned instalment: its due day if fixed (else null, sorted last). */
  date: string | null;
  amountCents: number;
  openCents: number;
  currency: string;
  label: string;
  invoice: ClientInvoice | null;
  trigger: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * One date-ordered list of the client's invoices and the instalments of their payment plans that have no invoice
 * yet (an invoiced instalment is shown through its invoice). Drafts and cancelled items are left out.
 */
export const buildTimeline = (invoices: ClientInvoice[], plans: PaymentPlan[], now = new Date()): TimelineEntry[] => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: TimelineEntry[] = [];
  for (const i of invoices) {
    if (i.status === 'DRAFT' || i.status === 'CANCELLED') continue;
    const open = OPEN_STATUSES.includes(i.status) && i.openCents > 0;
    const overdue = open && (i.status === 'OVERDUE' || new Date(i.dueDate).getTime() + DAY <= today);
    out.push({
      id: `inv-${i.id}`,
      kind: 'invoice',
      state: !open ? 'paid' : overdue ? 'overdue' : 'due',
      date: !open ? (i.paidAt ?? i.dueDate) : i.dueDate,
      amountCents: i.grossCents,
      openCents: open ? i.openCents : 0,
      currency: i.currency,
      label: i.number ?? '',
      invoice: i,
      trigger: null,
    });
  }
  for (const p of plans) {
    if (p.status === 'CANCELLED') continue;
    for (const s of p.installments) {
      if (s.invoiceId || s.status === 'CANCELLED' || s.status === 'INVOICED') continue;
      out.push({
        id: `inst-${s.id}`,
        kind: 'installment',
        state: s.status === 'PAID' ? 'paid' : 'upcoming',
        date: s.dueDate,
        amountCents: s.amountCents,
        openCents: 0,
        currency: p.currency,
        label: s.label || `${p.title} · ${s.seq}`,
        invoice: null,
        trigger: s.trigger,
      });
    }
  }
  return out.sort((a, b) => (a.date ? new Date(a.date).getTime() : Infinity) - (b.date ? new Date(b.date).getTime() : Infinity));
};

const DOT: Record<TimelineState, string> = {
  paid: 'bg-success text-white',
  due: 'bg-warning text-white',
  overdue: 'bg-danger text-white',
  upcoming: 'border-2 border-line-strong bg-card text-muted',
};
const BADGE: Record<TimelineState, string> = {
  paid: 'bg-success-bg text-success-fg',
  due: 'bg-warning-bg text-warning-fg',
  overdue: 'bg-danger-bg text-danger-fg',
  upcoming: 'bg-neutral-bg text-neutral-fg',
};
const DOT_ICON = { paid: CheckCircle2, due: Landmark, overdue: TriangleAlert, upcoming: GitCommitVertical } as const;

const CopyValue = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-link hover:bg-sunken sm:min-h-9 sm:text-xs"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {done ? t('bill.portal.copied') : t('bill.portal.copy')}
    </button>
  );
};

export interface BankDetails {
  accountHolder: string;
  iban: string;
  bic: string;
  bank: string;
}

/** "Pay": there is no online payment — bank transfer details with the reference, and the invoice PDF. */
const PayDialog = ({ invoice, bank, onClose }: { invoice: ClientInvoice | null; bank: BankDetails | null; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={invoice ? t('pplan.pay.payTitle', { number: invoice.number ?? '' }) : ''}
      description={t('pplan.pay.payText')}
      icon={<Landmark className="size-5 text-primary" aria-hidden />}
      footer={
        invoice && (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('pplan.pay.close')}
            </button>
            <a href={`/api/account/billing/invoices/${invoice.id}/pdf`} className="btn-primary" download>
              <Download className="size-4" aria-hidden /> {t('pplan.pay.download')}
            </a>
          </>
        )
      }
    >
      {invoice && (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">{t('pplan.pay.amount')}</dt>
            <dd className="font-display text-lg font-bold text-ink tabular-nums">{fmtEur(invoice.openCents, invoice.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('pplan.pay.reference')}</dt>
            <dd className="flex flex-wrap items-center gap-1 font-mono text-ink">
              {invoice.number} <CopyValue value={invoice.number ?? ''} />
            </dd>
          </div>
          {bank ? (
            <>
              <div>
                <dt className="text-xs text-muted">{t('bill.portal.holder')}</dt>
                <dd className="font-medium text-ink">{bank.accountHolder}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('bill.portal.iban')}</dt>
                <dd className="flex flex-wrap items-center gap-1 font-mono break-all text-ink">
                  {bank.iban} <CopyValue value={bank.iban.replace(/\s+/g, '')} />
                </dd>
              </div>
              {bank.bic && (
                <div>
                  <dt className="text-xs text-muted">{t('bill.portal.bic')}</dt>
                  <dd className="font-mono text-ink">{bank.bic}</dd>
                </div>
              )}
              {bank.bank && (
                <div>
                  <dt className="text-xs text-muted">{t('bill.portal.bank')}</dt>
                  <dd className="text-ink">{bank.bank}</dd>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted sm:col-span-2">{t('pplan.pay.noBank')}</p>
          )}
        </dl>
      )}
    </Modal>
  );
};

/**
 * Portal › Payments: a vertical timeline of paid / due / overdue invoices and planned instalments with amounts and
 * dates, a "today" marker, and one "Pay" button per open invoice (bank transfer details + invoice PDF).
 */
export const PaymentTimeline = ({ invoices, plans, bank, personOf }: { invoices: ClientInvoice[]; plans: PaymentPlan[]; bank: BankDetails | null; personOf?: (caseId: string | null) => string | null }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const [paying, setPaying] = useState<ClientInvoice | null>(null);
  const entries = buildTimeline(invoices, plans);
  if (!entries.length) return null;
  const now = Date.now();
  // "Today" goes before the first entry dated in the future (undated planned instalments come last).
  const todayAt = entries.findIndex((e) => !e.date || new Date(e.date).getTime() > now);
  const day = (iso: string) => date(iso, { day: 'numeric', month: 'short', year: 'numeric' });

  const todayMarker = (
    <li key="today" className="relative flex items-center gap-3 py-1 pl-0" aria-hidden>
      <span className="relative z-10 grid size-8 shrink-0 place-items-center">
        <span className="size-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
      </span>
      <span className="text-xs font-bold tracking-wide text-primary uppercase">{t('pplan.pay.today')}</span>
      <span className="h-px flex-1 bg-primary/30" />
    </li>
  );

  return (
    <section aria-labelledby="pay-timeline" className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="pay-timeline" className="text-base font-semibold text-ink">
            {t('pplan.pay.title')}
          </h3>
          <p className="text-sm text-muted">{t('pplan.pay.subtitle')}</p>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label={t('pplan.pay.title')}>
          {(['paid', 'due', 'overdue', 'upcoming'] as const).map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <span className={clsx('size-2.5 rounded-full', DOT[s])} aria-hidden /> {t(`pplan.pay.legend.${s}`)}
            </li>
          ))}
        </ul>
      </div>

      <ol className="relative mt-5 space-y-2 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-line">
        {entries.map((e, idx) => {
          const Dot = DOT_ICON[e.state];
          const person = personOf && e.invoice ? personOf(e.invoice.caseId) : null;
          return [
            idx === todayAt ? todayMarker : null,
            <li key={e.id} className="relative flex gap-3">
              <span className={clsx('relative z-10 grid size-8 shrink-0 place-items-center rounded-full', DOT[e.state])}>
                <Dot className="size-4" aria-hidden />
              </span>
              <div
                className={clsx(
                  'flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border p-3',
                  e.state === 'overdue' ? 'border-danger-border bg-danger-bg/40' : e.state === 'due' ? 'border-warning-border bg-card' : 'border-line bg-card',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words text-ink">
                    {e.kind === 'invoice' ? t('pplan.pay.invoice', { number: e.label }) : e.label}
                    {person && <span className="badge ml-2 bg-sunken align-middle text-[11px] font-medium text-muted">{person}</span>}
                  </p>
                  <p className={clsx('text-xs', e.state === 'overdue' ? 'font-semibold text-danger-fg' : 'text-muted')}>
                    {e.state === 'paid' && e.date
                      ? t('pplan.pay.paidOn', { date: day(e.date) })
                      : e.date
                        ? t('pplan.pay.dueOn', { date: day(e.date) })
                        : `${t('pplan.pay.planned')}${e.trigger ? ` · ${triggerLabel(e.trigger)}` : ''}`}
                    {e.openCents > 0 && e.openCents !== e.amountCents && ` · ${t('pplan.pay.openAmount', { amount: fmtEur(e.openCents, e.currency) })}`}
                  </p>
                </div>
                <span className="font-semibold text-ink tabular-nums">{fmtEur(e.amountCents, e.currency)}</span>
                <span className={clsx('badge', BADGE[e.state])}>{t(`pplan.pay.legend.${e.state}`)}</span>
                {(e.state === 'due' || e.state === 'overdue') && e.invoice && (
                  <button type="button" className="btn-primary btn-sm min-h-11 sm:min-h-9" onClick={() => setPaying(e.invoice)} aria-label={t('pplan.pay.payTitle', { number: e.label })}>
                    <Landmark className="size-3.5" aria-hidden /> {t('pplan.pay.pay')}
                  </button>
                )}
              </div>
            </li>,
          ];
        })}
        {todayAt === -1 && todayMarker}
      </ol>
      <PayDialog invoice={paying} bank={bank} onClose={() => setPaying(null)} />
    </section>
  );
};

export default PaymentTimeline;
