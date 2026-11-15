import { useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Bookmark, BookmarkCheck, ClipboardList, Filter, HandHeart, Send, ShieldCheck, UserSearch, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { SearchEmpty } from '@/components/illustrations';
import { registerCopy } from '@/i18n';
import { pagesPool } from '@/i18n/pagesPool';
import { Empty, Loading, Section } from '@/components/company/shared';
import { CompanyCandidates } from '@/components/company/CompanyCandidates';
import { PoolCardView } from './PoolCardView';
import { fmtDay, INTEREST_TONE, poolError, POOL_GERMAN_LEVELS, POOL_RECOGNITION, POOL_REGIONS, type PoolCard, type PoolInterestStatus } from './types';

registerCopy(pagesPool);

const SEARCH_KEY = 'company-pool';
const FILTER_KEYS = ['profession', 'germanLevel', 'minExperience', 'licence', 'recognition', 'region', 'startBy', 'track'] as const;

interface Interest {
  id: string;
  code: string;
  available: boolean;
  profession: string | null;
  positions: number;
  message: string | null;
  status: PoolInterestStatus;
  createdAt: string;
  statusChangedAt: string | null;
}

const useSaveToggle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, saved }: { code: string; saved: boolean }) => (saved ? api.delete(`/company/pool/${code}/saved`) : api.put(`/company/pool/${code}/saved`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [SEARCH_KEY] }),
    onError: (err) => toast.error(poolError(err)),
  });
};

