import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Car, ClipboardList, GraduationCap, Languages, MapPin, Pencil, Plus, ShieldCheck, Timer, Users, XCircle } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRequests } from '@/i18n/pagesRequests';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { ScoreRing } from '@/components/jobs/MatchMeter';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE } from '@/components/jobs/types';
import { Empty, Loading, Section } from '@/components/company/shared';
import { RequestForm } from './RequestForm';
import { RequestProgressBar } from './RequestProgressBar';
import { REQUEST_STATUS_TONE, emptyForm, formFromRequest, payloadFromForm, type EmployerRequest, type EmployerRequestCandidate } from './types';

registerCopy(pagesRequests);

const KEY = ['company-requests'] as const;

const NotApproved = () => {
  const { t } = useTranslation();
  return (
    <Section title={t('requests.company.title')} icon={ClipboardList}>
      <Empty icon={ClipboardList} title={t('requests.company.notApproved')} />
    </Section>
  );
};

const StatusBadge = ({ status }: { status: EmployerRequest['status'] }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge', REQUEST_STATUS_TONE[status])}>{t(`requests.status.${status}`)}</span>;
};

/** Requirement chips of a request. */
const Requirements = ({ r }: { r: EmployerRequest }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const { tr } = useL10n();
  const chips = [
    r.city && { icon: MapPin, text: r.city },
    r.germanLevel && { icon: Languages, text: L.german(r.germanLevel) },
    r.drivingLicence && { icon: Car, text: `${t('requests.fields.drivingLicence')}: ${r.drivingLicence}` },
    r.minExperience != null && { icon: Timer, text: L.years(r.minExperience) },
    r.visaCategory && { icon: ShieldCheck, text: `${r.visaCategory.visaLabel} · ${tr(r.visaCategory.title)}` },
  ].filter(Boolean) as { icon: typeof MapPin; text: string }[];
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <li key={c.text} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink">
          <c.icon className="size-3.5 text-brand-600" aria-hidden /> {c.text}
        </li>
      ))}
    </ul>
  );
};

