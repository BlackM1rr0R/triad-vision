import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Ban, CalendarDays, Check, ChevronLeft, ChevronRight, List, Plus, Search, Trash2, UserX, Video } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { Drawer } from '@/components/admin/Drawer';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, fullName, toLocalInput } from '@/components/admin/labels';
import { InterviewCard, InterviewStatusBadge } from '@/components/ops/InterviewCard';
import { InterviewEvaluations } from '@/components/placement/Evaluations';
import { INTERVIEW_DOT, INTERVIEW_STATUSES, addDays, defaultStart, fmtTime, sameDay, startOfWeek, toastOpsError, type Interview, type InterviewStatus } from '@/components/ops/shared';

registerCopy(pagesOps);

interface Staff { id: string; firstName: string; lastName: string }
interface CompanyOption { id: string; name: string; city: string | null; status: string }
interface CandidateHit { id: string; firstName: string; lastName: string; email: string; profession: string | null; city: string | null }
interface CandidateDetail {
  id: string;
  firstName: string;
  lastName: string;
  applications: { id: string; status: string; vacancy: { id: string; title: L10n; companyId: string | null; company: { name: string } | null } }[];
}

const useInterviews = (params: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return useQuery({
    queryKey: ['interviews', qs],
    queryFn: async () => (await api.get<{ items: Interview[] }>(`/interviews${qs ? `?${qs}` : ''}`)).data.items,
    refetchInterval: 60_000,
  });
};

// ─── Create modal ──────────────────────────────────────────────────────

