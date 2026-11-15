import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ClipboardList, Eye, Search, ShieldCheck, UsersRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPool } from '@/i18n/pagesPool';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { TONE_CLASS } from '@/components/ui/status';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDate, fmtDateTime, toastError } from '@/components/admin/labels';
import { PoolCardView } from '@/components/pool/PoolCardView';
import { INTEREST_TONE, POOL_INTEREST_STATUSES, splitList, type PoolCard, type PoolInterestStatus } from '@/components/pool/types';

registerCopy(pagesPool);

const KEY = ['admin-candidate-pool'] as const;
const STATES = ['visible', 'awaiting', 'hidden', 'withdrawn', 'all'] as const;
type State = (typeof STATES)[number];

interface ActiveCase {
  id: string;
  number: string;
  status: string;
}

interface ProfileRow {
  userId: string;
  code: string;
  name: string;
  email: string;
  profession: string | null;
  germanLevel: string | null;
  visible: boolean;
  consentAt: string | null;
  consentVersion: string | null;
  withdrawnAt: string | null;
  staffReady: boolean;
  hidden: boolean;
  hasSummary: boolean;
  interests: number;
  views30d: number;
  activeCase: ActiveCase | null;
}

interface InterestRow {
  id: string;
  status: PoolInterestStatus;
  positions: number;
  message: string | null;
  staffNote: string | null;
  createdAt: string;
  company: { id: string; name: string; status: string; city: string | null };
  createdBy: { id: string; firstName: string; lastName: string; email: string } | null;
  candidate: { userId: string; code: string; name: string; profession: string | null; stillVisible: boolean };
  activeCase: ActiveCase | null;
}

interface Detail {
  user: { id: string; name: string; email: string; profession: string | null };
  profile: {
    code: string;
    staffReady: boolean;
    hidden: boolean;
    hiddenReason: string | null;
    summary: string | null;
    skills: unknown;
    professions: unknown;
    consentAt: string | null;
    consentVersion: string | null;
    visible: boolean;
  };
  card: PoolCard;
  consentLog: { granted: boolean; version: string; source: string; createdAt: string }[];
  views30d: number;
  recentViews: { id: string; createdAt: string; company: { id: string; name: string } }[];
  activeCase: ActiveCase | null;
}

const asList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

const ClientLinks = ({ userId, activeCase }: { userId: string; activeCase: ActiveCase | null }) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <Link to={`/admin/clients/${userId}`} className="font-semibold text-link hover:underline">
        {t('pool.admin.open360')}
      </Link>
      {activeCase && (
        <Link to={`/admin/cases/${activeCase.id}`} className="font-semibold text-link hover:underline">
          {t('pool.admin.openCase', { number: activeCase.number })}
        </Link>
      )}
    </span>
  );
};

// ─── Staff editor of one pool entry ─────────────────────────────────────

