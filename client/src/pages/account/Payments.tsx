import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, Check, Copy, Download, Landmark, ListOrdered, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBilling } from '@/i18n/pagesBilling';
import { usePageTitle } from '@/lib/usePageTitle';
import { useMorphTarget } from '@/lib/viewTransition';
import { useL10n } from '@/lib/l10n';
import { Skeleton, SkeletonList } from '@/components/ui/Skeleton';
import { INSTALLMENT_BADGE, OPEN_STATUSES, STATUS_BADGE, fmtEur, otherCurrencies, triggerLabel, type BillingTotals, type ClientInvoice, type ClientPayment, type PaymentPlan } from '@/components/billing/api';
import { Documents } from '@/components/illustrations';

registerCopy(pagesBilling);

interface Billing {
  invoices: ClientInvoice[];
  payments: ClientPayment[];
  plans: PaymentPlan[];
  totals: BillingTotals;
  bank: { accountHolder: string; iban: string; bic: string; bank: string } | null;
  seller: { name: string };
}

const CopyButton = ({ value }: { value: string }) => {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-link hover:bg-sunken"
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

/** Same footprint as the loaded page (heading, four totals tiles, invoice list), so nothing jumps. */
const PaymentsSkeleton = () => (
  <div className="space-y-6">
    <div aria-hidden>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-24" />
        </div>
      ))}
    </div>
    <div>
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="card p-4">
        <SkeletonList count={3} />
      </div>
    </div>
  </div>
);

