import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BadgeCheck, Clock, Download, FileSignature, Lock, PenTool } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesCaseContracts } from '@/i18n/pagesCaseContracts';
import type { CaseDetail } from '@/lib/types';
import { clientKey, type ClientStep, type StepState } from './api';

registerCopy(pagesCaseContracts);

const TONE: Record<StepState, string> = {
  NOT_SENT: 'bg-sunken text-muted',
  TRIAD_TO_SIGN: 'bg-sunken text-ink',
  CLIENT_TO_SIGN: 'bg-warning-bg text-warning-fg',
  SIGNED: 'bg-primary/10 text-link',
  APPROVED: 'bg-success-bg text-success-fg',
  DECLINED: 'bg-danger-bg text-danger-fg',
  EXPIRED: 'bg-danger-bg text-danger-fg',
  CANCELLED: 'bg-sunken text-muted',
};

const ICON: Record<StepState, typeof Clock> = {
  NOT_SENT: Lock,
  TRIAD_TO_SIGN: Clock,
  CLIENT_TO_SIGN: PenTool,
  SIGNED: Clock,
  APPROVED: BadgeCheck,
  DECLINED: FileSignature,
  EXPIRED: Clock,
  CANCELLED: FileSignature,
};

const Row = ({ s }: { s: ClientStep }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const Icon = ICON[s.state];
  const name = t(`caseContracts.steps.${s.step}.name`);
  return (
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:p-6">
      <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', TONE[s.state])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">
          {t(`caseContracts.steps.${s.step}.number`)}. {name}
        </p>
        <p className="text-sm text-muted">
          {s.step === 'WORK' && s.state === 'NOT_SENT' ? t('caseContracts.portal.workLater') : t(`caseContracts.portal.states.${s.state}`)}
          {s.approvedAt ? ` · ${date(s.approvedAt)}` : s.clientSignedAt ? ` · ${date(s.clientSignedAt)}` : ''}
        </p>
      </div>
      {s.myTurn && s.signerId && (
        <Link to={`/account/signatures/${s.signerId}`} className="btn-primary btn-sm w-full sm:w-auto">
          <PenTool className="size-4" aria-hidden />
          {t('caseContracts.portal.sign')}
        </Link>
      )}
      {s.signedDocumentId && (
        <a href={fileUrl(s.signedDocumentId, true)} className="btn-ghost btn-sm w-full sm:w-auto">
          <Download className="size-4" aria-hidden />
          {t('caseContracts.portal.download')}
        </a>
      )}
    </li>
  );
};

/**
 * Client portal: both contracts with their state (waiting for Triad Vision / waiting for you / signed / approved).
 * Cases without a two-step contract keep the previous contract card (`fallback`).
 */
export const ClientCaseContracts = ({ data, fallback }: { data: CaseDetail; fallback?: ReactNode }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: clientKey(data.id),
    queryFn: async () => (await api.get<{ steps: ClientStep[] }>(`/account/case-contracts/cases/${data.id}`)).data.steps,
  });
  const steps = q.data ?? [];
  if (!steps.some((s) => s.state !== 'NOT_SENT')) return <>{fallback ?? null}</>;
  return (
    <section id="contract" className="card scroll-mt-28 overflow-hidden lg:scroll-mt-36" aria-labelledby="case-contracts-title">
      <div className="flex items-center gap-4 border-b border-line p-5 sm:p-6">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl chip-soft">
          <FileSignature className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="case-contracts-title" className="type-card-title text-xl">
            {t('caseContracts.portal.title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t('caseContracts.portal.intro')}</p>
        </div>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s) => (
          <Row key={s.step} s={s} />
        ))}
      </ol>
    </section>
  );
};

export default ClientCaseContracts;
