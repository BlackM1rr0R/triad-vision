import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Briefcase, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Plus, Search, Sparkles, Trash2, Undo2, UserPlus, Users, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { useL10n } from '@/lib/l10n';
import { useSiteContent } from '@/lib/content';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { Spinner } from '@/components/ui/Spinner';
import { Drawer } from '@/components/admin/Drawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDate, fmtRelative, fullName } from '@/components/admin/labels';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { JobAlertStatsPanel } from '@/components/jobs/JobAlertStatsPanel';
import { VacancyForm, formFromVacancy, payloadFromForm, type VacancyFormState } from '@/components/company/VacancyForm';
import { ScorePill } from '@/components/jobs/MatchMeter';
import { MatchBreakdown } from '@/components/placement/MatchBreakdown';
import { CandidateProfileCard } from '@/components/aiEmployer/CandidateProfileCard';
import { EmployerAiToggle } from '@/components/aiEmployer/EmployerAiToggle';
import { reportAiSaved } from '@/components/aiEmployer/shared';
import { toastJobsError, useJobLabels } from '@/components/jobs/labels';
import { VacancyStatusCell } from '@/components/inline/VacancyStatusCell'; // inline publish / close
import { requestInlineEdit } from '@/components/inline/optimistic';
import { useListNav } from '@/components/shortcuts/useListNav'; // J / K / Enter / E / '/' / Esc
import {
  APPLICATION_STATUS_TONE,
  VACANCY_STATUS_TONE,
  type ApplicationStatus,
  type CompanyStatus,
  type Match,
  type VacancyRow,
  type VacancyStatus,
} from '@/components/jobs/types';

registerCopy(pagesJobs);

const STATUSES: VacancyStatus[] = ['PENDING', 'OPEN', 'DRAFT', 'CLOSED'];
const STAFF_APP_STATUSES: ApplicationStatus[] = ['NEW', 'SHORTLISTED', 'PROPOSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'];

interface ListRow extends VacancyRow {
  company: { id: string; name: string; status: CompanyStatus } | null;
  visaCategory: { id: string; title: L10n; visaLabel: string } | null;
  applications: Partial<Record<ApplicationStatus, number>>;
}
interface DetailApplication {
  id: string;
  status: ApplicationStatus;
  matchScore: number | null;
  message: string | null;
  staffNote: string | null;
  companyNote: string | null;
  createdAt: string;
  match: Match;
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null; profession: string | null; germanLevel: string | null; experienceYears: number | null; drivingLicence: string | null; city: string | null };
}
interface Detail extends VacancyRow {
  company: { id: string; name: string; status: CompanyStatus } | null;
  visaCategory: { id: string; slug: string; title: L10n; visaLabel: string } | null;
  applications: DetailApplication[];
}
interface Suggestion {
  id: string;
  firstName: string;
  lastName: string;
  profession: string | null;
  germanLevel: string | null;
  city: string | null;
  match: Match;
}

const useCompanyOptions = () =>
  useQuery({
    queryKey: ['admin-company-options'],
    queryFn: async () => (await api.get<{ items: { id: string; name: string; city: string | null; status: CompanyStatus }[] }>('/admin/companies/options')).data.items,
    staleTime: 60_000,
  });

/** SUPER_ADMIN may edit everything, in every state: status and publication date included (audited server-side). */
const useIsSuperAdmin = () => hasMinRole(useAuth().user?.role, 'SUPER_ADMIN');

