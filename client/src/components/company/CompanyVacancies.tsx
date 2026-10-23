import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Briefcase, ExternalLink, Info, Lock, Pencil, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { fmtDate } from '@/components/admin/labels';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { VACANCY_STATUS_TONE, type Company, type VacancyRow } from '@/components/jobs/types';
import { VacancyForm, formFromVacancy, payloadFromForm } from './VacancyForm';
import { reportAiSaved } from '@/components/aiEmployer/shared';
import { Empty, Loading, Section } from './shared';

type Row = VacancyRow & { candidates: Partial<Record<string, number>> };

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['company-vacancies'] });
    void qc.invalidateQueries({ queryKey: ['company-vacancy'] });
    void qc.invalidateQueries({ queryKey: ['company-dashboard'] });
  };
};

/** Submit / close / delete actions for one vacancy (list rows and the editor). */
const useVacancyActions = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const action = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: 'submit' | 'close' | 'delete' }) =>
      kind === 'delete' ? api.delete(`/company/vacancies/${id}`) : api.post(`/company/vacancies/${id}/${kind}`),
    onSuccess: (_r, { kind }) => {
      toast.success(t(`jobsArea.portal.vacancies.done.${kind}`));
      invalidate();
    },
    onError: toastJobsError,
  });
  return action;
};

