import { useEffect, useState, type ReactNode } from 'react';
import { scoreTone as scoreToneOf, TONE_CLASS } from '@/components/ui/status';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Briefcase, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, Search, Send, Sparkles, StickyNote, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRequests } from '@/i18n/pagesRequests';
import { pagesJobs } from '@/i18n/pagesJobs';
import { usePageTitle } from '@/lib/usePageTitle';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { useJobLabels } from '@/components/jobs/labels';
import { APPLICATION_STATUS_TONE, type ApplicationStatus } from '@/components/jobs/types';
import { RequestProgressBar } from '@/components/requests/RequestProgressBar';
import { REQUEST_STATUSES, REQUEST_STATUS_TONE, type RequestBase, type RequestStatus, type Suggestion } from '@/components/requests/types';

registerCopy(pagesJobs);
registerCopy(pagesRequests);

const KEY = ['admin-candidate-requests'] as const;

interface ListItem extends RequestBase {
  staffNote: string | null;
  companyId: string;
  company: { id: string; name: string; status: string };
  createdBy: { firstName: string; lastName: string } | null;
}

interface ListResponse {
  items: ListItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<RequestStatus, number>>;
  companies: { id: string; name: string }[];
}

interface DetailResponse {
  request: RequestBase & {
    staffNote: string | null;
    companyId: string;
    company: { id: string; name: string; status: string; city: string | null; contactName: string | null; email: string | null; phone: string | null } | null;
    createdBy: { id: string; firstName: string; lastName: string; email: string } | null;
    visaCategory: { id: string; title: L10n; visaLabel: string; germanLevel: string | null } | null;
    vacancy: { id: string; slug: string; title: L10n; status: string; positions: number } | null;
  };
  applications: {
    id: string;
    status: ApplicationStatus;
    matchScore: number | null;
    companyNote: string | null;
    updatedAt: string;
    user: { id: string; firstName: string; lastName: string; profession: string | null; germanLevel: string | null };
  }[];
  suggestions: Suggestion[];
}

const Panel = ({ title, icon: Icon, actions, children }: { title: ReactNode; icon: typeof Users; actions?: ReactNode; children: ReactNode }) => (
  <section className="min-w-0 rounded-xl border border-line bg-card">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Icon className="size-4 text-link" aria-hidden /> {title}
      </h2>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
    <div className="p-5">{children}</div>
  </section>
);

const StatusPill = ({ status }: { status: RequestStatus }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge', REQUEST_STATUS_TONE[status])}>{t(`requests.status.${status}`)}</span>;
};

const scoreTone = (n: number) => TONE_CLASS[scoreToneOf(n)];

// ─── List ──────────────────────────────────────────────────────────────