/** Staff-only fields of the vacancy form: employer, visa category, slug (+ status and publication date for the super admin). */
const StaffFields = ({ f, set, superFields }: { f: VacancyFormState; set: <K extends keyof VacancyFormState>(k: K, v: VacancyFormState[K]) => void; superFields?: boolean }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const { tr } = useL10n();
  const { data: companies } = useCompanyOptions();
  const { data: content } = useSiteContent();
  return (
    <section className="grid gap-4 rounded-xl border border-dashed border-primary/25 bg-primary/[0.04] p-4 sm:grid-cols-3">
      <p className="text-sm font-bold text-ink sm:col-span-3">{t('jobsArea.admin.vacancies.staffFields')}</p>
      <div>
        <label className="label" htmlFor="sv-company">
          {t('jobsArea.admin.vacancies.company')}
        </label>
        <select id="sv-company" className="input" value={f.companyId} onChange={(e) => set('companyId', e.target.value)}>
          <option value="">{t('jobsArea.admin.vacancies.noCompany')}</option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` · ${c.city}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sv-visa">
          {t('jobsArea.admin.vacancies.visa')}
        </label>
        <select id="sv-visa" className="input" value={f.visaCategoryId} onChange={(e) => set('visaCategoryId', e.target.value)}>
          <option value="">—</option>
          {content?.visaCategories.map((v) => (
            <option key={v.id} value={v.id}>
              {tr(v.title)} ({v.visaLabel})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="sv-slug">
          {t('jobsArea.admin.vacancies.slug')}
        </label>
        <input id="sv-slug" className="input code-id text-xs" value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder={t('jobsArea.admin.vacancies.slugAuto')} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </div>
      {superFields && (
        <>
          <div>
            <label className="label" htmlFor="sv-status">
              {t('jobsArea.admin.vacancies.statusField')}
            </label>
            <select id="sv-status" className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {L.vacancyStatus(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sv-published">
              {t('jobsArea.admin.vacancies.publishedAtField')}
            </label>
            <input id="sv-published" type="date" className="input" value={f.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />
          </div>
          <p className="self-end text-[11px] text-muted">{t('jobsArea.admin.vacancies.superHint')}</p>
        </>
      )}
    </section>
  );
};

const ApplicationRow = ({ a, onChanged, hasCompany }: { a: DetailApplication; onChanged: () => void; hasCompany: boolean }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const [note, setNote] = useState(a.staffNote ?? '');
  const m = useMutation({
    mutationFn: (body: { status?: ApplicationStatus; staffNote?: string | null }) => api.patch(`/admin/candidates/applications/${a.id}`, body),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.saved'));
      onChanged();
    },
    onError: toastJobsError,
  });
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/admin/candidates?id=${a.user.id}`} className="font-semibold text-link hover:underline">
            {fullName(a.user)}
          </Link>
          <p className="truncate text-xs text-muted">
            {[a.user.profession, a.user.germanLevel && `DE ${a.user.germanLevel}`, a.user.drivingLicence, a.user.city].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScorePill score={a.match.score} />
          {a.status === 'WITHDRAWN' ? (
            <span className={clsx('badge', APPLICATION_STATUS_TONE.WITHDRAWN)}>{L.appStatus('WITHDRAWN')}</span>
          ) : (
            <select
              aria-label={t('jobsArea.admin.applicationStatus')}
              className={clsx('min-h-8 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold', APPLICATION_STATUS_TONE[a.status])}
              value={a.status}
              disabled={m.isPending}
              onChange={(e) => m.mutate({ status: e.target.value as ApplicationStatus })}
            >
              {STAFF_APP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {L.appStatus(s)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <MatchBreakdown match={a.match} className="mt-1" />
      {a.message && <p className="mt-2 rounded-md bg-sunken px-2.5 py-1.5 text-xs text-ink/80">“{a.message}”</p>}
      {a.companyNote && (
        <p className="mt-2 rounded-md bg-accent-bg px-2.5 py-1.5 text-xs whitespace-pre-line text-accent-fg">
          {t('jobsArea.admin.employerNote')}: {a.companyNote}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <input
          aria-label={t('jobsArea.admin.staffNote')}
          className="input py-1.5 text-xs"
          placeholder={t('jobsArea.admin.staffNote')}
          value={note}
          maxLength={5000}
          onChange={(e) => setNote(e.target.value)}
        />
        {note !== (a.staffNote ?? '') && (
          <button type="button" className="btn-secondary btn-sm" disabled={m.isPending} onClick={() => m.mutate({ staffNote: note.trim() || null })}>
            {t('admin.common.save')}
          </button>
        )}
      </div>
      <div className="mt-2">
        <CandidateProfileCard userId={a.user.id} applicationId={a.id} canPropose={hasCompany && a.status !== 'WITHDRAWN'} onChanged={onChanged} />
      </div>
    </li>
  );
};

const VacancyDrawer = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const qc = useQueryClient();
  const isNew = id === 'new';
  const isSuper = useIsSuperAdmin();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Staff-created vacancies go live right away unless the box is unticked (a draft is invisible on /jobs).
  const [publish, setPublish] = useState(true);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-vacancy', id],
    queryFn: async () => (await api.get<{ vacancy: Detail }>(`/admin/vacancies/${id}`)).data.vacancy,
    enabled: !!id && !isNew,
  });
  const suggestions = useQuery({
    queryKey: ['admin-vacancy-suggestions', id],
    queryFn: async () => (await api.get<{ items: Suggestion[] }>(`/admin/vacancies/${id}/suggestions`)).data.items,
    enabled: !!id && !isNew,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-vacancies'] });
    void qc.invalidateQueries({ queryKey: ['admin-vacancy', id] });
    void qc.invalidateQueries({ queryKey: ['admin-vacancy-suggestions', id] });
  };
  const save = useMutation({
    mutationFn: async ({ f }: { f: VacancyFormState; ai: string[] }) =>
      isNew
        ? (await api.post<{ vacancy: VacancyRow }>('/admin/vacancies', { ...payloadFromForm(f, true), publish })).data.vacancy
        : (await api.patch<{ vacancy: VacancyRow }>(`/admin/vacancies/${id}`, { ...payloadFromForm(f, true), ...superChanges(f) })).data.vacancy,
    onSuccess: (v, { ai }) => {
      reportAiSaved('staff', v.id, ai);
      if (isNew && v.status === 'DRAFT') toast.info(t('jobsArea.admin.savedDraft'));
      else toast.success(t('jobsArea.admin.saved'));
      refresh();
      if (isNew) onClose();
      else qc.setQueryData(['admin-vacancy', id], (old: Detail | undefined) => (old ? { ...old, ...v } : old));
    },
    onError: toastJobsError,
  });
  const action = useMutation({
    mutationFn: (kind: 'approve' | 'reject' | 'close' | 'delete') =>
      kind === 'delete' ? api.delete(`/admin/vacancies/${id}`) : api.post(`/admin/vacancies/${id}/${kind}`, kind === 'reject' ? { reason } : undefined),
    onSuccess: (_r, kind) => {
      toast.success(t(`jobsArea.admin.vacancies.done.${kind}`));
      setRejecting(false);
      setReason('');
      if (kind === 'delete') {
        void qc.invalidateQueries({ queryKey: ['admin-vacancies'] });
        onClose();
      } else refresh();
    },
    onError: toastJobsError,
  });
  const addSuggestion = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/candidates/${userId}/applications`, { vacancyId: id }),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.added'));
      refresh();
    },
    onError: toastJobsError,
  });

  const v = data;
  /** Status / publication date: sent only when the super admin changed them (the date keeps its time otherwise). */
  function superChanges(f: VacancyFormState) {
    if (!isSuper || !v) return {};
    const initial = formFromVacancy(v);
    return {
      ...(f.status !== initial.status ? { status: f.status } : {}),
      ...(f.publishedAt !== initial.publishedAt ? { publishedAt: f.publishedAt || null } : {}),
    };
  }
  return (
    <Drawer open={!!id} onClose={onClose} title={isNew ? t('jobsArea.admin.vacancies.new') : v ? L.title(v.title) : t('admin.nav.vacancies')}>
      {isNew ? (
        <VacancyForm
          staff
          anyDate={isSuper}
          ai="staff"
          initial={formFromVacancy(null)}
          busy={save.isPending}
          submitLabel={t('admin.common.create')}
          onSubmit={(f, ai) => save.mutate({ f, ai })}
          extra={(f, set) => (
            <>
              <StaffFields f={f} set={set} />
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" className="size-4 accent-primary" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> {t('jobsArea.admin.vacancies.publishNow')}
              </label>
            </>
          )}
        />
      ) : isLoading || !v ? (
        error ? <ErrorBlock error={error} onRetry={() => refetch()} /> : <LoadingBlock />
      ) : (
        <div className="space-y-6">
          <Panel title={t('jobsArea.admin.vacancies.review')}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className={clsx('badge', VACANCY_STATUS_TONE[v.status])}>{L.vacancyStatus(v.status)}</span>
              {v.company ? (
                <Link to={`/admin/companies?id=${v.company.id}`} className="font-semibold text-link hover:underline">
                  {v.company.name}
                </Link>
              ) : (
                <span>{t('jobsArea.admin.vacancies.noCompany')}</span>
              )}
              {v.publishedAt && <span>· {t('jobsArea.common.postedOn', { date: fmtDate(v.publishedAt) })}</span>}
              {v.status === 'OPEN' && (
                <a href={`/jobs/${v.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  <ExternalLink className="size-3" /> /jobs/{v.slug}
                </a>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {v.status !== 'OPEN' && (
                <button type="button" className="btn-primary btn-sm" disabled={action.isPending} onClick={() => action.mutate('approve')}>
                  <CheckCircle2 className="size-3.5" /> {v.status === 'PENDING' ? t('jobsArea.admin.vacancies.approve') : t('jobsArea.admin.vacancies.publish')}
                </button>
              )}
              {v.status === 'PENDING' && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setRejecting((r) => !r)}>
                  <Undo2 className="size-3.5" /> {t('jobsArea.admin.vacancies.reject')}
                </button>
              )}
              {v.status !== 'CLOSED' && (
                <button type="button" className="btn-secondary btn-sm" disabled={action.isPending} onClick={() => action.mutate('close')}>
                  <XCircle className="size-3.5" /> {t('jobsArea.admin.vacancies.close')}
                </button>
              )}
              {v.applications.length === 0 && (
                <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> {t('admin.common.delete')}
                </button>
              )}
            </div>
            {rejecting && (
              <div className="mt-3 space-y-2">
                <label className="label" htmlFor="rej-reason">
                  {t('jobsArea.admin.vacancies.rejectReason')}
                </label>
                <textarea id="rej-reason" className="input min-h-20" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className="btn-danger btn-sm" disabled={reason.trim().length < 3 || action.isPending} onClick={() => action.mutate('reject')}>
                  {t('jobsArea.admin.vacancies.sendBack')}
                </button>
              </div>
            )}
          </Panel>

          <Panel title={t('jobsArea.admin.vacancies.applications', { count: v.applications.length })} icon={Users}>
            {v.applications.length === 0 ? (
              <p className="text-sm text-muted">{t('jobsArea.admin.vacancies.noApplications')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {v.applications.map((a) => (
                  <ApplicationRow key={`${a.id}-${a.status}`} a={a} onChanged={refresh} hasCompany={v.company?.status === 'ACTIVE'} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('jobsArea.admin.vacancies.suggestions')} icon={Sparkles}>
            {suggestions.isLoading ? (
              <Spinner className="size-5 text-link" />
            ) : !suggestions.data?.length ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <ul className="divide-y divide-line">
                {suggestions.data.slice(0, 10).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/admin/candidates?id=${s.id}`} className="text-sm font-semibold text-link hover:underline">
                        {fullName(s)}
                      </Link>
                      <p className="truncate text-xs text-muted">{[s.profession, s.germanLevel && `DE ${s.germanLevel}`, s.city].filter(Boolean).join(' · ')}</p>
                      <MatchBreakdown match={s.match} />
                    </div>
                    <div className="flex items-center gap-2">
                      <ScorePill score={s.match.score} />
                      <button type="button" className="btn-secondary btn-sm" disabled={addSuggestion.isPending || v.status === 'CLOSED'} onClick={() => addSuggestion.mutate(s.id)}>
                        <UserPlus className="size-3.5" /> {t('jobsArea.admin.shortlist')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t('jobsArea.admin.vacancies.edit')}>
            <VacancyForm
              key={v.updatedAt}
              staff
              anyDate={isSuper}
              ai="staff"
              initial={formFromVacancy(v)}
              busy={save.isPending}
              submitLabel={t('admin.common.save')}
              onSubmit={(f, ai) => save.mutate({ f, ai })}
              extra={(f, set) => <StaffFields f={f} set={set} superFields={isSuper} />}
            />
          </Panel>
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => action.mutate('delete', { onSettled: () => setConfirmDelete(false) })}
            loading={action.isPending}
            title={t('jobsArea.portal.vacancies.deleteTitle')}
            message={t('jobsArea.portal.vacancies.deleteText')}
            confirmLabel={t('admin.common.delete')}
          />
        </div>
      )}
    </Drawer>
  );
};

export default function AdminVacancies() {
  const { t } = useTranslation();
  const L = useJobLabels();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as VacancyStatus | null) ?? null;
  const companyId = params.get('companyId') ?? '';
  const openId = params.get('id');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const search = params.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const { data: companies } = useCompanyOptions();

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page' && k !== 'id') next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput.trim() !== search) setParam('search', searchInput.trim() || null);
    }, 350);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-vacancies', { status, search, page, companyId }],
    queryFn: async () =>
      (
        await api.get<{ items: ListRow[]; total: number; pageSize: number; counts: Partial<Record<VacancyStatus, number>> }>('/admin/vacancies', {
          params: { status: status ?? undefined, search: search || undefined, page, companyId: companyId || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Keyboard: J / K select a row, Enter opens it, E edits its status in place, "/" searches.
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useListNav({
    ids: (data?.items ?? []).map((v) => v.id),
    selected,
    onSelect: setSelected,
    onOpen: (id) => setParam('id', id),
    onEdit: (id) => requestInlineEdit(id),
    searchRef,
    titleKey: 'ux.shortcuts.lists.vacancies',
    enabled: !openId,
  });

  return (
    <div>
      <PageHead
        title={t('admin.nav.vacancies')}
        subtitle={t('jobsArea.admin.vacancies.subtitle')}
        actions={
          <>
            {isFetching && !isLoading && <Spinner className="size-4 text-link" />}
            <EmployerAiToggle />
            <button type="button" className="btn-primary btn-sm" onClick={() => setParam('id', 'new')}>
              <Plus className="size-3.5" /> {t('jobsArea.admin.vacancies.new')}
            </button>
          </>
        }
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('admin.common.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={searchRef} type="search" className="input pl-9" placeholder={t('jobsArea.admin.vacancies.search')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <select aria-label={t('jobsArea.admin.vacancies.company')} className="input lg:w-56" value={companyId} onChange={(e) => setParam('companyId', e.target.value || null)}>
          <option value="">{t('jobsArea.admin.vacancies.allCompanies')}</option>
          <option value="none">{t('jobsArea.admin.vacancies.noCompany')}</option>
          {companies?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0">
          <Chip active={!status} onClick={() => setParam('status', null)}>
            {t('admin.common.all')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={data?.counts[s] ?? 0}>
              {L.vacancyStatus(s)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Briefcase} title={t('jobsArea.admin.vacancies.empty')} />
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {data.items.map((v) => {
            const total = Object.values(v.applications).reduce<number>((a, b) => a + (b ?? 0), 0);
            return (
              <li
                key={v.id}
                data-row-id={v.id}
                onClick={() => setParam('id', v.id)}
                className={clsx(
                  'flex w-full cursor-pointer flex-col gap-2 px-4 py-3.5 text-left transition hover:bg-surface/70 sm:flex-row sm:items-center sm:justify-between',
                  selected === v.id && 'bg-primary/[0.04] shadow-[inset_3px_0_0_var(--color-brand-600)]',
                )}
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParam('id', v.id);
                      }}
                      className="rounded text-left font-semibold break-words text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus/50"
                    >
                      {L.title(v.title)}
                    </button>
                    <VacancyStatusCell id={v.id} status={v.status} />
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[v.company?.name ?? t('jobsArea.admin.vacancies.noCompany'), v.city, L.employmentType(v.employmentType), L.salary(v.salaryMin, v.salaryMax)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted tabular-nums">
                  {total > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" /> {total}
                      {v.applications.NEW ? <span className="badge bg-primary/10 text-link">+{v.applications.NEW}</span> : null}
                    </span>
                  )}
                  <span title={fmtDate(v.updatedAt)}>{fmtRelative(v.updatedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
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

      {/* Candidate demand: active job alerts per profession. */}
      <JobAlertStatsPanel className="mt-8" />

      <VacancyDrawer key={openId ?? 'none'} id={openId} onClose={() => setParam('id', null)} />
    </div>
  );
}
