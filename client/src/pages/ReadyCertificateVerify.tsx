import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ban, BadgeCheck, SearchX, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';

registerCopy(pagesGermanyReady);

interface Verified {
  valid: true;
  number: string;
  holder: string;
  date: string;
  level: 'BRONZE' | 'SILVER' | 'GOLD';
  activities: number;
}

type Outcome = { kind: 'valid'; data: Verified } | { kind: 'revoked' } | { kind: 'invalid' };

/**
 * Public /ready-certificate/:code (QR code on the "Germany Ready" practice certificate). Shows ONLY the number, the
 * holder's initials, the date, the level and the number of completed activities; revoked → a notice without data.
 */
export default function ReadyCertificateVerify() {
  const { code = '' } = useParams();
  const { t, i18n } = useTranslation();
  const v = (k: string) => String(t(`readyVerify.${k}`));
  const normalised = code.toUpperCase();
  const wellFormed = /^[A-Z2-9]{12}$/.test(normalised);
  const q = useQuery({
    queryKey: ['ready-certificate-verify', normalised],
    enabled: wellFormed,
    retry: false,
    queryFn: async (): Promise<Outcome> => {
      try {
        return { kind: 'valid', data: (await api.get<Verified>(`/ready-certificates/${normalised}`)).data };
      } catch (err) {
        return (err as { response?: { status?: number } }).response?.status === 410 ? { kind: 'revoked' } : { kind: 'invalid' };
      }
    },
  });
  usePageTitle(v('title'));
  const outcome: Outcome | null = !wellFormed ? { kind: 'invalid' } : (q.data ?? null);
  const date = (iso: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const row = (label: string, value: string) => (
    <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );

  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
      <div className="container-x">
        <div className="card mx-auto max-w-lg rounded-3xl p-6 sm:p-10">
          <p className="type-overline inline-flex items-center gap-2 text-muted">
            <ShieldCheck className="size-4" aria-hidden />
            {v('kicker')}
          </p>
          <h1 className="type-page-title mt-2 text-ink">{v('title')}</h1>
          {!outcome ? (
            <p className="mt-8 flex items-center gap-3 text-muted" role="status">
              <Spinner className="size-5" />
              {v('loading')}
            </p>
          ) : outcome.kind === 'valid' ? (
            <>
              <p className="mt-6 flex items-center gap-2 rounded-2xl border border-success-border bg-success-bg p-4 font-semibold text-success-fg" role="status">
                <BadgeCheck className="size-5 shrink-0" aria-hidden />
                {v('valid')}
              </p>
              <dl className="mt-5 divide-y divide-line rounded-2xl border border-line">
                {row(v('number'), outcome.data.number)}
                {row(v('holder'), outcome.data.holder)}
                {row(v('date'), date(outcome.data.date))}
                {row(v('level'), String(t(`gready.level.${outcome.data.level}`)))}
                {row(v('activities'), String(outcome.data.activities))}
              </dl>
              <p className="mt-3 text-xs text-muted">{v('note')}</p>
            </>
          ) : (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger-fg" role="alert">
              {outcome.kind === 'revoked' ? <Ban className="mt-0.5 size-5 shrink-0" aria-hidden /> : <SearchX className="mt-0.5 size-5 shrink-0" aria-hidden />}
              <div>
                <p className="font-semibold">{outcome.kind === 'revoked' ? v('revoked') : v('invalid')}</p>
                <p className="mt-1 text-sm">{outcome.kind === 'revoked' ? v('revokedText') : v('invalidText')}</p>
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