const RequestsList = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as RequestStatus | null) ?? '';
  const companyId = params.get('companyId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState(params.get('search') ?? '');
  const searchParam = params.get('search') ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const id = setTimeout(() => search !== searchParam && setParam('search', search.trim()), 350);
    return () => clearTimeout(id);
  });

  const q = useQuery({
    queryKey: [...KEY, 'list', status, companyId, searchParam, page],
    queryFn: async () =>
      (await api.get<ListResponse>('/admin/candidate-requests', { params: { status: status || undefined, companyId: companyId || undefined, search: searchParam || undefined, page } })).data,
    placeholderData: keepPreviousData,
  });
  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const totalAll = data ? Object.values(data.counts).reduce((a, b) => a + (b ?? 0), 0) : undefined;

  return (
    <div>
      <PageHead title={t('requests.admin.title')} subtitle={t('requests.admin.subtitle')} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={!status} onClick={() => setParam('status', '')} count={totalAll}>
          {t('requests.admin.allStatuses')}
        </Chip>
        {REQUEST_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setParam('status', s)} count={data?.counts[s] ?? 0}>
            {t(`requests.status.${s}`)}
          </Chip>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" placeholder={t('requests.admin.search')} aria-label={t('requests.admin.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto min-w-48" aria-label={t('requests.admin.company')} value={companyId} onChange={(e) => setParam('companyId', e.target.value)}>
          <option value="">{t('requests.admin.allCompanies')}</option>
          {data?.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : data.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ClipboardList} title={t('requests.admin.empty')} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-semibold">{t('requests.admin.request')}</th>
                <th className="px-4 py-3 font-semibold">{t('requests.admin.company')}</th>
                <th className="px-4 py-3 font-semibold">{t('requests.admin.quantity')}</th>
                <th className="w-48 px-4 py-3 font-semibold">{t('requests.admin.progress')}</th>
                <th className="px-4 py-3 font-semibold">{t('requests.admin.createdAt')}</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link to={`/admin/candidate-requests/${r.id}`} className="font-semibold text-ink hover:text-link">
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {r.profession}
                      {r.germanLevel ? ` · ${r.germanLevel}` : ''}
                      {r.drivingLicence ? ` · ${r.drivingLicence}` : ''}
                      {r.city ? ` · ${r.city}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink">{r.company.name}</td>
                  <td className="px-4 py-3 tabular-nums">{r.quantity}</td>
                  <td className="px-4 py-3">
                    <RequestProgressBar progress={r.progress} compact />
                    <p className="mt-1 text-[11px] text-muted tabular-nums">{t('requests.progress.of', { accepted: r.progress?.accepted ?? 0, quantity: r.quantity })}</p>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusPill status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))} aria-label="‹">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="tabular-nums text-muted">
            {page} / {pages}
          </span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))} aria-label="›">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Detail ────────────────────────────────────────────────────────────

const Def = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-line py-1.5 text-sm last:border-0">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-medium text-ink">{children || '—'}</dd>
  </div>
);

const RequestDetail = () => {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { tr } = useL10n();
  const L = useJobLabels();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...KEY, 'detail', id], queryFn: async () => (await api.get<DetailResponse>(`/admin/candidate-requests/${id}`)).data });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ status: 'OPEN' as RequestStatus, staffNote: '' });
  const r = q.data?.request;
  useEffect(() => {
    if (r) setForm({ status: r.status, staffNote: r.staffNote ?? '' });
  }, [r]);

  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const createVacancy = useMutation({
    mutationFn: async () => (await api.post(`/admin/candidate-requests/${id}/vacancy`, {})).data,
    onSuccess: () => {
      toast.success(t('requests.admin.vacancyCreated'));
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const propose = useMutation({
    mutationFn: async () => (await api.post<{ proposed: unknown[]; skipped: unknown[] }>(`/admin/candidate-requests/${id}/propose`, { userIds: [...selected] })).data,
    onSuccess: (res) => {
      toast.success(t('requests.admin.proposed', { count: res.proposed.length }));
      if (res.skipped.length) toast.info(t('requests.admin.skipped', { count: res.skipped.length }));
      setSelected(new Set());
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const save = useMutation({
    mutationFn: async () => (await api.patch(`/admin/candidate-requests/${id}`, { status: form.status, staffNote: form.staffNote.trim() || null })).data,
    onSuccess: () => {
      toast.success(t('requests.admin.saved'));
      refresh();
    },
    onError: (e) => toastError(e),
  });

  usePageTitle(r?.title ?? t('requests.admin.title'));
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data || !r) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { suggestions, applications } = q.data;
  const closed = r.status === 'CANCELLED' || r.status === 'FILLED';
  const selectable = suggestions.filter((s) => !s.application || !['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(s.application.status));
  const toggle = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  const allSelected = selectable.length > 0 && selectable.every((s) => selected.has(s.user.id));

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigate('/admin/candidate-requests')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t('requests.admin.back')}
      </button>
      <PageHead title={r.title} subtitle={`${r.company?.name ?? ''} · ${r.quantity} × ${r.profession}`} actions={<StatusPill status={r.status} />} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title={t('requests.admin.details')} icon={ClipboardList}>
            <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <Def label={t('requests.admin.company')}>
                {r.company && (
                  <Link to={`/admin/companies?id=${r.company.id}`} className="text-link hover:underline">
                    {r.company.name}
                  </Link>
                )}
              </Def>
              <Def label={t('requests.admin.createdBy')}>{r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : null}</Def>
              <Def label={t('requests.fields.profession')}>{r.profession}</Def>
              <Def label={t('requests.fields.quantity')}>{r.quantity}</Def>
              <Def label={t('requests.fields.germanLevel')}>{r.germanLevel ? L.german(r.germanLevel) : null}</Def>
              <Def label={t('requests.fields.drivingLicence')}>{r.drivingLicence}</Def>
              <Def label={t('requests.fields.minExperience')}>{r.minExperience ?? null}</Def>
              <Def label={t('requests.fields.city')}>{r.city}</Def>
              <Def label={t('requests.fields.visaCategory')}>{r.visaCategory ? `${r.visaCategory.visaLabel} · ${tr(r.visaCategory.title)}` : null}</Def>
              <Def label={t('requests.fields.startDate')}>{r.startDate ? fmtDate(r.startDate) : null}</Def>
              <Def label={t('requests.fields.salary')}>{L.salary(r.salaryMin, r.salaryMax)}</Def>
              <Def label={t('requests.admin.createdAt')}>{fmtDate(r.createdAt)}</Def>
            </dl>
            {r.notes && <p className="mt-4 rounded-lg bg-sunken p-3 text-sm whitespace-pre-line text-ink">{r.notes}</p>}
            <div className="mt-4">
              <RequestProgressBar progress={r.progress} />
            </div>
          </Panel>
        </div>
        <div className="space-y-5">
          <Panel title={t('requests.admin.vacancy')} icon={Briefcase}>
            {r.vacancy ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-ink">{tr(r.vacancy.title)}</p>
                <p className="text-xs text-muted">
                  {L.vacancyStatus(r.vacancy.status)} · {r.vacancy.positions}
                </p>
                <Link to={`/admin/vacancies?id=${r.vacancy.id}`} className="btn-secondary btn-sm">
                  <ExternalLink className="size-4" aria-hidden /> {t('requests.admin.openVacancy')}
                </Link>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted">{t('requests.admin.noVacancy')}</p>
                <button type="button" className="btn-primary btn-sm" disabled={createVacancy.isPending || r.status === 'CANCELLED'} onClick={() => createVacancy.mutate()}>
                  {createVacancy.isPending ? <Spinner className="size-4" /> : <Briefcase className="size-4" aria-hidden />} {t('requests.admin.createVacancy')}
                </button>
              </div>
            )}
          </Panel>
          <Panel title={t('requests.admin.staffBox')} icon={StickyNote}>
            <div className="space-y-3">
              <select className="input" aria-label={t('requests.admin.staffBox')} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as RequestStatus }))}>
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`requests.status.${s}`)}
                  </option>
                ))}
              </select>
              <label htmlFor="cr-note" className="block text-xs font-semibold text-muted">
                {t('requests.admin.staffNote')}
              </label>
              <textarea id="cr-note" className="input min-h-24" maxLength={5000} value={form.staffNote} onChange={(e) => setForm((f) => ({ ...f, staffNote: e.target.value }))} />
              <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Spinner className="size-4" />} {t('requests.admin.save')}
              </button>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        title={t('requests.admin.suggestions')}
        icon={Sparkles}
        actions={
          <>
            {selected.size > 0 && <span className="text-xs text-muted">{t('requests.admin.selected', { count: selected.size })}</span>}
            <button type="button" className="btn-primary btn-sm" disabled={!selected.size || propose.isPending || closed} onClick={() => propose.mutate()}>
              {propose.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('requests.admin.propose')}
            </button>
          </>
        }
      >
        <p className="-mt-1 mb-4 text-xs text-muted">{t('requests.admin.suggestionsHint')}</p>
        {suggestions.length === 0 ? (
          <EmptyState icon={Users} title={t('requests.admin.noSuggestions')} />
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="w-10 px-5 py-2">
                    <input
                      type="checkbox"
                      aria-label={t('requests.admin.propose')}
                      checked={allSelected}
                      disabled={closed || !selectable.length}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((s) => s.user.id)))}
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">{t('requests.admin.candidate')}</th>
                  <th className="px-3 py-2 font-semibold">{t('requests.admin.score')}</th>
                  <th className="px-3 py-2 font-semibold">{t('requests.admin.reasons')}</th>
                  <th className="px-5 py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const locked = !!s.application && ['PROPOSED', 'INTERVIEW', 'ACCEPTED'].includes(s.application.status);
                  const u = s.user;
                  return (
                    <tr key={u.id} className={clsx('border-b border-line last:border-0', selected.has(u.id) && 'bg-primary/[0.04]')}>
                      <td className="px-5 py-2.5 align-top">
                        <input type="checkbox" aria-label={`${u.firstName} ${u.lastName}`} checked={selected.has(u.id)} disabled={locked || closed} onChange={() => toggle(u.id)} />
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="font-semibold text-ink">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-muted">
                          {[u.profession, u.germanLevel, u.drivingLicence, u.experienceYears != null ? L.years(u.experienceYears) : null, u.city].filter(Boolean).join(' · ')}
                        </p>
                        {s.activeCase && <p className="mt-0.5 text-[11px] text-muted">{s.activeCase.number}</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className={clsx('badge tabular-nums', scoreTone(s.score))}>{s.score}</span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-wrap gap-1">
                          {s.reasons.map((code) => (
                            <span key={code} className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] text-success-fg ring-1 ring-success-border">
                              {t(`requests.admin.reason.${code}`)}
                            </span>
                          ))}
                          {s.gaps.map((g) => (
                            <span key={g.code} className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] text-warning-fg ring-1 ring-warning-border">
                              {L.gap(g)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right align-top whitespace-nowrap">
                        {s.application && <span className={clsx('badge mr-2', APPLICATION_STATUS_TONE[s.application.status])}>{L.appStatus(s.application.status)}</span>}
                        <Link to={`/admin/candidates?id=${u.id}`} className="text-xs font-semibold text-link hover:underline">
                          {t('requests.admin.profile')}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {applications.length > 0 && (
        <Panel title={t('requests.admin.applications')} icon={Users}>
          <ul className="divide-y divide-line">
            {applications.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link to={`/admin/candidates?id=${a.user.id}`} className="font-semibold text-ink hover:text-link">
                    {a.user.firstName} {a.user.lastName}
                  </Link>
                  <p className="text-xs text-muted">{[a.user.profession, a.user.germanLevel].filter(Boolean).join(' · ')}</p>
                  {a.companyNote && <p className="mt-0.5 text-xs text-ink/80 italic">“{a.companyNote}”</p>}
                </div>
                <div className="flex items-center gap-2">
                  {a.matchScore != null && <span className={clsx('badge tabular-nums', scoreTone(a.matchScore))}>{a.matchScore}</span>}
                  <span className={clsx('badge', APPLICATION_STATUS_TONE[a.status])}>{L.appStatus(a.status)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
};

/** Admin: employer bulk candidate requests (/admin/candidate-requests/*). */
export default function AdminCandidateRequests() {
  const { t } = useTranslation();
  usePageTitle(t('requests.admin.title'));
  return (
    <Routes>
      <Route index element={<RequestsList />} />
      <Route path=":id" element={<RequestDetail />} />
    </Routes>
  );
}
