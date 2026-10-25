import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import i18n, { registerCopy } from '@/i18n';
import { pagesQuotes } from '@/i18n/pagesQuotes';
import { QuoteDocument, QuoteRespond, type CustomerQuote } from '@/components/quotes/QuoteDocument';
import { Spinner } from '@/components/ui/Spinner';
import { Lost } from '@/components/illustrations';

registerCopy(pagesQuotes);

const errText = (err: unknown) => {
  const code = errorCode(err);
  return i18n.exists(`quotePublic.errors.${code}`) ? i18n.t(`quotePublic.errors.${code}`) : i18n.t('quotePublic.errors.default');
};

/** Public quote page for the e-mail link (/angebot/:token). Works without an account; never indexed. */
export default function QuotePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const base = `/angebot/${encodeURIComponent(token)}`;
  const key = ['quote-link', token];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ quote: CustomerQuote }>(base)).data.quote,
    retry: (count, err) => count < 2 && errorCode(err) === 'NETWORK',
    refetchOnWindowFocus: false,
  });
  usePageTitle(q.data ? `${t('quotePublic.eyebrow')} ${q.data.number ?? ''}` : t('quotePublic.eyebrow'));

  const act = useMutation({
    mutationFn: async (a: { kind: 'accept'; name: string } | { kind: 'decline'; reason: string }) =>
      (a.kind === 'accept' ? await api.post<{ quote: CustomerQuote }>(`${base}/accept`, { name: a.name, confirm: true }) : await api.post<{ quote: CustomerQuote }>(`${base}/decline`, { reason: a.reason })).data.quote,
    onSuccess: (quote) => qc.setQueryData(key, quote),
  });

  return (
    <div className="min-h-screen bg-canvas px-4 pt-24 pb-16 sm:pt-28 sm:pb-24 lg:pt-36">
      <div className="mx-auto max-w-4xl space-y-5">
        {q.isLoading ? (
          <div className="grid min-h-[40vh] place-items-center text-primary" role="status" aria-label={t('quotePublic.loading')}>
            <Spinner className="size-8 border-[3px]" />
          </div>
        ) : q.error || !q.data ? (
          <div className="card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
            <Lost className="w-44" />
            <h1 className="mt-5 font-display text-xl font-semibold text-ink">{t('quotePublic.invalidTitle')}</h1>
            <p className="mt-1 max-w-md text-sm text-muted">{t('quotePublic.invalidText')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="eyebrow inline-flex items-center gap-1.5">
                <FileText className="size-4" aria-hidden /> {t('quotePublic.eyebrow')} {q.data.number}
              </span>
              <span className="text-xs text-muted">{t('quotePublic.germanNote')}</span>
            </div>
            <QuoteRespond
              q={q.data}
              busy={act.isPending}
              error={act.error ? errText(act.error) : null}
              onAccept={(name) => act.mutate({ kind: 'accept', name })}
              onDecline={(reason) => act.mutate({ kind: 'decline', reason })}
            />
            <QuoteDocument q={q.data} pdfHref={`/api${base}/pdf`} />
          </>
        )}
      </div>
    </div>
  );
}
