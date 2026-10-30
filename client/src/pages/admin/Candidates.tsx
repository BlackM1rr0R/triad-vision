import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BadgeCheck, ChevronLeft, ChevronRight, FolderPlus, Mail, Paperclip, Phone, Search, UserPlus, UserSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus, L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { CvDownloadButton } from '@/components/cv/CvDownloadButton';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Spinner } from '@/components/ui/Spinner';
import { Drawer } from '@/components/admin/Drawer';
import { Modal } from '@/components/admin/Modal';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fullName } from '@/components/admin/labels';
import { DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { ScorePill } from '@/components/jobs/MatchMeter';
import { CandidateProfileCard } from '@/components/aiEmployer/CandidateProfileCard';
import { PartyThreadButton, PartyThreadFromQuery } from '@/components/messagingPlus/PartyThread';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, EDUCATION_LEVELS, GERMAN_LEVELS, type ApplicationStatus, type Match, type VacancyStatus } from '@/components/jobs/types';
import { MatchBreakdown } from '@/components/placement/MatchBreakdown';
import { RecognitionEditor } from '@/components/placement/RecognitionEditor';
import { CandidateShareLinks } from '@/components/placement/CandidateShareLinks';
import { CandidateEvaluations } from '@/components/placement/Evaluations';
import { CandidateIntroVideo } from '@/components/placement/IntroVideo';
import { pagesStaffPower } from '@/i18n/pagesStaffPower'; // saved views, table settings, bulk actions
import { SavedViewsMenu } from '@/components/staffPower/SavedViews';
import { ColumnChooser, SettingsTable, useTableSettings, type ColumnDef } from '@/components/staffPower/tableSettings';
import { useRowSelection } from '@/components/staffPower/selection';
import { CandidatesBulkBar } from '@/components/staffPower/BulkBar';

registerCopy(pagesJobs);
registerCopy(pagesStaffPower);

const STAFF_APP_STATUSES: ApplicationStatus[] = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];
const FILTERS = ['search', 'vacancyId', 'germanLevel', 'licence', 'education', 'minExperience', 'city', 'verified', 'hasCase'] as const;

interface Row {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  profession: string | null;
  experienceYears: number | null;
  germanLevel: string | null;
  education: string | null;
  drivingLicence: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  activeCase: { id: string; number: string; status: CaseStatus } | null;
  applicationsCount: number;
  match?: Match;
  application?: { id: string; status: ApplicationStatus } | null;
}
interface VacancyOption {
  id: string;
  title: L10n;
  city: string | null;
  status: VacancyStatus;
  companyId: string | null;
  company: { name: string } | null;
}
interface CandidateDetail extends Omit<Row, 'activeCase' | 'applicationsCount' | 'match' | 'application'> {
  locale: string;
  birthDate: string | null;
  nationality: string | null;
  address: string | null;
  about: string | null;
  recognitionStatus: string | null;
  recognitionNote: string | null;
  hasIntroVideo: boolean;
  cases: { id: string; number: string; status: CaseStatus; profession: string; createdAt: string; companyId: string | null; vacancyId: string | null; company: { name: string } | null }[];
  applications: {
    id: string;
    status: ApplicationStatus;
    matchScore: number | null;
    message: string | null;
    staffNote: string | null;
    companyNote: string | null;
    createdAt: string;
    match: Match;
    vacancy: { id: string; slug: string; title: L10n; status: VacancyStatus; city: string | null; company: { name: string } | null };
  }[];
  /** Documents uploaded with an application (server: lib/applicationUploads.ts). */
  applicationDocuments?: { id: string; kind: string; title: string; filename: string; createdAt: string; attachedCaseId: string | null }[];
}

const useVacancyOptions = () =>
  useQuery({
    queryKey: ['admin-vacancy-options'],
    queryFn: async () => (await api.get<{ items: VacancyOption[] }>('/admin/vacancies/options')).data.items,
    staleTime: 60_000,
  });

