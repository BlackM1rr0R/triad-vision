import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertCircle, ArrowLeft, CheckCircle2, CircleDashed, Clock3, FileText, History, Info, Upload, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { day } from '@/components/agents/format';
import { portalError, type DocState, type PartnerCaseDetail, type PartnerRequirement } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section, StatusPill, StepBar } from '@/components/partnerPortal/ui';
import { optimizeImage } from '@/lib/imageCompress';

const STATE_ICON: Record<DocState, { icon: typeof CheckCircle2; tone: string }> = {
  MISSING: { icon: CircleDashed, tone: 'text-muted' },
  UPLOADED: { icon: Clock3, tone: 'text-sky-700' },
  ACCEPTED: { icon: CheckCircle2, tone: 'text-emerald-700' },
  REJECTED: { icon: XCircle, tone: 'text-red-700' },
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium break-words text-ink">{value || '—'}</dd>
  </div>
);

const RequirementRow = ({ caseId, r }: { caseId: string; r: PartnerRequirement }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('requirementId', r.id);
      fd.append('file', await optimizeImage(file));
      return (await api.post(`/partner/cases/${caseId}/documents`, fd)).data;
    },
    onSuccess: async () => {
      toast.success(t('partnerPortal.detail.uploaded'));
      await qc.invalidateQueries({ queryKey: ['partner-portal'] });
    },
    onError: (err) => toast.error(portalError(err)),
  });
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) upload.mutate(f);
  };
  const { icon: Icon, tone } = STATE_ICON[r.state];
  return (
    <li className="py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Icon className={clsx('mt-0.5 size-5 shrink-0', tone)} aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-ink">
              {tr(r.title)}
              {!r.required && <span className="ml-1.5 text-xs font-normal text-muted">({t('partnerPortal.detail.optional')})</span>}
            </p>
            <p className={clsx('text-xs font-semibold', tone)}>{t(`partnerPortal.detail.state.${r.state}`)}</p>
            {r.rejectionReason && (
              <p className="mt-1 flex items-start gap-1 text-xs text-red-800">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden /> {t('partnerPortal.detail.reason', { reason: r.rejectionReason })}
              </p>
            )}
            {r.myUploads.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {r.myUploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-1.5 text-xs text-muted">
                    <FileText className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{u.name}</span> · {day(u.createdAt)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {r.canUpload && (
          <>
            <input ref={input} type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={onPick} tabIndex={-1} aria-hidden />
            <button type="button" className="btn-secondary btn-sm" disabled={upload.isPending} onClick={() => input.current?.click()}>
              {upload.isPending ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" aria-hidden />} {upload.isPending ? t('partnerPortal.detail.uploading') : t('partnerPortal.detail.upload')}
            </button>
          </>
        )}
      </div>
    </li>
  );
};

export default function PartnerClientDetailPage() {
  const { t } = useTranslation();
  const { tr, dateTime } = useL10n();
  const { id = '' } = useParams();
  const [showAll, setShowAll] = useState(false);
  const q = useQuery({
    queryKey: ['partner-portal', 'case', id],
    queryFn: async () => (await api.get<{ case: PartnerCaseDetail }>(`/partner/cases/${id}`)).data.case,
    retry: false,
  });

  const back = (
    <Link to="/partner/clients" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> {t('partnerPortal.detail.back')}
    </Link>
  );
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data)
    return (
      <>
        {back}
        <ErrorRetry onRetry={() => q.refetch()} />
      </>
    );
  const c = q.data;
  const stages = (['INITIAL', 'EMBASSY'] as const).filter((s) => c.requirements.some((r) => r.stage === s));
  const timeline = showAll ? c.timeline : c.timeline.slice(0, 12);

  return (
    <>
      {back}
      <Section
        title={`${c.client.firstName} ${c.client.lastName}`}
        actions={<StatusPill status={c.status} />}
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t('partnerPortal.detail.number')} value={c.number} />
          <Fact label={t('partnerPortal.clients.passport')} value={c.client.passport ?? ''} />
          <Fact
            label={t('partnerPortal.detail.visa')}
            value={`${t(`partnerPortal.types.${c.visaType}`, { defaultValue: c.visaType })}${c.visaCategory ? ` · ${tr(c.visaCategory.title)} (${c.visaCategory.visaLabel})` : ''}`}
          />
          <Fact label={t('partnerPortal.detail.created')} value={day(c.createdAt)} />
          {c.appointmentAt && <Fact label={t('partnerPortal.detail.appointment')} value={dateTime(c.appointmentAt)} />}
          {c.appointmentAt && c.appointmentPlace && <Fact label={t('partnerPortal.detail.place')} value={c.appointmentPlace} />}
          {c.decisionAt && <Fact label={t('partnerPortal.detail.decision')} value={day(c.decisionAt)} />}
          {c.visaValidFrom && c.visaValidTo && <Fact label={t('partnerPortal.detail.visaValid')} value={`${day(c.visaValidFrom)} – ${day(c.visaValidTo)}`} />}
        </dl>
        <div className="mt-5 max-w-md">
          <StepBar step={c.step} status={c.status} />
        </div>
        {c.nextAction !== 'NONE' && (
          <p className={clsx('mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium', c.nextAction === 'UPLOAD_DOCUMENTS' ? 'bg-amber-50 text-amber-900' : 'bg-surface text-ink/80')}>
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {t('partnerPortal.clients.next')}: {t(`partnerPortal.nextAction.${c.nextAction}`)}
              {c.missingDocuments > 0 && ` · ${t('partnerPortal.clients.missing', { count: c.missingDocuments })}`}
            </span>
          </p>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={t('partnerPortal.detail.documents')} icon={FileText}>
          {stages.length === 0 ? (
            <p className="text-sm text-muted">{t('partnerPortal.detail.documentsEmpty')}</p>
          ) : (
            <div className="space-y-5">
              <p className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs text-muted">
                <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                {c.uploadStage ? t('partnerPortal.detail.uploadHint') : t('partnerPortal.detail.uploadClosed')}
              </p>
              {stages.map((s) => (
                <div key={s}>
                  <h3 className="text-xs font-bold tracking-wide text-muted uppercase">{t(`partnerPortal.detail.stage.${s}`)}</h3>
                  <ul className="divide-y divide-line">
                    {c.requirements
                      .filter((r) => r.stage === s)
                      .map((r) => (
                        <RequirementRow key={r.id} caseId={c.id} r={r} />
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={t('partnerPortal.detail.timeline')} icon={History}>
          {c.timeline.length === 0 ? (
            <p className="text-sm text-muted">{t('partnerPortal.detail.timelineEmpty')}</p>
          ) : (
            <>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {timeline.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-brand-500" aria-hidden />
                    <p className="text-sm font-medium text-ink">
                      {e.toStatus ? t(`partnerPortal.status.${e.toStatus}`) : t(`partnerPortal.event.${e.type}`, { defaultValue: t('partnerPortal.event.other') })}
                    </p>
                    <p className="text-xs text-muted">{dateTime(e.createdAt)}</p>
                  </li>
                ))}
              </ol>
              {c.timeline.length > 12 && !showAll && (
                <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => setShowAll(true)}>
                  +{c.timeline.length - 12}
                </button>
              )}
            </>
          )}
        </Section>
      </div>
    </>
  );
}
