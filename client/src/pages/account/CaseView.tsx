import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowDown, ArrowLeft, Ban, Briefcase, Hourglass, MessageSquareWarning, Sparkles, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { CLIENT_ACTION, STAFF_ACTION } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { PageLoader } from '@/components/ui/Spinner';
import { Reveal } from '@/components/motion';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { CaseStepper } from '@/components/portal/CaseStepper';
import { CaseDocuments, UPLOAD_STAGE } from '@/components/portal/CaseDocuments';
import { CaseContract } from '@/components/portal/CaseContract';
import { CaseMessages } from '@/components/portal/CaseMessages';
import { AppointmentCard, CaseTimeline, DecisionCard, OtherFiles } from '@/components/portal/CaseCards';
import { useErrorMessage } from '@/components/portal/useApiError';
import { OVERVIEW_KEY, useHashScroll } from '@/components/portal/useOverview';

const CurrentStepPanel = ({ data }: { data: CaseDetail }) => {
  const { t } = useTranslation();
  const clientTurn = CLIENT_ACTION.includes(data.status);
  const staffTurn = STAFF_ACTION.includes(data.status);
  const uploadStage = UPLOAD_STAGE[data.status];
  const actionHref = uploadStage ? `#docs-${uploadStage.toLowerCase()}` : data.status === 'CONTRACT_SENT' ? '#contract' : null;
  const actionLabel = uploadStage ? t('portal.docs.upload') : t('portal.contract.sign');

  return (
    <motion.section
      key={data.status}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        'card relative overflow-hidden p-5 sm:p-6',
        clientTurn && 'border-brand-400/40 ring-4 ring-brand-500/10',
      )}
      aria-labelledby="current-step-title"
    >
      <span
        className={clsx(
          'absolute inset-y-0 left-0 w-1.5',
          clientTurn ? 'bg-gradient-to-b from-brand-400 to-brand-700' : data.status === 'APPROVED' ? 'bg-success' : data.status === 'REJECTED' ? 'bg-danger' : data.status === 'CANCELLED' ? 'bg-slate-300' : 'bg-sky-400',
        )}
        aria-hidden
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span
          className={clsx(
            'grid size-12 shrink-0 place-items-center rounded-xl',
            clientTurn ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : data.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' : 'bg-sky-100 text-sky-700',
          )}
        >
          {clientTurn ? <Sparkles className="size-6" aria-hidden /> : data.status === 'CANCELLED' ? <Ban className="size-6" aria-hidden /> : <Hourglass className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{t('portal.currentStep')}</span>
            {clientTurn && (
              <span className="badge bg-amber-100 text-amber-800">
                <span className="size-2 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]" aria-hidden />
                {t('portal.actionRequired')}
              </span>
            )}
            {staffTurn && <span className="badge bg-sky-100 text-sky-800">{t('portal.waiting')}</span>}
          </div>
          <h2 id="current-step-title" className="mt-2 text-xl font-extrabold break-words text-navy-900 sm:text-[1.7rem]">
            {t(`portal.status.${data.status}`)}
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted">{t(`portal.statusHelp.${data.status}`)}</p>
          {staffTurn && <p className="mt-2 text-sm font-medium text-sky-700">{t('portal.waitingUs')}</p>}

          {data.status === 'CANCELLED' && data.cancelReason && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-line text-slate-700">{data.cancelReason}</p>
          )}

          {data.staffNote && (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">{t('portal.staffNote')}</p>
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-amber-950">{data.staffNote}</p>
              </div>
            </div>
          )}

          {clientTurn && actionHref && (
            <a href={actionHref} className="btn-primary mt-5 w-full sm:w-auto">
              {actionLabel}
              <ArrowDown className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </motion.section>
  );
};

export default function CaseView() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();

  const { data, isLoading, error } = useQuery({
    queryKey: ['case', id],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${id}`)).data.case,
    refetchInterval: 30_000,
    enabled: !!id,
  });

  const refresh = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['case', id] }),
        qc.invalidateQueries({ queryKey: ['cases'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
        qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
      ]),
    [qc, id],
  );

  useHashScroll(!!data);

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-navy-900">{error ? errorMessage(error) : t('common.error')}</p>
        <Link to="/account" className="btn-primary mt-6">
          <ArrowLeft className="size-4" aria-hidden />
          {t('portal.myCases')}
        </Link>
      </div>
    );
  }

  const contractFirst = data.status === 'CONTRACT_SENT' || data.status === 'CONTRACT_SIGNED';
  const embassyFirst = data.status === 'EMBASSY_DOCUMENTS' || data.status === 'EMBASSY_REVIEW';
  const contract = data.contract ? <CaseContract key="contract" data={data} onChanged={refresh} /> : null;
  const initialDocs = <CaseDocuments key="initial" data={data} stage="INITIAL" onChanged={refresh} />;
  const embassyDocs = <CaseDocuments key="embassy" data={data} stage="EMBASSY" onChanged={refresh} />;
  const mainBlocks = contractFirst
    ? [contract, initialDocs, embassyDocs]
    : embassyFirst
      ? [embassyDocs, contract, initialDocs]
      : data.status === 'DOCUMENTS_PENDING' || data.status === 'DOCUMENTS_REVIEW'
        ? [initialDocs, contract, embassyDocs]
        : [embassyDocs, contract, initialDocs];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <Reveal y={16}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link to="/account" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
              <ArrowLeft className="size-4" aria-hidden />
              {t('portal.myCases')}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-extrabold break-words text-navy-900 sm:text-3xl">
                <span className="text-muted">{t('portal.caseNo')}</span> {data.number}
              </h1>
              <StatusBadge status={data.status} className="text-sm" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Briefcase className="size-4 shrink-0" aria-hidden />
                <span className="font-medium text-navy-900">{data.profession}</span>
              </span>
              {data.visaCategory && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="badge shrink-0 whitespace-nowrap bg-navy-900 text-white">{data.visaCategory.visaLabel}</span>
                  {tr(data.visaCategory.title)}
                </span>
              )}
              {data.assignedStaff && (
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-4" aria-hidden />
                  {t('portal.manager')}:{' '}
                  <span className="font-medium text-navy-900">
                    {data.assignedStaff.firstName} {data.assignedStaff.lastName}
                  </span>
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-muted sm:shrink-0 sm:text-right">
            {t('portal.created')}: {date(data.createdAt)} · {t('portal.updated')}: {date(data.updatedAt)}
          </p>
        </div>
      </Reveal>

      {/* Stepper */}
      <section className="card p-5 sm:p-6 lg:p-8" aria-label={t('portal.currentStep')}>
        <CaseStepper status={data.status} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <CurrentStepPanel data={data} />
          <DecisionCard data={data} />
          <AppointmentCard data={data} />
          {mainBlocks}
          <OtherFiles data={data} />
        </div>
        <aside className="min-w-0 space-y-6">
          <CaseMessages data={data} onChanged={refresh} />
          <CaseTimeline data={data} />
        </aside>
      </div>
    </div>
  );
}