export const CompanyVacancies = ({ company }: { company: Company }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const action = useVacancyActions();
  const [confirm, setConfirm] = useState<{ id: string; kind: 'close' | 'delete' } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['company-vacancies'],
    queryFn: async () => (await api.get<{ items: Row[] }>('/company/vacancies')).data.items,
  });
  if (isLoading) return <Loading />;
  const items = data ?? [];
  const canSubmit = company.status === 'ACTIVE';

  return (
    <Section
      title={t('jobsArea.portal.vacancies.title')}
      icon={Briefcase}
      actions={
        <Link to="/company/vacancies/new" className="btn-primary btn-sm">
          <Plus className="size-3.5" /> {t('jobsArea.portal.vacancies.new')}
        </Link>
      }
    >
      {items.length === 0 ? (
        <Empty icon={Briefcase} title={t('jobsArea.portal.vacancies.empty')} text={t('jobsArea.portal.vacancies.emptyText')}>
          <Link to="/company/vacancies/new" className="btn-primary btn-sm">
            <Plus className="size-3.5" /> {t('jobsArea.portal.vacancies.new')}
          </Link>
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((v) => {
            const proposed = Object.values(v.candidates).reduce<number>((a, b) => a + (b ?? 0), 0);
            return (
              <li key={v.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/company/vacancies/${v.id}`} className="font-semibold break-words text-navy-900 hover:text-brand-700">
                      {tr(v.title)}
                    </Link>
                    <span className={clsx('badge', VACANCY_STATUS_TONE[v.status])}>{L.vacancyStatus(v.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {[v.city, L.employmentType(v.employmentType), L.salary(v.salaryMin, v.salaryMax), t('jobsArea.common.positions', { count: v.positions })].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {t(`jobsArea.portal.vacancies.statusHint.${v.status}`)}
                    {v.publishedAt && ` · ${t('jobsArea.common.postedOn', { date: fmtDate(v.publishedAt) })}`}
                    {proposed > 0 && (
                      <Link to={`/company/candidates?vacancyId=${v.id}`} className="ml-1 font-semibold text-brand-600 hover:underline">
                        · {t('jobsArea.portal.vacancies.candidates', { count: proposed })}
                      </Link>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {v.status === 'OPEN' && (
                    <a href={`/jobs/${v.slug}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                      <ExternalLink className="size-3.5" /> {t('jobsArea.portal.vacancies.viewPublic')}
                    </a>
                  )}
                  {v.status !== 'CLOSED' && (
                    <Link to={`/company/vacancies/${v.id}`} className="btn-secondary btn-sm">
                      <Pencil className="size-3.5" /> {t('jobsArea.common.edit')}
                    </Link>
                  )}
                  {v.status === 'DRAFT' && (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={!canSubmit || action.isPending}
                      title={canSubmit ? undefined : t('jobsArea.portal.vacancies.needApproval')}
                      onClick={() => action.mutate({ id: v.id, kind: 'submit' })}
                    >
                      {canSubmit ? <Send className="size-3.5" /> : <Lock className="size-3.5" />} {t('jobsArea.portal.vacancies.submit')}
                    </button>
                  )}
                  {v.status === 'DRAFT' && (
                    <button type="button" className="btn-secondary btn-sm text-danger" onClick={() => setConfirm({ id: v.id, kind: 'delete' })} aria-label={t('jobsArea.common.delete')}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                  {(v.status === 'OPEN' || v.status === 'PENDING') && (
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirm({ id: v.id, kind: 'close' })}>
                      <XCircle className="size-3.5" /> {t('jobsArea.portal.vacancies.close')}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!canSubmit && items.some((v) => v.status === 'DRAFT') && (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('jobsArea.portal.vacancies.needApproval')}
        </p>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'delete' ? t('jobsArea.portal.vacancies.deleteTitle') : t('jobsArea.portal.vacancies.closeTitle')}
        confirmLabel={confirm?.kind === 'delete' ? t('jobsArea.common.delete') : t('jobsArea.portal.vacancies.close')}
        danger
        busy={action.isPending}
        onConfirm={() => confirm && action.mutate(confirm, { onSettled: () => setConfirm(null) })}
        onClose={() => setConfirm(null)}
      >
        <p className="text-sm text-muted">{confirm?.kind === 'delete' ? t('jobsArea.portal.vacancies.deleteText') : t('jobsArea.portal.vacancies.closeText')}</p>
      </ConfirmDialog>
    </Section>
  );
};

export const CompanyVacancyEditor = ({ company }: { company: Company }) => {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useTranslation();
  const L = useJobLabels();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const action = useVacancyActions();
  const { data, isLoading } = useQuery({
    queryKey: ['company-vacancy', id],
    queryFn: async () => (await api.get<{ vacancy: VacancyRow }>(`/company/vacancies/${id}`)).data.vacancy,
    enabled: !isNew,
  });
  const save = useMutation({
    mutationFn: async ({ body }: { body: ReturnType<typeof payloadFromForm>; ai: string[] }) =>
      isNew
        ? (await api.post<{ vacancy: VacancyRow }>('/company/vacancies', body)).data.vacancy
        : (await api.patch<{ vacancy: VacancyRow }>(`/company/vacancies/${id}`, body)).data.vacancy,
    onSuccess: (v, { ai }) => {
      reportAiSaved('company', v.id, ai);
      toast.success(isNew ? t('jobsArea.portal.vacancies.created') : t('jobsArea.portal.vacancies.saved'));
      invalidate();
      if (isNew) navigate(`/company/vacancies/${v.id}`, { replace: true });
    },
    onError: toastJobsError,
  });

  if (!isNew && (isLoading || !data)) return <Loading />;
  const v = data ?? null;
  const locked = v?.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <Link to="/company/vacancies" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-navy-900">
        <ArrowLeft className="size-4" /> {t('jobsArea.portal.vacancies.back')}
      </Link>
      <Section
        title={isNew ? t('jobsArea.portal.vacancies.new') : t('jobsArea.portal.vacancies.editTitle')}
        icon={Briefcase}
        actions={
          v && (
            <>
              <span className={clsx('badge', VACANCY_STATUS_TONE[v.status])}>{L.vacancyStatus(v.status)}</span>
              {v.status === 'DRAFT' && (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={company.status !== 'ACTIVE' || action.isPending}
                  onClick={() => action.mutate({ id: v.id, kind: 'submit' })}
                >
                  {action.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('jobsArea.portal.vacancies.submit')}
                </button>
              )}
            </>
          )
        }
      >
        {v && <p className="mb-5 rounded-lg bg-surface px-3 py-2.5 text-xs text-ink/80">{t(`jobsArea.portal.vacancies.statusHint.${v.status}`)}</p>}
        {v?.status === 'OPEN' && (
          <p className="mb-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('jobsArea.portal.vacancies.editWarning')}
          </p>
        )}
        {company.status !== 'ACTIVE' && (
          <p className="mb-5 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('jobsArea.portal.vacancies.needApproval')}
          </p>
        )}
        {locked ? (
          <p className="text-sm text-muted">{t('jobsArea.portal.vacancies.statusHint.CLOSED')}</p>
        ) : (
          <VacancyForm
            key={v?.updatedAt ?? 'new'}
            initial={formFromVacancy(v)}
            ai="company"
            busy={save.isPending}
            submitLabel={isNew ? t('jobsArea.portal.vacancies.saveDraft') : t('jobsArea.common.save')}
            onSubmit={(f, ai) => save.mutate({ body: payloadFromForm(f, false), ai })}
          />
        )}
      </Section>
    </div>
  );
};