const ProfileEditor = ({ userId, onClose }: { userId: string; onClose: () => void }) => {
  const { t } = useTranslation();
  const a = (k: string) => t(`pool.admin.${k}`);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...KEY, 'detail', userId], queryFn: async () => (await api.get<Detail>(`/admin/candidate-pool/${userId}`)).data });
  const [f, setF] = useState({ staffReady: false, hidden: false, hiddenReason: '', summary: '', skills: '', professions: '' });
  useEffect(() => {
    const p = q.data?.profile;
    if (p) setF({ staffReady: p.staffReady, hidden: p.hidden, hiddenReason: p.hiddenReason ?? '', summary: p.summary ?? '', skills: asList(p.skills).join(', '), professions: asList(p.professions).join(', ') });
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<Detail>(`/admin/candidate-pool/${userId}`, {
          staffReady: f.staffReady,
          hidden: f.hidden,
          hiddenReason: f.hiddenReason.trim() || null,
          summary: f.summary.trim() || null,
          skills: splitList(f.skills, 12),
          professions: splitList(f.professions, 3),
        })
      ).data,
    onSuccess: (d) => {
      qc.setQueryData([...KEY, 'detail', userId], d);
      void qc.invalidateQueries({ queryKey: [...KEY, 'list'] });
      toast.success(a('saved'));
    },
    onError: (e) => toastError(e),
  });

  return (
    <Panel
      title={q.data ? `${q.data.user.name} · ${q.data.profile.code}` : a('edit')}
      icon={UsersRound}
      actions={
        <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label={a('close')}>
          <X className="size-4" aria-hidden />
        </button>
      }
    >
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <ClientLinks userId={userId} activeCase={q.data.activeCase} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.staffReady} onChange={(e) => setF({ ...f, staffReady: e.target.checked })} />
              {a('staffReady')}
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} />
              {a('hide')}
            </label>
            {f.hidden && (
              <div>
                <label className="label" htmlFor="pool-hidden-reason">
                  {a('hiddenReason')}
                </label>
                <input id="pool-hidden-reason" className="input" maxLength={300} value={f.hiddenReason} onChange={(e) => setF({ ...f, hiddenReason: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="pool-summary">
                {a('summary')}
              </label>
              <textarea id="pool-summary" className="input min-h-28" maxLength={1200} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="pool-skills">
                {a('skills')}
              </label>
              <input id="pool-skills" className="input" maxLength={600} value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="pool-profs">
                {a('professions')}
              </label>
              <input id="pool-profs" className="input" maxLength={260} value={f.professions} onChange={(e) => setF({ ...f, professions: e.target.value })} />
            </div>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              {save.isPending && <Spinner className="size-4" />} {a('save')}
            </button>
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted">{a('consentLog')}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-ink">
                {q.data.consentLog.length === 0 && <li className="text-muted">—</li>}
                {q.data.consentLog.map((c, i) => (
                  <li key={i}>
                    {fmtDateTime(c.createdAt)} · {c.granted ? a('granted') : a('withdrawn')} · {c.version} · {c.source}
                  </li>
                ))}
              </ul>
            </div>
            {q.data.recentViews.length > 0 && (
              <div className="pt-1">
                <p className="text-xs font-semibold text-muted">
                  {a('recent')} ({q.data.views30d} / 30 d)
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink">
                  {q.data.recentViews.slice(0, 10).map((v) => (
                    <li key={v.id}>
                      {fmtDateTime(v.createdAt)} · {v.company.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Eye className="size-3.5" aria-hidden /> {a('preview')} — {q.data.profile.visible ? a('visible') : a('notVisible')}
            </p>
            <PoolCardView card={q.data.card} detailed />
          </div>
        </div>
      )}
    </Panel>
  );
};

// ─── Tabs ───────────────────────────────────────────────────────────────

const ProfilesTab = () => {
  const { t } = useTranslation();
  const a = (k: string) => t(`pool.admin.${k}`);
  const [params, setParams] = useSearchParams();
  const state = (STATES as readonly string[]).includes(params.get('state') ?? '') ? (params.get('state') as State) : 'visible';
  const open = params.get('user');
  const [search, setSearch] = useState(params.get('search') ?? '');
  const searchParam = params.get('search') ?? '';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  useEffect(() => {
    const id = setTimeout(() => search.trim() !== searchParam && setParam('search', search.trim()), 350);
    return () => clearTimeout(id);
  });
  const q = useQuery({
    queryKey: [...KEY, 'list', state, searchParam],
    queryFn: async () => (await api.get<{ items: ProfileRow[]; total: number; counts: Record<string, number> }>('/admin/candidate-pool', { params: { state, search: searchParam || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATES.map((s) => (
          <Chip key={s} active={state === s} onClick={() => setParam('state', s === 'visible' ? '' : s)} count={s === 'all' ? undefined : (q.data?.counts[s] ?? 0)}>
            {a(`states.${s}`)}
          </Chip>
        ))}
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-9" placeholder={a('search')} aria-label={a('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {open && <ProfileEditor key={open} userId={open} onClose={() => setParam('user', '')} />}
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={UsersRound} title={a('empty')} />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-semibold">{a('cols.candidate')}</th>
                <th className="px-4 py-3 font-semibold">{a('cols.code')}</th>
                <th className="px-4 py-3 font-semibold">{a('cols.status')}</th>
                <th className="px-4 py-3 font-semibold">{a('cols.consent')}</th>
                <th className="px-4 py-3 font-semibold">{a('cols.views')}</th>
                <th className="px-4 py-3 font-semibold">{a('cols.interests')}</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((r) => (
                <tr key={r.userId} className="border-b border-line last:border-0 hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{r.name}</p>
                    <p className="text-xs text-muted">
                      {r.profession ?? '—'}
                      {r.germanLevel ? ` · ${r.germanLevel}` : ''}
                    </p>
                    <ClientLinks userId={r.userId} activeCase={r.activeCase} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      <span className={clsx('badge', r.visible ? TONE_CLASS.success : TONE_CLASS.neutral)}>{r.visible ? a('visible') : a('notVisible')}</span>
                      {r.staffReady && <span className={clsx('badge', TONE_CLASS.info)}>{a('ready')}</span>}
                      {r.hidden && <span className={clsx('badge', TONE_CLASS.warning)}>{a('hidden')}</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.consentAt ? (
                      <>
                        <ShieldCheck className="mr-1 inline size-3.5 text-success-fg" aria-hidden />
                        {fmtDate(r.consentAt)}
                        <span className="block text-muted">{r.consentVersion}</span>
                      </>
                    ) : r.withdrawnAt ? (
                      <span className="text-muted">
                        {a('withdrawn')} {fmtDate(r.withdrawnAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{r.views30d}</td>
                  <td className="px-4 py-3 tabular-nums">{r.interests}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setParam('user', r.userId)}>
                      {a('edit')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const InterestItem = ({ r, highlight }: { r: InterestRow; highlight: boolean }) => {
  const { t } = useTranslation();
  const a = (k: string, o?: Record<string, unknown>) => t(`pool.admin.${k}`, o);
  const qc = useQueryClient();
  const [note, setNote] = useState(r.staffNote ?? '');
  const m = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/candidate-pool/interests/${r.id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'interests'] });
      toast.success(a('saved'));
    },
    onError: (e) => toastError(e),
  });
  return (
    <li className={clsx('rounded-xl border bg-card p-4', highlight ? 'border-primary' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink">
            {r.company.name} → {r.candidate.name} <span className="font-mono text-xs text-muted">{r.candidate.code}</span>
          </p>
          <p className="text-xs text-muted">
            {fmtDateTime(r.createdAt)} · {a('cols.positions')}: {r.positions} · {r.candidate.profession ?? '—'} · {r.candidate.stillVisible ? a('stillVisible') : a('goneNow')}
            {r.createdBy ? ` · ${a('by')}: ${r.createdBy.firstName} ${r.createdBy.lastName} (${r.createdBy.email})` : ''}
          </p>
          <ClientLinks userId={r.candidate.userId} activeCase={r.activeCase} />
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="sr-only">{a('setStatus')}</span>
          <span className={clsx('badge', INTEREST_TONE[r.status])}>{t(`pool.interestStatus.${r.status}`)}</span>
          <select className="input w-auto py-1 text-xs" value={r.status} disabled={m.isPending} aria-label={a('setStatus')} onChange={(e) => m.mutate({ status: e.target.value })}>
            {POOL_INTEREST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`pool.interestStatus.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {r.message && (
        <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm break-words text-ink">
          <span className="text-xs text-muted">{a('message')}: </span>
          {r.message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor={`note-${r.id}`}>
            {a('staffNote')}
          </label>
          <input id={`note-${r.id}`} className="input" maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button type="button" className="btn-ghost btn-sm" disabled={m.isPending || note === (r.staffNote ?? '')} onClick={() => m.mutate({ staffNote: note.trim() || null })}>
          {a('save')}
        </button>
      </div>
    </li>
  );
};

const InterestsTab = () => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = (POOL_INTEREST_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as PoolInterestStatus) : '';
  const highlight = params.get('id');
  const q = useQuery({
    queryKey: [...KEY, 'interests', status],
    queryFn: async () => (await api.get<{ items: InterestRow[]; counts: Record<string, number> }>('/admin/candidate-pool/interests', { params: { status: status || undefined } })).data,
    placeholderData: keepPreviousData,
  });
  const setStatus = (s: string) => {
    const next = new URLSearchParams(params);
    if (s) next.set('status', s);
    else next.delete('status');
    setParams(next, { replace: true });
  };
  const total = q.data ? Object.values(q.data.counts).reduce((x, y) => x + y, 0) : undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!status} onClick={() => setStatus('')} count={total}>
          {t('pool.admin.states.all')}
        </Chip>
        {POOL_INTEREST_STATUSES.map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={q.data?.counts[s] ?? 0}>
            {t(`pool.interestStatus.${s}`)}
          </Chip>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.isError || !q.data ? (
        <ErrorBlock error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={ClipboardList} title={t('pool.admin.empty')} />
        </div>
      ) : (
        <ul className="space-y-3">
          {q.data.items.map((r) => (
            <InterestItem key={r.id} r={r} highlight={r.id === highlight} />
          ))}
        </ul>
      )}
    </div>
  );
};

interface ViewsResponse {
  items: { company: { id: string; name: string; status: string }; details: Record<'d1' | 'd7' | 'd30', number>; searches: Record<'d1' | 'd7' | 'd30', number> }[];
  recent: { id: string; kind: string; results: number; createdAt: string; company: { id: string; name: string }; profile: { code: string } | null; viewer: { firstName: string; lastName: string; email: string } | null }[];
}

const ViewsTab = () => {
  const { t } = useTranslation();
  const a = (k: string) => t(`pool.admin.${k}`);
  const q = useQuery({ queryKey: [...KEY, 'views'], queryFn: async () => (await api.get<ViewsResponse>('/admin/candidate-pool/views')).data });
  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-4 py-3 font-semibold">{a('cols.company')}</th>
              <th className="px-4 py-3 font-semibold">
                {a('cols.details')} ({a('d1')} / {a('d7')} / {a('d30')})
              </th>
              <th className="px-4 py-3 font-semibold">
                {a('cols.searches')} ({a('d1')} / {a('d7')} / {a('d30')})
              </th>
            </tr>
          </thead>
          <tbody>
            {q.data.items.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  {a('empty')}
                </td>
              </tr>
            )}
            {q.data.items.map((r) => (
              <tr key={r.company.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/admin/companies/${r.company.id}`} className="font-semibold text-ink hover:text-link">
                    {r.company.name}
                  </Link>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  <span className={clsx(r.details.d1 >= 100 && 'font-bold text-danger-fg')}>{r.details.d1}</span> / {r.details.d7} / {r.details.d30}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {r.searches.d1} / {r.searches.d7} / {r.searches.d30}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Panel title={a('recent')} icon={Eye}>
        <ul className="space-y-1 text-xs text-ink">
          {q.data.recent.map((v) => (
            <li key={v.id}>
              {fmtDateTime(v.createdAt)} · {v.company.name}
              {v.viewer ? ` · ${v.viewer.firstName} ${v.viewer.lastName}` : ''} · {v.kind === 'DETAIL' ? (v.profile?.code ?? '—') : `${a('cols.searches')} (${v.results})`}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
};

const TABS = ['profiles', 'interests', 'views'] as const;

/** Admin → Candidate pool (/admin/candidate-pool): visible profiles + consent, employer interest requests, view log. */
export default function AdminCandidatePool() {
  const { t } = useTranslation();
  usePageTitle(t('pool.admin.title'));
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as (typeof TABS)[number]) : 'profiles';
  return (
    <div>
      <PageHead title={t('pool.admin.title')} subtitle={t('pool.admin.subtitle')} />
      <div className="mb-5 flex flex-wrap gap-2" role="tablist">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setParams(k === 'profiles' ? {} : { tab: k }, { replace: true })}
            className={clsx('min-h-10 rounded-xl px-4 text-sm font-semibold', tab === k ? 'bg-primary text-primary-contrast' : 'border border-line bg-card text-ink hover:border-line-strong')}
          >
            {t(`pool.admin.tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'profiles' && <ProfilesTab />}
      {tab === 'interests' && <InterestsTab />}
      {tab === 'views' && <ViewsTab />}
    </div>
  );
}