const SaveButton = ({ card }: { card: PoolCard }) => {
  const { t } = useTranslation();
  const m = useSaveToggle();
  return (
    <button type="button" className="btn-ghost btn-sm" disabled={m.isPending} aria-pressed={!!card.saved} onClick={() => m.mutate({ code: card.code, saved: !!card.saved })}>
      {card.saved ? <BookmarkCheck className="size-4 text-primary" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      {card.saved ? t('pool.company.unsave') : t('pool.company.save')}
    </button>
  );
};

const CardList = ({ items }: { items: PoolCard[] }) => {
  const { t } = useTranslation();
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map((c) => (
        <li key={c.code} className="min-w-0">
          <PoolCardView
            card={c}
            className="h-full shadow-[var(--tv-shadow-card)]"
            actions={
              <>
                <Link to={`/company/candidates/pool/${c.code}`} className="btn-primary btn-sm">
                  <UserSearch className="size-4" aria-hidden /> {t('pool.company.open')}
                </Link>
                <SaveButton card={c} />
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
};

const PrivacyNote = () => {
  const { t } = useTranslation();
  return (
    <p className="mb-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden /> {t('pool.company.privacyNote')}
    </p>
  );
};

// ─── Search ─────────────────────────────────────────────────────────────

const PoolSearch = () => {
  const { t } = useTranslation();
  const c = (k: string, o?: Record<string, unknown>) => t(`pool.company.${k}`, o);
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ''])));
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (params.get(k)) qs.set(k, params.get(k)!);
  if (page > 1) qs.set('page', String(page));

  const options = useQuery({ queryKey: [SEARCH_KEY, 'options'], queryFn: async () => (await api.get<{ professions: { name: string; count: number }[] }>('/company/pool/options')).data, staleTime: 5 * 60_000 });
  const q = useQuery({
    queryKey: [SEARCH_KEY, 'search', qs.toString()],
    queryFn: async () => (await api.get<{ items: PoolCard[]; total: number; page: number; pageSize: number }>(`/company/pool?${qs.toString()}`)).data,
    placeholderData: keepPreviousData,
  });

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    const next = new URLSearchParams();
    for (const k of FILTER_KEYS) if (draft[k]?.trim()) next.set(k, draft[k].trim());
    setParams(next, { replace: true });
  };
  const reset = () => {
    setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
    setParams(new URLSearchParams(), { replace: true });
  };
  const goPage = (n: number) => {
    const next = new URLSearchParams(params);
    if (n > 1) next.set('page', String(n));
    else next.delete('page');
    setParams(next);
  };
  const set = (k: string) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.pageSize)) : 1;

  return (
    <Section title={c('title')} icon={Users}>
      <p className="-mt-3 mb-4 text-sm text-muted">{c('subtitle')}</p>
      <PrivacyNote />
      <form onSubmit={apply} className="mb-6 rounded-2xl border border-line bg-sunken/40 p-4" aria-label={c('filters')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <label className="label" htmlFor="pool-profession">
              {c('profession')}
            </label>
            <input id="pool-profession" className="input" list="pool-professions" maxLength={80} placeholder={c('professionPh')} value={draft.profession} onChange={set('profession')} />
            <datalist id="pool-professions">
              {options.data?.professions.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-german">
              {c('germanMin')}
            </label>
            <select id="pool-german" className="input" value={draft.germanLevel} onChange={set('germanLevel')}>
              <option value="">{c('any')}</option>
              {POOL_GERMAN_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-exp">
              {c('minExperience')}
            </label>
            <input id="pool-exp" type="number" min={0} max={50} inputMode="numeric" className="input" value={draft.minExperience} onChange={set('minExperience')} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-licence">
              {c('licence')}
            </label>
            <input id="pool-licence" className="input" maxLength={20} placeholder={c('licencePh')} value={draft.licence} onChange={set('licence')} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-rec">
              {c('recognition')}
            </label>
            <select id="pool-rec" className="input" value={draft.recognition} onChange={set('recognition')}>
              <option value="">{c('any')}</option>
              {POOL_RECOGNITION.map((r) => (
                <option key={r} value={r}>
                  {t(`pool.recognition.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-region">
              {c('region')}
            </label>
            <select id="pool-region" className="input" value={draft.region} onChange={set('region')}>
              <option value="">{c('any')}</option>
              {POOL_REGIONS.filter((r) => r !== 'ANY').map((r) => (
                <option key={r} value={r}>
                  {t(`pool.regions.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-start">
              {c('startBy')}
            </label>
            <input id="pool-start" type="date" className="input" value={draft.startBy} onChange={set('startBy')} />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="pool-track">
              {c('track')}
            </label>
            <select id="pool-track" className="input" value={draft.track} onChange={set('track')}>
              <option value="">{c('any')}</option>
              <option value="JOB">{t('pool.track.JOB')}</option>
              <option value="AUSBILDUNG">{t('pool.track.AUSBILDUNG')}</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={reset}>
            {c('reset')}
          </button>
          <button type="submit" className="btn-primary btn-sm">
            <Filter className="size-4" aria-hidden /> {c('filters')}
          </button>
        </div>
      </form>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={poolError(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <Empty icon={UserSearch} illustration={<SearchEmpty className="w-32" />} title={c('empty')} />
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-ink" aria-live="polite">
            {c('results', { count: q.data.total })}
          </p>
          <CardList items={q.data.items} />
          {pages > 1 && (
            <nav className="mt-6 flex items-center justify-center gap-2" aria-label={c('results', { count: q.data.total })}>
              <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                {c('prev')}
              </button>
              <span className="text-sm text-muted tabular-nums">
                {page} / {pages}
              </span>
              <button type="button" className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => goPage(page + 1)}>
                {c('next')}
              </button>
            </nav>
          )}
        </>
      )}
    </Section>
  );
};

// ─── Detail + "I'm interested" ──────────────────────────────────────────

const InterestForm = ({ code, onDone }: { code: string; onDone: () => void }) => {
  const { t } = useTranslation();
  const c = (k: string, o?: Record<string, unknown>) => t(`pool.company.${k}`, o);
  const [positions, setPositions] = useState('1');
  const [message, setMessage] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/company/pool/${code}/interest`, { positions: Number(positions) || 1, message: message.trim() || undefined }),
    onSuccess: () => {
      toast.success(c('sent'));
      onDone();
    },
    onError: (err) => toast.error(poolError(err)),
  });
  return (
    <form
      className="mt-4 space-y-3 rounded-2xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        m.mutate();
      }}
    >
      <p className="font-semibold text-ink">{c('interestTitle', { code })}</p>
      <div className="max-w-40">
        <label className="label" htmlFor="pool-positions">
          {c('positions')}
        </label>
        <input id="pool-positions" type="number" min={1} max={200} required inputMode="numeric" className="input" value={positions} onChange={(e) => setPositions(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pool-message">
          {c('message')}
        </label>
        <textarea id="pool-message" className="input min-h-20" maxLength={1000} placeholder={c('messagePh')} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={m.isPending}>
          {m.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {c('send')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          {c('cancel')}
        </button>
      </div>
    </form>
  );
};

const PoolDetail = () => {
  const { t, i18n } = useTranslation();
  const c = (k: string, o?: Record<string, unknown>) => t(`pool.company.${k}`, o);
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const q = useQuery({
    queryKey: [SEARCH_KEY, 'detail', code],
    queryFn: async () => (await api.get<{ candidate: PoolCard; interests: { id: string; status: PoolInterestStatus; positions: number; createdAt: string }[] }>(`/company/pool/${encodeURIComponent(code)}`)).data,
    retry: false,
  });
  const open = q.data?.interests.some((i) => i.status !== 'CLOSED');
  return (
    <Section>
      <button type="button" onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {c('back')}
      </button>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <ErrorState message={poolError(q.error)} />
      ) : (
        <>
          <PoolCardView
            card={q.data.candidate}
            detailed
            actions={
              <>
                {!open && !asking && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => setAsking(true)}>
                    <HandHeart className="size-4" aria-hidden /> {c('interested')}
                  </button>
                )}
                <SaveButton card={q.data.candidate} />
              </>
            }
          />
          {asking && (
            <InterestForm
              code={q.data.candidate.code}
              onDone={() => {
                setAsking(false);
                void qc.invalidateQueries({ queryKey: [SEARCH_KEY] });
              }}
            />
          )}
          {q.data.interests.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold text-ink">{c('yourRequests')}</p>
              <ul className="mt-2 space-y-2">
                {q.data.interests.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={clsx('badge', INTEREST_TONE[i.status])}>{t(`pool.interestStatus.${i.status}`)}</span>
                    <span className="text-muted">{c('requestedOn', { date: fmtDay(i.createdAt, i18n.language) })}</span>
                    <span className="text-muted">· {c('positionsN', { n: i.positions })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5">
            <PrivacyNote />
          </div>
        </>
      )}
    </Section>
  );
};

// ─── Shortlist and request history ──────────────────────────────────────

const PoolSaved = () => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: [SEARCH_KEY, 'saved'], queryFn: async () => (await api.get<{ items: PoolCard[] }>('/company/pool/saved')).data.items });
  return (
    <Section title={t('pool.company.tabs.saved')} icon={Bookmark}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={poolError(q.error)} onRetry={() => void q.refetch()} /> : !q.data?.length ? <Empty icon={Bookmark} title={t('pool.company.emptySaved')} /> : <CardList items={q.data} />}
    </Section>
  );
};

const PoolInterests = () => {
  const { t, i18n } = useTranslation();
  const c = (k: string, o?: Record<string, unknown>) => t(`pool.company.${k}`, o);
  const q = useQuery({ queryKey: [SEARCH_KEY, 'interests'], queryFn: async () => (await api.get<{ items: Interest[] }>('/company/pool/interests')).data.items });
  return (
    <Section title={c('tabs.interests')} icon={ClipboardList}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={poolError(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <Empty icon={ClipboardList} title={c('emptyInterests')} />
      ) : (
        <ul className="divide-y divide-line">
          {q.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">
                  {i.available ? (
                    <Link to={`/company/candidates/pool/${i.code}`} className="hover:text-link">
                      {i.code}
                    </Link>
                  ) : (
                    i.code
                  )}{' '}
                  <span className="font-normal text-muted">· {i.available ? (i.profession ?? '—') : c('notAvailable')}</span>
                </p>
                <p className="text-xs text-muted">
                  {c('requestedOn', { date: fmtDay(i.createdAt, i18n.language) })} · {c('positionsN', { n: i.positions })}
                </p>
                {i.message && <p className="mt-1 text-sm break-words text-ink">{i.message}</p>}
              </div>
              <span className={clsx('badge', INTEREST_TONE[i.status])}>{t(`pool.interestStatus.${i.status}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

// ─── Area with tabs: proposed candidates (existing) + the pool ──────────

/** /company/candidates/*: candidates proposed for the company's vacancies, and the anonymous pool. */
export const CompanyCandidatesArea = () => {
  const { t } = useTranslation();
  const tabs = [
    { to: '/company/candidates', label: t('pool.company.tabs.proposed'), end: true },
    { to: '/company/candidates/pool', label: t('pool.company.tabs.pool'), end: true },
    { to: '/company/candidates/pool/saved', label: t('pool.company.tabs.saved'), end: true },
    { to: '/company/candidates/pool/interests', label: t('pool.company.tabs.interests'), end: true },
  ];
  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label={t('pool.company.tabs.pool')}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              clsx(
                'inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors sm:min-h-10',
                isActive ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<CompanyCandidates />} />
        <Route path="pool" element={<PoolSearch />} />
        <Route path="pool/saved" element={<PoolSaved />} />
        <Route path="pool/interests" element={<PoolInterests />} />
        <Route path="pool/:code" element={<PoolDetail />} />
      </Routes>
    </div>
  );
};