const AddToVacancyModal = ({ userId, onClose, presetVacancy }: { userId: string | null; onClose: () => void; presetVacancy?: string }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const qc = useQueryClient();
  // Own query (per candidate): marks the vacancies the candidate already applied to.
  const options = useQuery({
    queryKey: ['admin-vacancy-options', 'for', userId],
    queryFn: async () => (await api.get<{ items: (VacancyOption & { applicationStatus?: ApplicationStatus | null })[] }>('/admin/vacancies/options', { params: { userId } })).data.items,
    enabled: !!userId,
  });
  const vacancies = options.data;
  const [vacancyId, setVacancyId] = useState(presetVacancy ?? '');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    setVacancyId(presetVacancy ?? '');
    setNote('');
    setSearch('');
  }, [userId, presetVacancy]);
  const blocked = (v: { applicationStatus?: ApplicationStatus | null }) => !!v.applicationStatus && !['NEW', 'WITHDRAWN'].includes(v.applicationStatus);
  const needle = search.trim().toLowerCase();
  const shown = (vacancies ?? []).filter(
    (v) => !needle || v.id === vacancyId || [tr(v.title), v.company?.name, v.city].filter(Boolean).join(' ').toLowerCase().includes(needle),
  );
  const m = useMutation({
    mutationFn: () => api.post(`/admin/candidates/${userId}/applications`, { vacancyId, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.added'));
      void qc.invalidateQueries({ queryKey: ['admin-candidates'] });
      void qc.invalidateQueries({ queryKey: ['admin-candidate', userId] });
      void qc.invalidateQueries({ queryKey: ['admin-vacancy-options'] });
      onClose();
    },
    onError: toastJobsError,
  });
  const empty = options.isSuccess && !vacancies?.length;
  return (
    <Modal
      open={!!userId}
      onClose={onClose}
      size="sm"
      title={t('jobsArea.admin.candidates.addToVacancy')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!vacancyId || m.isPending || empty} onClick={() => m.mutate()}>
            {m.isPending && <Spinner className="size-3.5" />} {t('jobsArea.admin.shortlist')}
          </button>
        </>
      }
    >
      {options.isLoading ? (
        <div className="grid place-items-center py-6">
          <Spinner className="size-5" />
        </div>
      ) : options.error ? (
        <ErrorBlock error={options.error} onRetry={() => void options.refetch()} />
      ) : empty ? (
        <div className="rounded-lg border border-dashed border-line bg-sunken px-4 py-5 text-center">
          <p className="text-sm font-semibold text-ink">{t('jobsArea.admin.candidates.noVacancies')}</p>
          <p className="mt-1 text-xs text-muted">{t('jobsArea.admin.candidates.noVacanciesHint')}</p>
          <Link to="/admin/vacancies" className="btn-primary btn-sm mt-3 inline-flex" onClick={onClose}>
            <FolderPlus className="size-3.5" aria-hidden /> {t('jobsArea.admin.candidates.createVacancy')}
          </Link>
        </div>
      ) : (
        <>
          {(vacancies?.length ?? 0) > 8 && (
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                className="input pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('jobsArea.admin.candidates.vacancySearch')}
                aria-label={t('jobsArea.admin.candidates.vacancySearch')}
              />
            </div>
          )}
          <label className="label" htmlFor="atv-vacancy">
            {t('jobsArea.admin.candidates.vacancy')}
          </label>
          <select id="atv-vacancy" className="input" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
            <option value="">{shown.length ? t('jobsArea.admin.candidates.chooseVacancy') : t('jobsArea.admin.candidates.noMatch')}</option>
            {shown.map((v) => (
              <option key={v.id} value={v.id} disabled={blocked(v)}>
                {tr(v.title)}
                {v.company ? ` · ${v.company.name}` : ''}
                {v.city ? ` · ${v.city}` : ''}
                {` · ${L.vacancyStatus(v.status)}`}
                {v.applicationStatus ? ` · ${L.appStatus(v.applicationStatus)}` : ''}
              </option>
            ))}
          </select>
          {vacancies?.some((v) => v.status !== 'OPEN') && <p className="mt-1 text-xs text-muted">{t('jobsArea.admin.candidates.notOpenHint')}</p>}
          <label className="label mt-3" htmlFor="atv-note">
            {t('jobsArea.admin.staffNote')}
          </label>
          <textarea id="atv-note" className="input min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}
    </Modal>
  );
};

const ApplicationCard = ({ a, userId, onChanged }: { a: CandidateDetail['applications'][number]; userId: string; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const [note, setNote] = useState(a.staffNote ?? '');
  const [message, setMessage] = useState('');
  const patch = useMutation({
    mutationFn: (body: { status?: ApplicationStatus; staffNote?: string | null; message?: string }) => api.patch(`/admin/candidates/applications/${a.id}`, body),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.saved'));
      setMessage('');
      onChanged();
    },
    onError: toastJobsError,
  });
  const linkCase = useMutation({
    mutationFn: async () => (await api.post<{ case: { id: string; number: string }; created: boolean }>(`/admin/candidates/applications/${a.id}/case`, {})).data,
    onSuccess: (r) => {
      toast.success(r.created ? t('jobsArea.admin.candidates.caseCreated', { number: r.case.number }) : t('jobsArea.admin.candidates.caseLinked', { number: r.case.number }));
      onChanged();
    },
    onError: toastJobsError,
  });
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/admin/vacancies?id=${a.vacancy.id}`} className="font-semibold break-words text-link hover:underline">
            {tr(a.vacancy.title)}
          </Link>
          <p className="text-xs text-muted">{[a.vacancy.company?.name, a.vacancy.city, fmtDate(a.createdAt)].filter(Boolean).join(' · ')}</p>
        </div>
        <ScorePill score={a.match.score} />
      </div>
      <MatchBreakdown match={a.match} className="mt-1" />
      {a.message && <p className="mt-2 rounded-md bg-sunken px-2.5 py-1.5 text-xs text-ink/80">“{a.message}”</p>}
      {a.companyNote && (
        <p className="mt-2 rounded-md bg-accent-bg px-2.5 py-1.5 text-xs whitespace-pre-line text-accent-fg">
          {t('jobsArea.admin.employerNote')}: {a.companyNote}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
        {a.status === 'WITHDRAWN' ? (
          <span className={clsx('badge self-center', APPLICATION_STATUS_TONE.WITHDRAWN)}>{L.appStatus('WITHDRAWN')}</span>
        ) : (
          <select
            aria-label={t('jobsArea.admin.applicationStatus')}
            className={clsx('min-h-9 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold', APPLICATION_STATUS_TONE[a.status])}
            value={a.status}
            disabled={patch.isPending}
            onChange={(e) => patch.mutate({ status: e.target.value as ApplicationStatus, message: message.trim() || undefined })}
          >
            {STAFF_APP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {L.appStatus(s)}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label={t('jobsArea.admin.candidates.messageToCandidate')}
          className="input py-1.5 text-xs"
          placeholder={t('jobsArea.admin.candidates.messageToCandidate')}
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div className="mt-2 flex gap-2">
        <input aria-label={t('jobsArea.admin.staffNote')} className="input py-1.5 text-xs" placeholder={t('jobsArea.admin.staffNote')} value={note} maxLength={5000} onChange={(e) => setNote(e.target.value)} />
        {note !== (a.staffNote ?? '') && (
          <button type="button" className="btn-secondary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ staffNote: note.trim() || null })}>
            {t('admin.common.save')}
          </button>
        )}
      </div>
      <div className="mt-3">
        <CandidateProfileCard userId={userId} applicationId={a.id} canPropose={!!a.vacancy.company && a.status !== 'WITHDRAWN'} onChanged={onChanged} />
      </div>
      {/* Messaging plus: moderated candidate + employer + Triad Vision thread (from PROPOSED on). */}
      {!!a.vacancy.company && ['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(a.status) && <PartyThreadButton applicationId={a.id} className="mt-3 mr-2" />}
      {a.status === 'ACCEPTED' && (
        <button type="button" className="btn-primary btn-sm mt-3" disabled={linkCase.isPending} onClick={() => linkCase.mutate()}>
          {linkCase.isPending ? <Spinner className="size-3.5" /> : <FolderPlus className="size-3.5" />} {t('jobsArea.admin.candidates.createCase')}
        </button>
      )}
    </li>
  );
};

const CandidateDrawer = ({ id, onClose, onAdd }: { id: string | null; onClose: () => void; onAdd: (id: string) => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-candidate', id],
    queryFn: async () => (await api.get<{ candidate: CandidateDetail }>(`/admin/candidates/${id}`)).data.candidate,
    enabled: !!id,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-candidate', id] });
    void qc.invalidateQueries({ queryKey: ['admin-candidates'] });
  };
  return (
    <Drawer open={!!id} onClose={onClose} title={data ? fullName(data) : t('admin.nav.candidates')}>
      {isLoading || !data ? (
        error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <Panel title={t('jobsArea.admin.candidates.profile')}>
            <div className="mb-3 flex flex-wrap gap-2">
              <a href={`mailto:${data.email}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 hover:border-line-strong">
                <Mail className="size-3.5" /> {data.email}
              </a>
              {data.phone && (
                <a href={`tel:${data.phone}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink/80 hover:border-line-strong">
                  <Phone className="size-3.5" /> {data.phone}
                </a>
              )}
              <CvDownloadButton url={`/admin/candidates/${data.id}/cv.pdf`} />
              <span className={clsx('badge', data.emailVerifiedAt ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>
                {data.emailVerifiedAt ? t('jobsArea.admin.verified') : t('jobsArea.admin.unverified')}
              </span>
            </div>
            <dl className="divide-y divide-line">
              <DefRow label={t('jobsArea.profile.profession')}>{data.profession ?? '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.experience')}>{data.experienceYears != null ? L.years(data.experienceYears) : '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.german')}>{data.germanLevel ? L.german(data.germanLevel) : '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.education')}>{L.education(data.education) || '—'}</DefRow>
              <DefRow label={t('placement.recognition.label')}>{data.recognitionStatus ? t(`placement.recognition.status.${data.recognitionStatus}`) : '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.licence')}>{data.drivingLicence ?? '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.city')}>{data.city ?? '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.birthDate')}>{data.birthDate ? fmtDate(data.birthDate) : '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.nationality')}>{data.nationality ?? '—'}</DefRow>
              <DefRow label={t('jobsArea.profile.registered')}>{fmtDate(data.createdAt)}</DefRow>
            </dl>
            {data.about && <p className="mt-3 rounded-md bg-sunken px-3 py-2 text-xs whitespace-pre-line text-ink/80">{data.about}</p>}
            <div className="mt-3 space-y-3">
              <RecognitionEditor userId={data.id} status={data.recognitionStatus} note={data.recognitionNote} onSaved={refresh} />
              <CandidateIntroVideo candidateId={data.id} has={data.hasIntroVideo} />
            </div>
            <div className="mt-3">
              <CandidateProfileCard userId={data.id} />
            </div>
          </Panel>

          {!!data.applicationDocuments?.length && (
            <Panel title={t('jobsArea.admin.candidates.appDocs', { count: data.applicationDocuments.length })}>
              <ul className="divide-y divide-line">
                {data.applicationDocuments.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Paperclip className="size-4 shrink-0 text-muted" aria-hidden />
                    <a href={`/api/admin/candidates/${data.id}/application-documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-link hover:underline" title={d.filename}>
                      {d.title} · {d.filename}
                    </a>
                    <span className="text-xs text-muted">{fmtDate(d.createdAt)}</span>
                    {d.attachedCaseId ? (
                      <Link to={`/admin/cases/${d.attachedCaseId}#documents`} className="badge bg-success-bg text-success-fg">
                        {t('jobsArea.admin.candidates.appDocInCase')}
                      </Link>
                    ) : (
                      <span className="badge bg-sunken text-muted">{t('jobsArea.admin.candidates.appDocWaiting')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={t('jobsArea.admin.candidates.applications', { count: data.applications.length })}
            actions={
              <button type="button" className="btn-secondary btn-sm" onClick={() => onAdd(data.id)}>
                <UserPlus className="size-3.5" /> {t('jobsArea.admin.candidates.addToVacancy')}
              </button>
            }
          >
            {data.applications.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-3">
                {data.applications.map((a) => (
                  <ApplicationCard key={`${a.id}-${a.status}`} a={a} userId={data.id} onChanged={refresh} />
                ))}
              </ul>
            )}
          </Panel>

          {/* Employer collaboration: share links without login and interview evaluations with averages. */}
          <CandidateShareLinks
            candidateId={data.id}
            applications={data.applications
              .filter((a) => a.status !== 'WITHDRAWN')
              .map((a) => ({ id: a.id, label: [tr(a.vacancy.title), a.vacancy.company?.name].filter(Boolean).join(' · ') }))}
          />
          <CandidateEvaluations candidateId={data.id} />

          <Panel title={t('jobsArea.admin.candidates.cases', { count: data.cases.length })}>
            {data.cases.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.cases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <Link to={`/admin/cases/${c.id}`} className="font-semibold text-link hover:underline">
                      {c.number} · {c.profession}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {c.company?.name}
                      <StatusBadge status={c.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </Drawer>
  );
};

export default function AdminCandidates() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const L = useJobLabels();
  const [params, setParams] = useSearchParams();
  const openId = params.get('id');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [addFor, setAddFor] = useState<string | null>(null);
  const { data: vacancies } = useVacancyOptions();
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTERS)[number], string>;

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page' && k !== 'id') next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput.trim() !== filters.search) setParam('search', searchInput.trim() || null);
    }, 350);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-candidates', filters, page],
    queryFn: async () =>
      (
        await api.get<{ items: Row[]; total: number; pageSize: number }>('/admin/candidates', {
          params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const ranked = !!filters.vacancyId;
  // Multi-select for the bulk bar and the per-user column settings of the table.
  const rows = data?.items ?? [];
  const sel = useRowSelection(
    rows.map((c) => c.id),
    JSON.stringify({ filters, page }),
  );
  const bulkFilters = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { id: 'match', label: t('jobsArea.common.match') },
      { id: 'candidate', label: t('jobsArea.admin.candidates.th.candidate'), required: true },
      { id: 'profession', label: t('jobsArea.profile.profession') },
      { id: 'german', label: t('jobsArea.profile.german') },
      { id: 'experience', label: t('jobsArea.profile.experience'), className: 'whitespace-nowrap' },
      { id: 'licence', label: t('jobsArea.profile.licence') },
      { id: 'education', label: t('jobsArea.profile.education') },
      { id: 'city', label: t('jobsArea.profile.city') },
      { id: 'case', label: t('jobsArea.admin.candidates.case') },
      { id: 'action', label: t('sp.cand.action'), header: <span className="sr-only">{t('sp.cand.action')}</span>, align: 'right' },
    ],
    [t],
  );
  const tableSettings = useTableSettings('candidates', columnDefs);
  // The match column only exists while the list is ranked for a vacancy.
  const table = ranked ? tableSettings : { ...tableSettings, columns: tableSettings.columns.filter((c) => c.id !== 'match') };

  const select = (k: (typeof FILTERS)[number], label: string, options: { value: string; label: string }[]) => (
    <select aria-label={label} className="input py-2 text-xs" value={filters[k]} onChange={(e) => setParam(k, e.target.value || null)}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <PageHead
        title={t('admin.nav.candidates')}
        subtitle={data ? t('jobsArea.admin.candidates.count', { count: data.total }) : undefined}
        actions={isFetching && !isLoading ? <Spinner className="size-4 text-link" /> : undefined}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <label className="relative">
          <span className="sr-only">{t('admin.common.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('jobsArea.admin.candidates.search')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        {select(
          'vacancyId',
          t('jobsArea.admin.candidates.rankFor'),
          (vacancies ?? []).map((v) => ({ value: v.id, label: `${tr(v.title)}${v.company ? ` · ${v.company.name}` : ''}` })),
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <SavedViewsMenu page="candidates" settings={tableSettings} />
        <ColumnChooser settings={tableSettings} className="hidden xl:block" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {select('germanLevel', t('jobsArea.admin.candidates.germanMin'), GERMAN_LEVELS.filter((g) => g !== 'none').map((g) => ({ value: g, label: `≥ ${g}` })))}
        {select('licence', t('jobsArea.admin.candidates.licence'), ['B', 'C', 'CE', 'D'].map((l) => ({ value: l, label: l })))}
        {select('education', t('jobsArea.profile.education'), EDUCATION_LEVELS.map((e) => ({ value: e, label: L.education(e) })))}
        {select('minExperience', t('jobsArea.admin.candidates.experience'), [1, 2, 3, 5].map((n) => ({ value: String(n), label: `≥ ${L.years(n)}` })))}
        {select('verified', t('jobsArea.admin.candidates.email'), [
          { value: 'true', label: t('jobsArea.admin.verified') },
          { value: 'false', label: t('jobsArea.admin.unverified') },
        ])}
        {select('hasCase', t('jobsArea.admin.candidates.case'), [
          { value: 'true', label: t('jobsArea.admin.candidates.withCase') },
          { value: 'false', label: t('jobsArea.admin.candidates.withoutCase') },
        ])}
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={UserSearch} title={t('jobsArea.admin.candidates.empty')} />
        </div>
      ) : (
        <>
          <CandidatesBulkBar
            sel={sel}
            filters={bulkFilters}
            total={data.total}
            pageCount={rows.length}
            labelOf={(id) => {
              const c = rows.find((x) => x.id === id);
              return c ? fullName(c) : id;
            }}
            invalidate={[['admin-candidates']]}
            vacancyId={filters.vacancyId || undefined}
            appStatusLabel={(st) => L.appStatus(st as ApplicationStatus)}
          />
          <SettingsTable
            settings={table}
            rows={rows}
            rowKey={(c) => c.id}
            className="hidden xl:block"
            tableClassName="min-w-[1100px]"
            caption={t('admin.nav.candidates')}
            selection={sel.props}
            selectLabel={t('sp.select.row')}
            selectAllLabel={t('sp.select.page')}
            cells={{
              match: (c) => <ScorePill score={c.match?.score} />,
              candidate: (c) => (
                <>
                  <button type="button" onClick={() => setParam('id', c.id)} className="text-left font-semibold whitespace-nowrap text-ink hover:text-link">
                    {fullName(c)} {c.emailVerifiedAt && <BadgeCheck className="inline size-3.5 text-success-fg" aria-label={t('jobsArea.admin.verified')} />}
                  </button>
                  <p className="text-xs text-muted">{c.email}</p>
                </>
              ),
              profession: (c) => <span className="text-ink/80">{c.profession ?? '—'}</span>,
              german: (c) => <span className="text-ink/80">{c.germanLevel ?? '—'}</span>,
              experience: (c) => <span className="text-ink/80">{c.experienceYears != null ? L.years(c.experienceYears) : '—'}</span>,
              licence: (c) => <span className="text-ink/80">{c.drivingLicence ?? '—'}</span>,
              education: (c) => <span className="text-ink/80">{L.education(c.education) || '—'}</span>,
              city: (c) => <span className="text-ink/80">{c.city ?? '—'}</span>,
              case: (c) => (c.activeCase ? <StatusBadge status={c.activeCase.status} /> : <span className="text-xs text-muted">—</span>),
              action: (c) =>
                ranked && c.application ? (
                  <span className={clsx('badge', APPLICATION_STATUS_TONE[c.application.status])}>{L.appStatus(c.application.status)}</span>
                ) : (
                  <button type="button" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-link hover:bg-primary/[0.06]" onClick={() => setAddFor(c.id)}>
                    <UserPlus className="size-3.5" /> {t('jobsArea.admin.shortlist')}
                  </button>
                ),
            }}
          />

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {data.items.map((c) => (
              <li key={c.id} className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setParam('id', c.id)} className="min-w-0 text-left">
                    <p className="truncate font-semibold text-ink">
                      {fullName(c)} {c.emailVerifiedAt && <BadgeCheck className="inline size-3.5 text-success-fg" aria-label={t('jobsArea.admin.verified')} />}
                    </p>
                    <p className="truncate text-xs text-muted">{c.email}</p>
                  </button>
                  {ranked && <ScorePill score={c.match?.score} />}
                </div>
                <p className="mt-2 text-xs text-ink/80">
                  {[c.profession, c.germanLevel && `DE ${c.germanLevel}`, c.experienceYears != null && L.years(c.experienceYears), c.drivingLicence, c.city].filter(Boolean).join(' · ') || '—'}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  {c.activeCase ? <StatusBadge status={c.activeCase.status} /> : <span className="text-xs text-muted">{t('jobsArea.admin.candidates.withoutCase')}</span>}
                  {ranked && c.application ? (
                    <span className={clsx('badge', APPLICATION_STATUS_TONE[c.application.status])}>{L.appStatus(c.application.status)}</span>
                  ) : (
                    <button type="button" className="-my-1 inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-link" onClick={() => setAddFor(c.id)}>
                      <UserPlus className="size-3.5" /> {t('jobsArea.admin.shortlist')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label={t('admin.common.pagination')}>
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} aria-label={t('admin.common.prev')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-muted">{t('admin.common.pageOf', { page, pages })}</span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))} aria-label={t('admin.common.next')}>
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}

      <CandidateDrawer id={openId} onClose={() => setParam('id', null)} onAdd={(id) => setAddFor(id)} />
      <PartyThreadFromQuery />
      <AddToVacancyModal userId={addFor} presetVacancy={filters.vacancyId || undefined} onClose={() => setAddFor(null)} />
    </div>
  );
}
