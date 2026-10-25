import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, AlertTriangle, Download, Euro, Receipt, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { companyInvoicesCopy } from '@/i18n/pagesBooking';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState, StatTile, StatusPill, Table } from '@/components/ui';
import { Documents } from '@/components/illustrations';

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
        <h2 id="company-invoices-title" className="type-page-title">
          {t('companyInvoices.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('companyInvoices.subtitle')}</p>
      </div>

      {q.isLoading ? (
        <div className="grid min-h-40 place-items-center text-primary" role="status">
          <Spinner className="size-7 border-[3px]" />
        </div>
      ) : q.error || !q.data ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-border bg-danger-bg p-8 text-center text-sm text-danger-fg" role="alert">
          <AlertCircle className="size-5" aria-hidden />
          {t('companyInvoices.loadFailed')}
          <button type="button" className="btn-secondary btn-sm" onClick={() => q.refetch()}>
            <RefreshCw className="size-3.5" aria-hidden /> {t('companyInvoices.retry')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <StatTile label={t('companyInvoices.open')} value={eur.format(q.data.summary.openCents / 100)} icon={Euro} className="rounded-2xl sm:p-5" />
            <StatTile
              label={t('companyInvoices.overdue')}
              value={eur.format(q.data.summary.overdueCents / 100)}
              icon={AlertTriangle}
              tone={q.data.summary.overdueCount ? 'danger' : undefined}
              className="rounded-2xl sm:p-5"
            />
          </div>

          {q.data.invoices.length === 0 ? (
            <EmptyState className="card" illustration={<Documents className="w-32" />} icon={Receipt} title={t('companyInvoices.empty')} text={t('companyInvoices.emptyText')} />
          ) : (
            <div className="card overflow-hidden max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none">
              <Table
                rows={q.data.invoices}
                rowKey={(inv) => inv.id}
                stackOnMobile
                stickyHeader={false}
                caption={t('companyInvoices.title')}
                columns={[
                  { key: 'number', header: t('companyInvoices.number'), primary: true, cell: (inv) => <span className="num font-semibold text-ink">{inv.number}</span> },
                  { key: 'issued', header: t('companyInvoices.issued'), hideBelow: 'md', cell: (inv) => <span className="num">{date(inv.issueDate)}</span> },
                  {
                    key: 'due',
                    header: t('companyInvoices.due'),
                    cell: (inv) =>
                      inv.status === 'PAID' && inv.paidAt ? (
                        <span className="text-muted">{t('companyInvoices.paidOn', { date: date(inv.paidAt) })}</span>
                      ) : (
                        <span className={clsx('num', inv.status === 'OVERDUE' && 'font-semibold text-danger')}>{date(inv.dueDate)}</span>
                      ),
                  },
                  {
                    key: 'amount',
                    header: t('companyInvoices.amount'),
                    numeric: true,
                    cell: (inv) => <span className={clsx('font-semibold', inv.status === 'CANCELLED' ? 'text-muted line-through' : 'text-ink')}>{eur.format(inv.grossCents / 100)}</span>,
                  },
                  { key: 'status', header: <span className="sr-only">{t('employerWorkers.cols.status')}</span>, mobileLabel: ' ', cell: (inv) => <StatusPill domain="invoice" status={inv.status} label={t(`companyInvoices.status.${inv.status}`)} /> },
                  {
                    key: 'pdf',
                    header: <span className="sr-only">{t('companyInvoices.download')}</span>,
                    mobileLabel: ' ',
                    align: 'right',
                    cell: (inv) => (
                      <a href={`/api/company/invoices/${inv.id}/pdf`} className="btn-secondary btn-sm" download aria-label={`${t('companyInvoices.download')} ${inv.number}`}>
                        <Download className="size-3.5" aria-hidden /> PDF
                      </a>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default CompanyInvoices;
