import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, AlertTriangle, Download, Euro, Receipt, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { companyInvoicesCopy } from '@/i18n/pagesBooking';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(companyInvoicesCopy);

type Status = 'SENT' | 'OVERDUE' | 'PAID' | 'CANCELLED';
interface CompanyInvoice {
  id: string;
  number: string;
  status: Status;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  grossCents: number;
}
interface Response {
  invoices: CompanyInvoice[];
  summary: { openCents: number; openCount: number; overdueCents: number; overdueCount: number };
}

const TONE: Record<Status, string> = {
  SENT: 'bg-brand-100 text-brand-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PAID: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-200 text-slate-600',
};

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const INTL = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' } as const;

/** Employer's invoices (no drafts) with totals and PDF download. Rendered inside the company portal. */
export const CompanyInvoices = () => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage?.slice(0, 2) ?? 'de') as keyof typeof INTL;
  // dd.mm.yyyy is unambiguous in every UI language and avoids incomplete Azerbaijani month data.
  const date = (iso: string) => new Intl.DateTimeFormat(INTL[lang] ?? 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(iso));
  const q = useQuery({
    queryKey: ['company-invoices'],
    queryFn: async () => (await api.get<Response>('/company/invoices')).data,
  });

  return (
    <section aria-labelledby="company-invoices-title" className="space-y-5">
      <div>
        <h2 id="company-invoices-title" className="font-display text-xl font-bold text-navy-900 sm:text-2xl">
          {t('companyInvoices.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('companyInvoices.subtitle')}</p>
      </div>

      {q.isLoading ? (
        <div className="grid min-h-40 place-items-center text-brand-600" role="status">
          <Spinner className="size-7 border-[3px]" />
        </div>
      ) : q.error || !q.data ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-800" role="alert">
          <AlertCircle className="size-5" aria-hidden />
          {t('companyInvoices.loadFailed')}
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => q.refetch()}>
            <RefreshCw className="size-3.5" aria-hidden /> {t('companyInvoices.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <Euro className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted">{t('companyInvoices.open')}</span>
                <span className="block font-display text-lg font-bold text-navy-900 tabular-nums sm:text-xl">{eur.format(q.data.summary.openCents / 100)}</span>
              </span>
            </div>
            <div className="card flex items-center gap-3 p-4">
              <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', q.data.summary.overdueCount ? 'bg-red-100 text-red-700' : 'bg-surface text-muted')}>
                <AlertTriangle className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-muted">{t('companyInvoices.overdue')}</span>
                <span className={clsx('block font-display text-lg font-bold tabular-nums sm:text-xl', q.data.summary.overdueCount ? 'text-danger' : 'text-navy-900')}>
                  {eur.format(q.data.summary.overdueCents / 100)}
                </span>
              </span>
            </div>
          </div>

          {q.data.invoices.length === 0 ? (
            <div className="card flex flex-col items-center px-4 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-surface text-muted">
                <Receipt className="size-6" aria-hidden />
              </span>
              <p className="mt-3 font-semibold text-navy-900">{t('companyInvoices.empty')}</p>
              <p className="mt-1 text-sm text-muted">{t('companyInvoices.emptyText')}</p>
            </div>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {q.data.invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900 tabular-nums">{inv.number}</p>
                    <p className="text-xs text-muted">
                      {t('companyInvoices.issued')} {date(inv.issueDate)} ·{' '}
                      {inv.status === 'PAID' && inv.paidAt ? (
                        t('companyInvoices.paidOn', { date: date(inv.paidAt) })
                      ) : (
                        <span className={clsx(inv.status === 'OVERDUE' && 'font-semibold text-danger')}>
                          {t('companyInvoices.due')} {date(inv.dueDate)}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={clsx('font-semibold tabular-nums', inv.status === 'CANCELLED' ? 'text-muted line-through' : 'text-navy-900')}>{eur.format(inv.grossCents / 100)}</span>
                  <span className={clsx('badge', TONE[inv.status])}>{t(`companyInvoices.status.${inv.status}`)}</span>
                  <a href={`/api/company/invoices/${inv.id}/pdf`} className="btn-white btn-sm border border-line" download aria-label={`${t('companyInvoices.download')} ${inv.number}`}>
                    <Download className="size-3.5" aria-hidden /> PDF
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};

export default CompanyInvoices;
