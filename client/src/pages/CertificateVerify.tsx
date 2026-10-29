import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, SearchX, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCourse } from '@/i18n/pagesCourse';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';

registerCopy(pagesCourse);

interface Verified {
  valid: true;
  initials: string;
  course: L10n | null;
  issuedAt: string;
}

/**
 * Public /certificate/:code: confirms a course certificate (QR code on the PDF). Shows only the holder's
 * initials, the course and the date — never the name, account or certificate number.
 */
export default function CertificateVerify() {
  const { code = '' } = useParams();
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const normalised = code.toUpperCase();
  const valid = /^[A-Z2-9]{12}$/.test(normalised);
  const q = useQuery({
    queryKey: ['certificate-verify', normalised],
    enabled: valid,
    retry: false,
    queryFn: async () => (await api.get<Verified>(`/certificates/${normalised}`)).data,
  });
  usePageTitle(t('certVerify.title'));

  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
      <div className="container-x">
        <div className="card mx-auto max-w-lg rounded-3xl p-6 sm:p-10">
          <p className="type-overline inline-flex items-center gap-2 text-muted">
            <ShieldCheck className="size-4" aria-hidden />
            {t('certVerify.kicker')}
          </p>
          <h1 className="type-page-title mt-2 text-ink">{t('certVerify.title')}</h1>
          {valid && q.isLoading ? (
            <p className="mt-8 flex items-center gap-3 text-muted" role="status">
              <Spinner className="size-5" />
              {t('certVerify.loading')}
            </p>
          ) : !valid || !q.data ? (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-danger-border bg-danger-bg p-4 text-danger-fg" role="alert">
              <SearchX className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">{t('certVerify.invalid')}</p>
                <p className="mt-1 text-sm">{t('certVerify.invalidText')}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-6 flex items-center gap-2 rounded-2xl border border-success-border bg-success-bg p-4 font-semibold text-success-fg" role="status">
                <BadgeCheck className="size-5 shrink-0" aria-hidden />
                {t('certVerify.valid')}
              </p>
              <dl className="mt-5 divide-y divide-line rounded-2xl border border-line">
                <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <dt className="text-sm text-muted">{t('certVerify.holder')}</dt>
                  <dd className="font-semibold text-ink">{q.data.initials}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <dt className="text-sm text-muted">{t('certVerify.course')}</dt>
                  <dd className="font-semibold text-ink">{tr(q.data.course)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 px-4 py-3">
                  <dt className="text-sm text-muted">{t('certVerify.date')}</dt>
                  <dd className="font-semibold text-ink">{date(q.data.issuedAt, { dateStyle: 'long' })}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">{t('certVerify.privacy')}</p>
            </>
          )}
          <Link to="/" className={`${buttonClass({ variant: 'secondary' })} mt-6`}>
            {t('certVerify.home')}
          </Link>
        </div>
      </div>
    </section>
  );
}
