import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, SearchX, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesStaffTools } from '@/i18n/pagesStaffTools';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';

registerCopy(pagesStaffTools);

// GET /api/originals/verify/:code (server lib/originals/receipts.ts verifyReceipt)
interface Verified {
  valid: true;
  number: string;
  date: string;
  documents: number;
  status: 'HANDED_OVER' | 'GIVEN_OUT' | 'RETURNED';
  staff: string | null;
  client: string;
}

/**
 * Public /originals/verify/:code — the QR code on a hand-over act (Übergabeprotokoll). Shows ONLY the receipt
 * number, date, number of documents, the kind of hand-over, the staff member's first name and the client's
 * initials; never passport numbers, full names or document titles.
 */
export default function OriginalsVerify() {
  const { code = '' } = useParams();
  const { t, i18n } = useTranslation();
  const v = (k: string) => String(t(`staffTools.verify.${k}`));
  const normalised = code.toUpperCase();
  const wellFormed = /^[A-Z2-9]{16}$/.test(normalised);
  const q = useQuery({
    queryKey: ['originals-verify', normalised],
    enabled: wellFormed,
    retry: false,
    queryFn: async (): Promise<Verified | null> => {
      try {
        return (await api.get<Verified>(`/originals/verify/${normalised}`)).data;
      } catch {
        return null;
      }
    },
  });
  usePageTitle(v('title'));
  const loading = wellFormed && q.isLoading;
  const data = wellFormed ? (q.data ?? null) : null;
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Baku' }).format(new Date(iso));
  const rows: [string, string][] = data
    ? [
        [v('number'), data.number],
        [v('date'), fmt(data.date)],
        [v('documents'), String(data.documents)],
        [v('status'), v(`status${data.status}`)],
        ...(data.staff ? ([[v('staff'), data.staff]] as [string, string][]) : []),
        [v('client'), data.client],
      ]
    : [];

  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
      <div className="container-x">
        <div className="card mx-auto max-w-lg rounded-3xl p-6 sm:p-10">
          <p className="type-overline inline-flex items-center gap-2 text-muted">
            <ShieldCheck className="size-4" aria-hidden />
            {v('kicker')}
          </p>
          <h1 className="type-page-title mt-2 text-ink">{v('title')}</h1>
          {loading ? (
            <p className="mt-8 flex items-center gap-3 text-muted" role="status">
              <Spinner className="size-5" />
              {v('loading')}
            </p>
          ) : data ? (
            <>
              <p className="mt-6 flex items-center gap-2 rounded-2xl border border-success-border bg-success-bg p-4 font-semibold text-success-fg" role="status">
                <BadgeCheck className="size-5 shrink-0" aria-hidden />
                {v('valid')}
              </p>
              <dl className="mt-5 divide-y divide-line rounded-2xl border border-line">
                {rows.map(([k, val]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-2 px-4 py-3">
                    <dt className="text-sm text-muted">{k}</dt>
                    <dd className="font-semibold break-all text-ink">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted">{v('privacy')}</p>
            </>
          ) : (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger-fg" role="alert">
              <SearchX className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{v('invalid')}</p>
                <p className="mt-1 text-sm">{v('invalidText')}</p>
              </div>
            </div>
          )}
          <Link to="/" className={`${buttonClass({ variant: 'secondary' })} mt-6`}>
            {v('home')}
          </Link>
        </div>
      </div>
    </section>
  );
}