/** Portal › Documents › Payments: invoices (PDF), receipts, payment plan, balance, bank transfer details. */
export default function AccountPayments() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('bill.portal.title'));
  // the portal home's next-step card ("pay the invoice") morphs into this heading
  const morph = useMorphTarget('portal-next', 'step');
  const q = useQuery({ queryKey: ['account-billing'], queryFn: async () => (await api.get<Billing>('/account/billing')).data });
  if (q.isLoading) return <PaymentsSkeleton />;
  const d = q.data;
  if (!d) return <p className="text-sm text-danger">{t('bill.admin.errors.default')}</p>;
  const open = d.invoices.filter((i) => OPEN_STATUSES.includes(i.status));
  const day = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-page-title" {...morph.part('title')}>
          {t('bill.portal.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('bill.portal.subtitle')}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ['invoiced', d.totals.invoicedCents, ''],
            ['paid', d.totals.paidCents, 'text-success-fg'],
            ['open', d.totals.openCents, d.totals.openCents ? 'text-warning-fg' : ''],
            ['overdue', d.totals.overdueCents, d.totals.overdueCents ? 'text-danger-fg' : ''],
          ] as const
        ).map(([k, v, tone]) => (
          <div key={k} className="card p-4">
            <dt className="text-xs text-muted">{t(`bill.portal.tiles.${k}`)}</dt>
            <dd className={clsx('mt-1 font-display text-xl font-bold text-ink tabular-nums', tone)}>{fmtEur(v, d.totals.currency)}</dd>
          </div>
        ))}
      </dl>
      {otherCurrencies(d.totals).length > 0 && (
        <p className="-mt-2 text-xs text-muted">
          {otherCurrencies(d.totals)
            .map((c) => t('acct.currency.otherLine', { open: fmtEur(c.openCents, c.currency), invoiced: fmtEur(c.invoicedCents, c.currency) }))
            .join(' · ')}
        </p>
      )}

      {open.length > 0 && (
        <section className="card p-5" aria-labelledby="pay-how">
          <h3 id="pay-how" className="flex items-center gap-2 text-base font-semibold text-ink">
            <Landmark className="size-5 text-primary" aria-hidden /> {t('bill.portal.howToPay')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('bill.portal.bankText')}</p>
          {d.bank ? (
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">{t('bill.portal.holder')}</dt>
                <dd className="font-medium text-ink">{d.bank.accountHolder}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('bill.portal.iban')}</dt>
                <dd className="flex flex-wrap items-center gap-1 font-mono text-ink">
                  {d.bank.iban} <CopyButton value={d.bank.iban.replace(/\s+/g, '')} />
                </dd>
              </div>
              {d.bank.bic && (
                <div>
                  <dt className="text-xs text-muted">{t('bill.portal.bic')}</dt>
                  <dd className="font-mono text-ink">{d.bank.bic}</dd>
                </div>
              )}
              {d.bank.bank && (
                <div>
                  <dt className="text-xs text-muted">{t('bill.portal.bank')}</dt>
                  <dd className="text-ink">{d.bank.bank}</dd>
                </div>
              )}
              {open.map((i) => (
                <div key={i.id} className="sm:col-span-2">
                  <dt className="text-xs text-muted">{t('bill.portal.referenceFor', { number: i.number })}</dt>
                  <dd className="flex flex-wrap items-center gap-1 font-mono text-ink">
                    {i.number} · {fmtEur(i.openCents, i.currency)} <CopyButton value={i.number ?? ''} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">{t('bill.portal.noBank')}</p>
          )}
        </section>
      )}

      <section aria-labelledby="pay-invoices">
        <h3 id="pay-invoices" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
          <Receipt className="size-5 text-primary" aria-hidden /> {t('bill.portal.invoices')}
        </h3>
        {d.invoices.length === 0 ? (
          <div className="card flex flex-col items-center p-8 text-center">
            <Documents className="w-36" />
            <p className="type-card-title mt-4">{t('bill.portal.empty')}</p>
            <p className="text-sm text-muted">{t('bill.portal.emptyText')}</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {d.invoices.map((i) => (
              <li key={i.id} id={`invoice-${i.number}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink tabular-nums">{i.number}</p>
                  <p className={clsx('text-xs', i.status === 'OVERDUE' ? 'font-semibold text-danger-fg' : 'text-muted')}>
                    {i.status === 'PAID' && i.paidAt ? t('bill.portal.paidOn', { date: day(i.paidAt) }) : t('bill.portal.due', { date: day(i.dueDate) })}
                    {i.openCents > 0 && i.paidCents > 0 && ` · ${t('bill.portal.openAmount', { amount: fmtEur(i.openCents, i.currency) })}`}
                  </p>
                </div>
                <span className="font-semibold text-ink tabular-nums">{fmtEur(i.grossCents, i.currency)}</span>
                <span className={clsx('badge', STATUS_BADGE[i.status])}>{t(`bill.status.${i.status}`)}</span>
                <a href={`/api/account/billing/invoices/${i.id}/pdf`} className="btn-secondary btn-sm" download>
                  <Download className="size-3.5" aria-hidden /> {t('bill.portal.pdf')}
                </a>
              </li>
            ))}
          </ul>
        )}
        {d.invoices.length > 0 && open.length === 0 && <p className="mt-2 text-sm text-success-fg">{t('bill.portal.nothingOpen')}</p>}
      </section>

      {d.plans.length > 0 && (
        <section aria-labelledby="pay-plan">
          <h3 id="pay-plan" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <ListOrdered className="size-5 text-primary" aria-hidden /> {t('bill.portal.plan')}
          </h3>
          <div className="space-y-3">
            {d.plans.map((p) => (
              <div key={p.id} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <p className="font-semibold text-ink">{p.title}</p>
                  <span className="text-sm font-semibold tabular-nums">{fmtEur(p.totalCents, p.currency)}</span>
                </div>
                <ol className="divide-y divide-line">
                  {p.installments
                    .filter((i) => i.status !== 'CANCELLED')
                    .map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-xs font-bold text-primary">{i.seq}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{i.label}</span>
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <CalendarClock className="size-3" aria-hidden /> {triggerLabel(i.trigger)}
                            {i.dueDate && ` · ${day(i.dueDate)}`}
                          </span>
                        </span>
                        <span className="tabular-nums">{fmtEur(i.amountCents, p.currency)}</span>
                        <span className={clsx('badge', INSTALLMENT_BADGE[i.status])}>{t(`bill.instStatus.${i.status}`)}</span>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      {d.payments.length > 0 && (
        <section aria-labelledby="pay-payments">
          <h3 id="pay-payments" className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
            <Check className="size-5 text-primary" aria-hidden /> {t('bill.portal.payments')}
          </h3>
          <ul className="card divide-y divide-line">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">
                    {day(p.paidAt)} · {t(`bill.method.${p.method}`)}
                  </span>
                  <span className="text-xs text-muted">{p.invoiceNumber ?? '—'}</span>
                </span>
                <span className="font-semibold text-success-fg tabular-nums">{fmtEur(p.amountCents, p.currency)}</span>
                <a href={`/api/account/billing/payments/${p.id}/receipt`} className="btn-secondary btn-sm" download>
                  <Download className="size-3.5" aria-hidden /> {t('bill.portal.receipt')}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
