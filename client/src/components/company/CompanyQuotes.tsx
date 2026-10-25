import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, ArrowLeft, ChevronRight, FileText, RefreshCw } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesQuotes } from '@/i18n/pagesQuotes';
import { Spinner } from '@/components/ui/Spinner';
import { QUOTE_STATUS_TONE, QuoteDocument, QuoteRespond, deDate, fmtEur, type CustomerQuote, type QuoteStatus } from '@/components/quotes/QuoteDocument';
import { EmptyState } from '@/components/ui/EmptyState';
import { Documents } from '@/components/illustrations';

registerCopy(pagesQuotes);

interface ListItem {
  id: string;
  number: string;
  title: string;
  status: QuoteStatus;
  sentAt: string | null;
  validUntil: string;
  grossCents: number;
}

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`quotePublic.errors.${code}`) ? i18n.t(`quotePublic.errors.${code}`) : i18n.t('quotePublic.errors.default');
};

const Loading = () => (
  <div className="grid min-h-40 place-items-center text-primary" role="status">
    <Spinner className="size-7 border-[3px]" />
  </div>
);

const Failed = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-border bg-danger-bg p-8 text-center text-sm text-danger-fg" role="alert">
      <AlertCircle className="size-5" aria-hidden />
      {t('companyQuotes.loadFailed')}
      <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
        <RefreshCw className="size-3.5" aria-hidden /> {t('companyQuotes.retry')}
      </button>
    </div>
  );
};

/** "Angebote" tab of the employer portal: list (/company/quotes) and one quote (/company/quotes/:id). */
export const CompanyQuotes = () => {
  const { id } = useParams();
  return id ? <QuoteDetail id={id} /> : <QuoteList />;
};

const QuoteList = () => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['company-quotes'], queryFn: async () => (await api.get<{ quotes: ListItem[] }>('/company/quotes')).data.quotes });
  const open = q.data?.filter((x) => x.status === 'SENT' || x.status === 'VIEWED').length ?? 0;
  return (
    <section aria-labelledby="company-quotes-title" className="space-y-5">
      <div>
        <h2 id="company-quotes-title" className="type-page-title">
          {t('companyQuotes.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('companyQuotes.subtitle')}</p>
        {open > 0 && <p className="mt-2 inline-flex rounded-full bg-sunken px-3 py-1 text-xs font-semibold text-link">{t('companyQuotes.openCount', { count: open })}</p>}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error || !q.data ? (
        <Failed onRetry={() => q.refetch()} />
      ) : q.data.length === 0 ? (
        <EmptyState className="card" illustration={<Documents className="w-32" />} icon={FileText} title={t('companyQuotes.empty')} text={t('companyQuotes.emptyText')} />
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {q.data.map((x) => (
            <li key={x.id}>
              <Link to={`/company/quotes/${x.id}`} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-sunken sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink tabular-nums">{x.number}</p>
                  <p className="truncate text-sm text-ink">{x.title}</p>
                  <p className="text-xs text-muted">{t('companyQuotes.validUntil', { date: deDate(x.validUntil) })}</p>
                </div>
                <span className="num font-semibold text-ink">{fmtEur(x.grossCents)}</span>
                <span className={clsx('badge', QUOTE_STATUS_TONE[x.status])}>{t(`quotePublic.status.${x.status}`)}</span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const QuoteDetail = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['company-quote', id];
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ quote: CustomerQuote }>(`/company/quotes/${id}`)).data.quote });
  const act = useMutation({
    mutationFn: async (a: { kind: 'accept'; name: string } | { kind: 'decline'; reason: string }) =>
      (a.kind === 'accept'
        ? await api.post<{ quote: CustomerQuote }>(`/company/quotes/${id}/accept`, { name: a.name, confirm: true })
        : await api.post<{ quote: CustomerQuote }>(`/company/quotes/${id}/decline`, { reason: a.reason })
      ).data.quote,
    onSuccess: (quote) => {
      qc.setQueryData(key, quote);
      void qc.invalidateQueries({ queryKey: ['company-quotes'] });
    },
  });
  return (
    <section className="space-y-5">
      <Link to="/company/quotes" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('companyQuotes.back')}
      </Link>
      {q.isLoading ? (
        <Loading />
      ) : q.error || !q.data ? (
        <Failed onRetry={() => q.refetch()} />
      ) : (
        <>
          <p className="text-xs text-muted">{t('quotePublic.germanNote')}</p>
          <QuoteRespond
            q={q.data}
            busy={act.isPending}
            error={act.error ? errText(act.error) : null}
            onAccept={(name) => act.mutate({ kind: 'accept', name })}
            onDecline={(reason) => act.mutate({ kind: 'decline', reason })}
          />
          <QuoteDocument q={q.data} pdfHref={`/api/company/quotes/${id}/pdf`} />
        </>
      )}
    </section>
  );
};

export default CompanyQuotes;