const RequestList = () => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<{ items: EmployerRequest[] }>('/company/requests')).data.items, retry: false });
  if (q.isLoading) return <Loading />;
  if (q.isError && errorCode(q.error) === 'COMPANY_NOT_APPROVED') return <NotApproved />;
  const items = q.data ?? [];
  return (
    <Section
      title={t('requests.company.title')}
      icon={ClipboardList}
      actions={
        <Link to="/company/requests/new" className="btn-primary btn-sm">
          <Plus className="size-4" aria-hidden /> {t('requests.company.new')}
        </Link>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-muted">{t('requests.company.subtitle')}</p>
      {items.length === 0 ? (
        <Empty icon={ClipboardList} title={t('requests.company.empty')} text={t('requests.company.emptyText')}>
          <Link to="/company/requests/new" className="btn-primary btn-sm">
            <Plus className="size-4" aria-hidden /> {t('requests.company.new')}
          </Link>
        </Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((r) => (
            <li key={r.id}>
              <Link to={`/company/requests/${r.id}`} className="block h-full rounded-2xl border border-line bg-card p-5 transition hover:border-brand-400/60 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-bold text-navy-900">{r.title}</p>
                    <p className="truncate text-sm text-muted">
                      {r.quantity} × {r.profession}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3">
                  <Requirements r={r} />
                </div>
                <div className="mt-4">
                  <RequestProgressBar progress={r.progress} />
                </div>
                <p className="mt-3 text-[11px] text-muted">{t('requests.company.createdAt', { date: fmtDate(r.createdAt) })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

const NewRequest = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (v: ReturnType<typeof payloadFromForm>) => (await api.post<{ request: EmployerRequest }>('/company/requests', v)).data.request,
    onSuccess: (r) => {
      toast.success(t('requests.company.created'));
      void qc.invalidateQueries({ queryKey: KEY });
      navigate(`/company/requests/${r.id}`);
    },
    onError: toastJobsError,
  });
  return (
    <Section title={t('requests.company.newTitle')} icon={Plus}>
      <RequestForm initial={emptyForm()} submitLabel={t('requests.company.create')} pending={m.isPending} onSubmit={(v) => m.mutate(payloadFromForm(v))} onCancel={() => navigate('/company/requests')} />
    </Section>
  );
};

const useRequest = (id: string) =>
  useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<{ request: EmployerRequest; candidates: EmployerRequestCandidate[] }>(`/company/requests/${id}`)).data,
    retry: false,
  });

const EditRequest = () => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useRequest(id);
  const m = useMutation({
    mutationFn: async (v: ReturnType<typeof payloadFromForm>) => (await api.patch(`/company/requests/${id}`, v)).data,
    onSuccess: () => {
      toast.success(t('requests.company.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      navigate(`/company/requests/${id}`);
    },
    onError: toastJobsError,
  });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Navigate to="/company/requests" replace />;
  if (q.data.request.status !== 'OPEN') return <Navigate to={`/company/requests/${id}`} replace />;
  return (
    <Section title={t('requests.company.editTitle')} icon={Pencil}>
      <RequestForm
        initial={formFromRequest(q.data.request)}
        submitLabel={t('requests.company.save')}
        pending={m.isPending}
        onSubmit={(v) => m.mutate(payloadFromForm(v))}
        onCancel={() => navigate(`/company/requests/${id}`)}
      />
    </Section>
  );
};

const CandidateCard = ({ item, vacancyId }: { item: EmployerRequestCandidate; vacancyId: string | null }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const c = item.candidate;
  return (
    <li className="flex min-w-0 flex-col rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start gap-3">
        {item.matchScore != null && <ScoreRing score={item.matchScore} size={52} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold text-navy-900">{c.name}</p>
          <p className="truncate text-sm text-muted">{c.profession ?? '—'}</p>
        </div>
        <span className={clsx('badge shrink-0', APPLICATION_STATUS_TONE[item.status])}>{L.appStatus(item.status)}</span>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-ink/80">
        {c.experienceYears != null && (
          <li className="flex items-center gap-1.5">
            <Timer className="size-3.5 text-brand-600" aria-hidden /> {L.years(c.experienceYears)}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <Languages className="size-3.5 text-brand-600" aria-hidden /> {L.german(c.germanLevel)}
        </li>
        {c.education && (
          <li className="flex items-center gap-1.5">
            <GraduationCap className="size-3.5 text-brand-600" aria-hidden /> {L.education(c.education)}
          </li>
        )}
        {c.drivingLicence && (
          <li className="flex items-center gap-1.5">
            <Car className="size-3.5 text-brand-600" aria-hidden /> {c.drivingLicence}
          </li>
        )}
      </ul>
      {['PROPOSED', 'INTERVIEW'].includes(item.status) && vacancyId && (
        <Link to={`/company/candidates?vacancyId=${vacancyId}`} className="btn-primary btn-sm mt-4 self-start">
          {t('requests.company.decide')}
        </Link>
      )}
    </li>
  );
};

const RequestDetail = () => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const L = useJobLabels();
  const qc = useQueryClient();
  const q = useRequest(id);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: async () => (await api.post(`/company/requests/${id}/cancel`, { reason: reason.trim() || undefined })).data,
    onSuccess: () => {
      toast.success(t('requests.company.cancelled'));
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastJobsError,
  });
  if (q.isLoading) return <Loading />;
  if (q.isError && errorCode(q.error) === 'COMPANY_NOT_APPROVED') return <NotApproved />;
  if (!q.data) return <Navigate to="/company/requests" replace />;
  const { request: r, candidates } = q.data;
  const salary = L.salary(r.salaryMin, r.salaryMax);

  return (
    <div className="space-y-6">
      <Link to="/company/requests" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('requests.company.back')}
      </Link>
      <Section
        title={r.title}
        icon={ClipboardList}
        actions={
          <>
            <StatusBadge status={r.status} />
            {r.status === 'OPEN' && (
              <Link to={`/company/requests/${r.id}/edit`} className="btn-ghost btn-sm">
                <Pencil className="size-4" aria-hidden /> {t('requests.company.edit')}
              </Link>
            )}
            {(r.status === 'OPEN' || r.status === 'IN_PROGRESS') && (
              <button type="button" className="btn-ghost btn-sm text-red-700" onClick={() => setConfirm(true)}>
                <XCircle className="size-4" aria-hidden /> {t('requests.company.cancel')}
              </button>
            )}
          </>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-muted">
          {r.quantity} × {r.profession} · {t('requests.company.createdAt', { date: fmtDate(r.createdAt) })}
        </p>
        <Requirements r={r} />
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {r.startDate && (
            <div className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-muted">{t('requests.fields.startDate')}</dt>
              <dd className="font-medium text-ink">{fmtDate(r.startDate)}</dd>
            </div>
          )}
          {salary && (
            <div className="flex justify-between gap-3 border-b border-line py-1.5">
              <dt className="text-muted">{t('requests.fields.salary')}</dt>
              <dd className="font-medium text-ink">{salary}</dd>
            </div>
          )}
        </dl>
        {r.notes && <p className="mt-4 rounded-xl bg-surface p-3 text-sm whitespace-pre-line text-ink">{r.notes}</p>}
        <div className="mt-5">
          <RequestProgressBar progress={r.progress} />
        </div>
        {confirm && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-900">{t('requests.company.cancelTitle')}</p>
            <p className="mt-1 text-sm text-red-900/80">{t('requests.company.cancelText')}</p>
            <label htmlFor="rq-cancel-reason" className="mt-3 block text-xs font-semibold text-red-900">
              {t('requests.company.cancelReason')}
            </label>
            <input id="rq-cancel-reason" className="input mt-1" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(false)}>
                {t('requests.company.keep')}
              </button>
              <button type="button" className="btn-primary btn-sm bg-red-600 hover:bg-red-700" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending && <Spinner className="size-4" />} {t('requests.company.cancel')}
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title={t('requests.company.candidates')} icon={Users}>
        <p className="-mt-2 mb-2 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden /> {t('requests.company.privacy')}
        </p>
        {candidates.length === 0 ? (
          <Empty icon={Users} title={t('requests.company.noCandidates')} text={t('requests.company.noCandidatesText')} />
        ) : (
          <>
            <p className="mb-4 text-xs text-muted">{t('requests.company.decideHint')}</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {candidates.map((c) => (
                <CandidateCard key={c.id} item={c} vacancyId={r.vacancyId} />
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
};

/** Employer portal: bulk candidate requests (/company/requests/*). */
export const CompanyRequests = () => (
  <Routes>
    <Route index element={<RequestList />} />
    <Route path="new" element={<NewRequest />} />
    <Route path=":id" element={<RequestDetail />} />
    <Route path=":id/edit" element={<EditRequest />} />
    <Route path="*" element={<Navigate to="/company/requests" replace />} />
  </Routes>
);
