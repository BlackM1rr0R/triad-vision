import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, SearchX, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesVacancyRequest } from '@/i18n/pagesVacancyRequest';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtDate, fmtDateTime } from '@/components/admin/labels';
import type { StaffMember } from '@/components/admin/types';
import { REQUEST_SECTORS, REQUEST_STATUSES, REQUEST_TYPES } from './VacancyRequestForm';

registerCopy(pagesVacancyRequest);

interface AdminRequest {
  id: string;
  type: string;
  sector: string | null;
  profession: string | null;
  city: string | null;
  germanLevel: string | null;
  note: string | null;
  status: (typeof REQUEST_STATUSES)[number];
  cancelled: boolean;
  isAccount: boolean;
  name: string | null;
  email: string | null;
  phone: string | null;
  contactMasked: boolean;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  staffNote: string | null;
  sourceVacancy: { id: string; slug: string; title: L10n } | null;
  offers: { source: string; sentAt: string; vacancy: { id: string; slug?: string; title?: L10n } }[];
  createdAt: string;
}
interface ListResponse {
  items: AdminRequest[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}

const KEY = 'admin-vacancy-requests';

/**
 * Admin › Vacancies › "Sorğular" (tab): the "Vakansiya sorğusu" requests of candidates (server lib/vacancyRequests): filter by
 * type / sector / status / assignee / date, set the status, a staff note and the assignee, and offer an open vacancy (the
 * requester gets a cabinet notification + e-mail with the apply link; the employer is never named; no case is created).
 */
export const VacancyRequestsPanel = () => {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({ type: '', sector: '', status: '', assigned: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (k: keyof typeof filters, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [KEY, filters, page],
    queryFn: async () => (await api.get<ListResponse>('/admin/vacancies/requests', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page } })).data,
    placeholderData: keepPreviousData,
  });
  const staff = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await api.get<{ staff: StaffMember[] }>('/admin/users/staff')).data.staff, staleTime: 300_000 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div data-testid="vreq-admin">
      <PageHead title={t('vreq.admin.title')} subtitle={t('vreq.admin.text')} />
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Chip active={!filters.status} onClick={() => set('status', '')}>
          {t('vreq.admin.allStatuses')}
        </Chip>
        {REQUEST_STATUSES.map((s) => (
          <Chip key={s} active={filters.status === s} onClick={() => set('status', filters.status === s ? '' : s)} count={data?.counts[s] ?? 0}>
            {t(`vreq.admin.status.${s}`)}
          </Chip>
        ))}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input type="search" aria-label={t('vreq.admin.search')} placeholder={t('vreq.admin.search')} className="input sm:col-span-2" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <select aria-label={t('vreq.type.label')} className="input" value={filters.type} onChange={(e) => set('type', e.target.value)}>
          <option value="">{t('vreq.admin.allTypes')}</option>
          {REQUEST_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`vreq.type.${k}`)}
            </option>
          ))}
        </select>
        <select aria-label={t('vreq.sector')} className="input" value={filters.sector} onChange={(e) => set('sector', e.target.value)}>
          <option value="">{t('vreq.admin.allSectors')}</option>
          {REQUEST_SECTORS.map((k) => (
            <option key={k} value={k}>
              {t(`vreq.sectors.${k}`)}
            </option>
          ))}
        </select>
        <select aria-label={t('vreq.admin.assignee')} className="input" value={filters.assigned} onChange={(e) => set('assigned', e.target.value)}>
          <option value="">{t('vreq.admin.anyone')}</option>
          <option value="none">{t('vreq.admin.unassigned')}</option>
          {staff.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t('vreq.admin.from')}
          <input type="date" className="input" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          {t('vreq.admin.to')}
          <input type="date" className="input" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={SearchX} title={t('vreq.admin.empty')} />
        </div>
      ) : (
        <ul className={clsx('divide-y divide-line rounded-xl border border-line bg-card', isFetching && 'opacity-70 transition-opacity')}>
          {data.items.map((r) => (
            <RequestRow key={r.id} r={r} staff={staff.data ?? []} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label={t('admin.common.pagination')}>
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('admin.common.prev')}>
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-xs text-muted">{t('admin.common.pageOf', { page, pages })}</span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={t('admin.common.next')}>
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
};

const RequestRow = ({ r, staff, open, onToggle }: { r: AdminRequest; staff: StaffMember[]; open: boolean; onToggle: () => void }) => {
  const { t } = useTranslation();
  const l10n = useL10n();
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ['alert-professions'], queryFn: async () => (await api.get<{ professions: { key: string; label: string }[] }>('/job-alerts/options', { params: { lng: 'az' } })).data.professions, staleTime: 3_600_000, enabled: open });
  const [note, setNote] = useState(r.staffNote ?? '');
  const [status, setStatus] = useState(r.status);
  const [assignee, setAssignee] = useState(r.assignedStaffId ?? '');
  const [vacancySearch, setVacancySearch] = useState('');
  const [vacancyId, setVacancyId] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: [KEY] });
  const errText = (err: unknown) => {
    const code = errorCode(err) ?? '';
    const known = ['ALREADY_OFFERED', 'VACANCY_CLOSED', 'NO_FREE_PLACES', 'REQUEST_CLOSED', 'REQUEST_CANCELLED', 'REQUESTER_INACTIVE'];
    return known.includes(code) ? t(`vreq.admin.errors.${code}`) : t('vreq.admin.errors.generic');
  };

  const vacancies = useQuery({
    queryKey: ['admin-vacancies', 'open-for-offer', vacancySearch],
    queryFn: async () => (await api.get<{ items: { id: string; title: L10n; city: string | null }[] }>('/admin/vacancies', { params: { status: 'OPEN', search: vacancySearch || undefined, page: 1 } })).data.items,
    enabled: open && r.status !== 'CLOSED',
  });

  const save = useMutation({
    mutationFn: async () => api.patch(`/admin/vacancies/requests/${r.id}`, { status, staffNote: note.trim() || null, assignedStaffId: assignee || null }),
    onSuccess: async () => {
      toast.success(t('vreq.admin.saved'));
      await refresh();
    },
    onError: (err) => toast.error(errText(err)),
  });
  const offer = useMutation({
    mutationFn: async () => (await api.post<{ delivered: boolean }>(`/admin/vacancies/requests/${r.id}/offer`, { vacancyId })).data,
    onSuccess: async (d) => {
      toast.success(d.delivered ? t('vreq.admin.offered') : t('vreq.admin.offeredNoMail'));
      setVacancyId('');
      await refresh();
    },
    onError: (err) => toast.error(errText(err)),
  });

  const prof = r.profession ? (options.data?.find((p) => p.key === r.profession)?.label ?? r.profession) : null;
  const want = [t(`vreq.type.${r.type}`), r.sector ? t(`vreq.sectors.${r.sector}`) : null, prof, r.city].filter(Boolean).join(' · ');

  return (
    <li>
      <button type="button" className="grid w-full gap-1 px-4 py-3 text-left hover:bg-sunken sm:grid-cols-[1.2fr_1.6fr_auto_auto] sm:items-center sm:gap-4" aria-expanded={open} onClick={onToggle}>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{r.name || '—'}</span>
          <span className="block truncate text-xs text-muted">
            {r.isAccount ? t('vreq.admin.account') : t('vreq.admin.guest')}
            {r.contactMasked ? ` · ${t('vreq.admin.masked')}` : ''}
          </span>
        </span>
        <span className="min-w-0 truncate text-sm text-ink">{want}</span>
        <span className={clsx('w-fit rounded-full px-2.5 py-1 text-xs font-semibold', r.status === 'OFFERED' ? 'bg-success-bg text-success-fg' : r.status === 'CLOSED' ? 'bg-sunken text-muted' : 'chip-soft')}>{t(`vreq.admin.status.${r.status}`)}</span>
        <span className="text-xs whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-line bg-canvas px-4 py-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold text-muted">{t('vreq.email')}</dt>
              <dd className="break-all text-ink">{r.email || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">{t('vreq.phone')}</dt>
              <dd className="text-ink">{r.phone || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted">{t('vreq.german')}</dt>
              <dd className="text-ink">{r.germanLevel || '—'}</dd>
            </div>
            {r.note && (
              <div className="sm:col-span-3">
                <dt className="text-xs font-semibold text-muted">{t('vreq.note')}</dt>
                <dd className="whitespace-pre-line text-ink">{r.note}</dd>
              </div>
            )}
            {r.sourceVacancy && (
              <div className="sm:col-span-3 text-xs text-muted">
                {t('vreq.admin.fromVacancy')}: <span className="font-semibold text-ink">{l10n.tr(r.sourceVacancy.title)}</span>
              </div>
            )}
            {r.cancelled && <div className="sm:col-span-3 text-xs font-semibold text-danger-fg">{t('vreq.admin.cancelledByUser')}</div>}
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`st-${r.id}`}>
                {t('vreq.admin.allStatuses')}
              </label>
              <select id={`st-${r.id}`} className="input" value={status} disabled={r.cancelled} onChange={(e) => setStatus(e.target.value as AdminRequest['status'])}>
                {REQUEST_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`vreq.admin.status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`as-${r.id}`}>
                {t('vreq.admin.assignee')}
              </label>
              <select id={`as-${r.id}`} className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">{t('vreq.admin.unassigned')}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor={`nt-${r.id}`}>
                {t('vreq.admin.note')}
              </label>
              <textarea id={`nt-${r.id}`} className="input min-h-20" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {t('vreq.admin.save')}
          </button>

          <div className="rounded-xl border border-line bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Users className="size-4 text-muted" aria-hidden /> {t('vreq.admin.offersTitle')}
            </h3>
            {r.offers.length === 0 ? (
              <p className="mt-1 text-sm text-muted">{t('vreq.admin.noOffers')}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {r.offers.map((o) => (
                  <li key={o.vacancy.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{o.vacancy.title ? l10n.tr(o.vacancy.title) : o.vacancy.id}</span>
                    <span className="text-xs text-muted">
                      {o.source === 'STAFF' ? t('vreq.admin.offerStaff') : t('vreq.admin.offerAuto')} · {fmtDateTime(o.sentAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {r.status !== 'CLOSED' && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="text-sm font-semibold text-ink">{t('vreq.admin.offerTitle')}</p>
                <p className="mt-1 text-xs text-muted">{t('vreq.admin.offerHint')}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
                  <input type="search" className="input" aria-label={t('vreq.admin.search')} placeholder={t('vreq.admin.offerPick')} value={vacancySearch} onChange={(e) => setVacancySearch(e.target.value)} />
                  <select className="input" aria-label={t('vreq.admin.offerPick')} value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
                    <option value="">{t('vreq.admin.offerPick')}</option>
                    {vacancies.data?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {l10n.tr(v.title)}
                        {v.city ? ` · ${v.city}` : ''}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-primary btn-sm" disabled={!vacancyId || offer.isPending} onClick={() => offer.mutate()}>
                    <Send className="size-3.5" aria-hidden /> {t('vreq.admin.offerSend')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
};
