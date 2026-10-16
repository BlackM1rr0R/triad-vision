import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, ChevronRight, FileSignature, PenLine } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesSign } from '@/i18n/pagesSign';
import { Spinner } from '@/components/ui/Spinner';
import { InvalidLink, SigningFlow, SigningSkeleton } from './SigningFlow';
import { STATUS_TONE, type MySignatureItem, type SigningView } from './api';

registerCopy(pagesSign);

export const mySignaturesKey = (caseId?: string) => ['esign', 'my', caseId ?? 'all'] as const;

export const useMySignatures = (opts: { caseId?: string; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: mySignaturesKey(opts.caseId),
    queryFn: async () => (await api.get<{ items: MySignatureItem[] }>('/signatures/my', { params: opts.caseId ? { caseId: opts.caseId } : {} })).data.items,
    enabled: opts.enabled ?? true,
    staleTime: 30_000,
  });

/** "Documents to sign" (candidate) / "Contracts to sign" (employer) / "Waiting for your signature" (staff). */
export const MySignaturesList = ({ linkBase, title, compact = false }: { linkBase: string; title?: string; compact?: boolean }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { data, isLoading } = useMySignatures();
  const items = data ?? [];
  const shown = compact ? items.filter((i) => i.myTurn) : items;
  if (compact && !shown.length) return null;

  return (
    <section className={clsx(compact ? 'rounded-xl border border-line bg-white p-4 sm:p-5' : 'card card-pad')} aria-labelledby="esign-my">
      <h2 id="esign-my" className="flex items-center gap-2 font-sans text-base font-semibold text-navy-900">
        <FileSignature className="size-4 text-brand-600" aria-hidden />
        {title ?? t('esign.portal.title')}
      </h2>
      {!compact && <p className="mt-1 text-sm text-muted">{t('esign.portal.subtitle')}</p>}
      {isLoading ? (
        <div className="grid min-h-24 place-items-center text-brand-600">
          <Spinner className="size-6" />
        </div>
      ) : !shown.length ? (
        <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('esign.portal.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {shown.map((i) => {
            const done = i.signers.filter((s) => s.status === 'SIGNED').length;
            return (
              <li key={i.signerId}>
                <Link to={`${linkBase}/${i.signerId}`} className="group flex items-center gap-3 py-3 transition hover:text-brand-700">
                  <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', i.myTurn ? 'bg-brand-600 text-white' : 'bg-surface text-muted')}>
                    <PenLine className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy-900 group-hover:text-brand-700">{i.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span className={clsx('badge', STATUS_TONE[i.status])}>{t(`esign.status.${i.status}`)}</span>
                      <span>{t('esign.portal.progress', { done, total: i.signers.length })}</span>
                      {i.case && <span>{i.case.number}</span>}
                      {i.status === 'SENT' && i.expiresAt && <span>{t('esign.sign.until', { date: date(i.expiresAt) })}</span>}
                    </p>
                  </div>
                  {i.myTurn ? (
                    <span className="btn-primary btn-sm hidden sm:inline-flex">{t('esign.portal.signNow')}</span>
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/** Signing from the portal: /…/:signerId (no email code; the login is the identity check). */
export const PortalSign = ({ backTo }: { backTo: string }) => {
  const { t } = useTranslation();
  const { signerId = '' } = useParams();
  const qc = useQueryClient();
  const base = `/signatures/my/${signerId}`;
  const { data, isLoading, error } = useQuery({
    queryKey: ['esign', 'portal', signerId],
    queryFn: async () => (await api.get<SigningView>(base)).data,
    enabled: !!signerId,
  });
  const [view, setView] = useState<SigningView | null>(null);
  useEffect(() => {
    if (data) setView(data);
  }, [data]);

  return (
    <div className="space-y-4">
      <Link to={backTo} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-navy-900">
        <ArrowLeft className="size-4" aria-hidden /> {t('esign.portal.back')}
      </Link>
      {isLoading ? (
        <SigningSkeleton />
      ) : error || !view ? (
        <InvalidLink />
      ) : (
        <SigningFlow
          view={view}
          base={base}
          onChange={(v) => {
            setView(v);
            void qc.invalidateQueries({ queryKey: ['esign', 'my'] });
          }}
        />
      )}
    </div>
  );
};