const CreateModal = ({ open, onClose, onCreated, staff, companies }: { open: boolean; onClose: () => void; onCreated: () => void; staff: Staff[]; companies: CompanyOption[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const [search, setSearch] = useState('');
  const [candidate, setCandidate] = useState<CandidateHit | null>(null);
  const [applicationId, setApplicationId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [minutes, setMinutes] = useState(45);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setCandidate(null);
    setApplicationId('');
    setCompanyId('');
    setStaffId('');
    setStartsAt(defaultStart());
    setMinutes(45);
    setNotes('');
  }, [open]);

  const hits = useQuery({
    queryKey: ['interview-candidate-search', search],
    queryFn: async () => (await api.get<{ items: CandidateHit[] }>(`/admin/candidates?search=${encodeURIComponent(search)}`)).data.items,
    enabled: open && search.trim().length >= 2 && !candidate,
  });
  const detail = useQuery({
    queryKey: ['interview-candidate', candidate?.id],
    queryFn: async () => (await api.get<{ candidate: CandidateDetail }>(`/admin/candidates/${candidate!.id}`)).data.candidate,
    enabled: !!candidate,
  });
  const applications = detail.data?.applications.filter((a) => !['WITHDRAWN', 'REJECTED'].includes(a.status)) ?? [];

  const create = useMutation({
    mutationFn: () =>
      api.post('/interviews', {
        candidateId: candidate!.id,
        applicationId: applicationId || undefined,
        companyId: applicationId ? undefined : companyId || null,
        staffId: staffId || undefined,
        startsAt: new Date(startsAt).toISOString(),
        minutes,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t('ops.interviews.created'));
      onCreated();
      onClose();
    },
    onError: toastOpsError,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ops.interviews.new')}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('ops.common.cancel')}</button>
          <button type="button" className="btn-primary btn-sm" disabled={!candidate || !startsAt || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('ops.common.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="iv-cand">{t('ops.interviews.fields.candidate')}</label>
          {candidate ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface/50 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-semibold text-ink">{fullName(candidate)}</span> <span className="text-muted">· {candidate.email}{candidate.profession ? ` · ${candidate.profession}` : ''}</span>
              </span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => { setCandidate(null); setApplicationId(''); }}>{t('ops.common.edit')}</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input id="iv-cand" data-autofocus className="input pl-9" placeholder={t('ops.interviews.searchCandidate')} value={search} onChange={(e) => setSearch(e.target.value)} />
              {search.trim().length >= 2 && (
                <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-card text-sm shadow-[var(--tv-shadow-raised)]">
                  {hits.isLoading && <li className="px-3 py-2 text-muted">…</li>}
                  {hits.data?.length === 0 && <li className="px-3 py-2 text-muted">{t('ops.interviews.noCandidates')}</li>}
                  {hits.data?.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sunken" onClick={() => setCandidate(c)}>
                        <span className="min-w-0 truncate"><span className="font-medium text-ink">{fullName(c)}</span> <span className="text-muted">· {c.email}</span></span>
                        <span className="shrink-0 text-xs text-muted">{c.profession ?? ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="iv-app">{t('ops.interviews.fields.application')}</label>
            <select id="iv-app" className="input" value={applicationId} disabled={!candidate} onChange={(e) => setApplicationId(e.target.value)}>
              <option value="">{t('ops.interviews.fields.noApplication')}</option>
              {applications.map((a) => (
                <option key={a.id} value={a.id}>{tr(a.vacancy.title)}{a.vacancy.company ? ` · ${a.vacancy.company.name}` : ''} ({a.status})</option>
              ))}
            </select>
            {candidate && detail.data && <p className="mt-1 text-[11px] text-muted">{t('ops.interviews.applications', { count: applications.length })}</p>}
          </div>
          <div>
            <label className="label" htmlFor="iv-company">{t('ops.interviews.fields.company')}</label>
            <select id="iv-company" className="input" value={companyId} disabled={!!applicationId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{t('ops.interviews.fields.noCompany')}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.city ? ` · ${c.city}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="iv-start">{t('ops.interviews.fields.startsAt')}</label>
            <input id="iv-start" type="datetime-local" className="input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="iv-min">{t('ops.interviews.fields.minutes')}</label>
            <select id="iv-min" className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="iv-staff">{t('ops.interviews.fields.staff')}</label>
            <select id="iv-staff" className="input" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">—</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="iv-notes">{t('ops.interviews.fields.notes')}</label>
            <textarea id="iv-notes" rows={3} className="input" maxLength={4000} placeholder={t('ops.interviews.fields.notesPh')} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted">{t('ops.interviews.timezone')}</p>
      </div>
    </Modal>
  );
};

// ─── Detail drawer ─────────────────────────────────────────────────────

const DetailDrawer = ({ interview: i, onClose, staff }: { interview: Interview | null; onClose: () => void; staff: Staff[] }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [reschedule, setReschedule] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setNotes(i?.notes ?? '');
    setReschedule(null);
    setCancelReason(null);
  }, [i]);
  const done = () => void qc.invalidateQueries({ queryKey: ['interviews'] });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/interviews/${i!.id}`, body),
    onSuccess: () => {
      toast.success(t('ops.interviews.updated'));
      done();
      setReschedule(null);
      setCancelReason(null);
    },
    onError: toastOpsError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/interviews/${i!.id}`),
    onSuccess: () => {
      toast.success(t('ops.interviews.deleted'));
      setConfirmDelete(false);
      done();
      onClose();
    },
    onError: toastOpsError,
  });

  if (!i) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const live = i.status === 'PROPOSED' || i.status === 'CONFIRMED';
  const started = new Date(i.startsAt).getTime() <= Date.now();
  return (
    <Drawer open={!!i} onClose={onClose} title={<span className="flex items-center gap-2">{i.candidate.name} <InterviewStatusBadge status={i.status} /></span>}>
      <div className="space-y-5">
        <InterviewCard interview={i} audience="staff" compact />

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">{t('ops.interviews.fields.candidate')}</dt><dd><Link to={`/admin/candidates?id=${i.candidate.id}`} className="font-medium text-link hover:underline">{i.candidate.name}</Link></dd></div>
          <div><dt className="text-xs text-muted">{t('ops.interviews.fields.company')}</dt><dd>{i.company ? <Link to={`/admin/companies?id=${i.company.id}`} className="font-medium text-link hover:underline">{i.company.name}</Link> : t('ops.interviews.fields.noCompany')}</dd></div>
          <div><dt className="text-xs text-muted">{t('ops.interviews.fields.application')}</dt><dd>{i.application ? <Link to={`/admin/vacancies?id=${i.application.vacancy.id}`} className="font-medium text-link hover:underline">{tr(i.application.vacancy.title)}</Link> : '—'}</dd></div>
          <div><dt className="text-xs text-muted">{t('ops.interviews.fields.createdBy')}</dt><dd>{i.createdBy?.name ?? '—'} · {fmtDateTime(i.createdAt)}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">{t('ops.interviews.fields.meeting')}</dt>
            <dd className="truncate code-id text-xs">{i.meetingUrl ?? '—'}</dd>
          </div>
        </dl>

        {live && (
          <div className="flex flex-wrap gap-2">
            {i.status === 'PROPOSED' && (
              <button type="button" className="btn-primary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'CONFIRMED' })}>
                <Check className="size-3.5" /> {t('ops.interviews.actions.confirm')}
              </button>
            )}
            <button type="button" className="btn-secondary btn-sm" onClick={() => setReschedule(toLocalInput(i.startsAt))}>
              <CalendarDays className="size-3.5" /> {t('ops.interviews.actions.reschedule')}
            </button>
            {started && (
              <>
                <button type="button" className="btn-secondary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'DONE' })}>
                  <Video className="size-3.5" /> {t('ops.interviews.actions.done')}
                </button>
                <button type="button" className="btn-secondary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'NO_SHOW' })}>
                  <UserX className="size-3.5" /> {t('ops.interviews.actions.noShow')}
                </button>
              </>
            )}
            <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setCancelReason('')}>
              <Ban className="size-3.5" /> {t('ops.interviews.actions.cancel')}
            </button>
          </div>
        )}

        {reschedule !== null && (
          <div className="rounded-xl border border-line bg-surface/50 p-4">
            <label className="label" htmlFor="iv-re">{t('ops.interviews.fields.newTime')}</label>
            <div className="flex flex-wrap gap-2">
              <input id="iv-re" type="datetime-local" className="input w-auto" value={reschedule} onChange={(e) => setReschedule(e.target.value)} />
              <button type="button" className="btn-primary btn-sm" disabled={!reschedule || patch.isPending} onClick={() => patch.mutate({ startsAt: new Date(reschedule).toISOString() })}>
                {t('ops.common.save')}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setReschedule(null)}>{t('ops.common.cancel')}</button>
            </div>
          </div>
        )}
        {cancelReason !== null && (
          <div className="rounded-xl border border-danger-border bg-danger-bg/50 p-4">
            <label className="label" htmlFor="iv-cr">{t('ops.interviews.fields.reason')}</label>
            <textarea id="iv-cr" rows={2} className="input" maxLength={2000} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-danger btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ status: 'CANCELLED', reason: cancelReason.trim() || undefined })}>
                {t('ops.interviews.cancelTitle')}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCancelReason(null)}>{t('ops.common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Structured evaluations (employer + team); possible once the interview started. */}
        {i.status !== 'CANCELLED' && (
          <div className="rounded-xl border border-line p-4">
            <InterviewEvaluations interviewId={i.id} canDeleteAll />
          </div>
        )}

        <div>
          <label className="label" htmlFor="iv-staff2">{t('ops.interviews.fields.staff')}</label>
          <select id="iv-staff2" className="input" value={i.staff?.id ?? ''} disabled={patch.isPending} onChange={(e) => patch.mutate({ staffId: e.target.value || null })}>
            <option value="">—</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="iv-notes2">{t('ops.interviews.fields.notes')}</label>
          <textarea id="iv-notes2" rows={4} className="input" maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button type="button" className="btn-secondary btn-sm mt-2 border border-line" disabled={notes === (i.notes ?? '') || patch.isPending} onClick={() => patch.mutate({ notes })}>
            {t('ops.interviews.actions.saveNotes')}
          </button>
        </div>

        <div className="border-t border-line pt-4">
          <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-3.5" /> {t('ops.interviews.actions.delete')}
          </button>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => remove.mutate()} title={t('ops.interviews.confirmDelete')} message={t('ops.interviews.confirmDeleteText')} loading={remove.isPending} />
    </Drawer>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function Interviews() {
  const { t } = useTranslation();
  usePageTitle(t('ops.interviews.title'));
  const qc = useQueryClient();
  const [view, setView] = useState<'week' | 'list'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [status, setStatus] = useState<InterviewStatus | ''>('');
  const [companyId, setCompanyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range = view === 'week' ? { from: weekStart.toISOString(), to: addDays(weekStart, 7).toISOString() } : {};
  const { data, isLoading, error, refetch } = useInterviews({ ...range, status, companyId });
  const { data: staff } = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await api.get<{ staff: Staff[] }>('/admin/users/staff')).data.staff, staleTime: 300_000 });
  const { data: companies } = useQuery({ queryKey: ['company-options'], queryFn: async () => (await api.get<{ items: CompanyOption[] }>('/admin/companies/options')).data.items, staleTime: 300_000 });

  const items = data ?? [];
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = new Date();
  const weekdays = t('ops.interviews.weekdays', { returnObjects: true }) as string[];

  return (
    <div className="space-y-5">
      <PageHead
        title={t('ops.interviews.title')}
        subtitle={t('ops.interviews.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" /> {t('ops.interviews.new')}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-sunken p-0.5">
          {(['week', 'list'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} className={clsx('inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition', view === v ? 'bg-card text-ink shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink')}>
              {v === 'week' ? <CalendarDays className="size-3.5" /> : <List className="size-3.5" />} {t(`ops.interviews.views.${v}`)}
            </button>
          ))}
        </div>
        {view === 'week' && (
          <div className="flex items-center gap-1">
            <button type="button" className="grid size-9 place-items-center rounded-lg border border-line bg-card hover:bg-sunken" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label={t('ops.interviews.prevWeek')}><ChevronLeft className="size-4" /></button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>{t('ops.interviews.today')}</button>
            <button type="button" className="grid size-9 place-items-center rounded-lg border border-line bg-card hover:bg-sunken" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label={t('ops.interviews.nextWeek')}><ChevronRight className="size-4" /></button>
            <span className="ml-2 text-sm font-semibold text-ink">{t('ops.interviews.weekOf', { from: fmtDate(days[0]), to: fmtDate(days[6]) })}</span>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip active={status === ''} onClick={() => setStatus('')}>{t('ops.interviews.anyStatus')}</Chip>
          {INTERVIEW_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? '' : s)}>{t(`ops.interviews.status.${s}`)}</Chip>
          ))}
          <select className="input h-10 w-auto min-w-40 py-1 text-xs sm:h-8" value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label={t('ops.interviews.fields.company')}>
            <option value="">{t('ops.common.all')}</option>
            {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : view === 'week' ? (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[56rem] grid-cols-7 gap-2">
            {days.map((d, idx) => {
              const dayItems = items.filter((i) => sameDay(new Date(i.startsAt), d)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              const isToday = sameDay(d, today);
              return (
                <section key={idx} className={clsx('flex min-h-64 flex-col rounded-xl border bg-card', isToday ? 'border-line-strong' : 'border-line')}>
                  <header className={clsx('rounded-t-xl px-3 py-2 text-xs font-semibold', isToday ? 'bg-primary/[0.06] text-link' : 'bg-surface/60 text-ink')}>
                    {weekdays[idx]} <span className="ml-1 font-normal text-muted">{fmtDate(d)}</span>
                  </header>
                  <div className="flex-1 space-y-1.5 p-2">
                    {dayItems.map((i) => (
                      <button key={i.id} type="button" onClick={() => setSelectedId(i.id)} className={clsx('block w-full rounded-lg border border-line px-2 py-1.5 text-left text-xs transition hover:border-line-strong', i.status === 'CANCELLED' && 'opacity-60')}>
                        <span className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-ink tabular-nums">{fmtTime(i.startsAt)}</span>
                          <span className={clsx('size-2 rounded-full', INTERVIEW_DOT[i.status])} aria-hidden />
                        </span>
                        <span className="block truncate text-ink/90">{i.candidate.name}</span>
                        {i.company && <span className="block truncate text-[11px] text-muted">{i.company.name}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : items.length === 0 ? (
        <Panel><EmptyState icon={Video} title={t('ops.interviews.emptyList')} /></Panel>
      ) : (
        <div className="space-y-6">
          {(['upcoming', 'past'] as const).map((group) => {
            const now = Date.now();
            const rows = items.filter((i) => (group === 'upcoming' ? new Date(i.endsAt).getTime() >= now && i.status !== 'CANCELLED' : new Date(i.endsAt).getTime() < now || i.status === 'CANCELLED'));
            if (!rows.length) return null;
            const sorted = group === 'upcoming' ? rows : [...rows].reverse();
            return (
              <section key={group}>
                <h2 className="mb-3 text-sm font-bold text-ink">{t(`ops.interviews.${group}`)} <span className="font-normal text-muted">· {t('ops.interviews.count', { count: rows.length })}</span></h2>
                <ul className="grid gap-3 lg:grid-cols-2">
                  {sorted.map((i) => (
                    <li key={i.id}><InterviewCard interview={i} audience="staff" compact onOpen={() => setSelectedId(i.id)} actions={<button type="button" className="btn-secondary btn-sm ml-auto border border-line" onClick={() => setSelectedId(i.id)}>{t('ops.common.edit')}</button>} /></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={() => void qc.invalidateQueries({ queryKey: ['interviews'] })} staff={staff ?? []} companies={companies ?? []} />
      <DetailDrawer interview={selected} onClose={() => setSelectedId(null)} staff={staff ?? []} />
    </div>
  );
}
