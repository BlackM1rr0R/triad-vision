import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Download, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccessAudit } from '@/i18n/pagesAccessAudit';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesAccessAudit);

/**
 * Access Center › Audit (SUPER_ADMIN or "manage access"): who can see what (per account, CSV), reverse lookup per
 * case / client, quarterly access reviews and the anomaly alert thresholds. Server: routes/admin/accessAudit.ts,
 * lib/accessAudit/* (read-only resolvers; every change is audit-logged).
 */

const BASE = '/admin/access/audit';
const AREAS = ['cases', 'clients', 'documents', 'finance', 'employers', 'partners', 'content', 'settings', 'drive', 'reports', 'communications', 'analytics'] as const;
type Kind = 'STAFF' | 'PARTNER' | 'COMPANY';
type Section = 'users' | 'lookup' | 'reviews' | 'anomalies';

interface Row {
  userId: string;
  name: string;
  email: string;
  role: string;
  kind: Kind;
  isActive: boolean;
  twoFactor: boolean;
  lastLoginAt: string | null;
  staff?: {
    superAdmin: boolean;
    templateKey: string | null;
    templateId: string | null;
    overrides: number;
    manageAccess: boolean;
    matrix: Record<string, string[]>;
    caseScope: 'ALL' | 'ASSIGNED' | 'TEAM';
    visibleCases: number;
    sensitive: { visible: string[]; masked: string[]; hidden: string[] };
    breakGlass: { id: string; caseId: string; caseNumber: string | null; expiresAt: string; reason: string }[];
  };
  partner?: { partnerName: string; role: 'OWNER' | 'MEMBER'; template: string; perms: Record<string, unknown>; visibleCases: number };
  company?: { companyName: string | null; role: string | null; isOwner: boolean; perms: Record<string, boolean>; visibleCases: number };
  reasons: string[];
}

const editTab = (k: Kind) => (k === 'PARTNER' ? 'partners' : k === 'COMPANY' ? 'employers' : 'staff');
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString() : null);

export default function AuditTab() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [section, setSection] = useState<Section>(params.get('review') ? 'reviews' : 'users');
  const sections: Section[] = ['users', 'lookup', 'reviews', 'anomalies'];
  return (
    <div className="space-y-4">
      <div role="group" aria-label={t('accessCenter.tabs.audit')} className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button key={s} type="button" aria-pressed={section === s} onClick={() => setSection(s)} className={clsx('btn btn-sm', section === s ? 'btn-primary' : 'btn-secondary')}>
            {t(`accessAudit.sections.${s}`)}
          </button>
        ))}
      </div>
      {section === 'users' && <UsersSection />}
      {section === 'lookup' && <LookupSection />}
      {section === 'reviews' && <ReviewsSection initialId={params.get('review')} />}
      {section === 'anomalies' && <AnomaliesSection />}
    </div>
  );
}

// ─── Who can see what ─────────────────────────────────────────────────────

function UsersSection() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind | ''>('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [elevated, setElevated] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const query: Record<string, string> = { ...(kind ? { kind } : {}), ...(search ? { search } : {}), ...(elevated ? { elevated: '1' } : {}), ...(inactive ? { inactive: '1' } : {}) };
  const rows = useQuery({ queryKey: ['access-audit-users', query], queryFn: async () => (await api.get<{ rows: Row[] }>(`${BASE}/users`, { params: query })).data.rows });
  const csvHref = `/api${BASE}/users.csv?${new URLSearchParams(query).toString()}`;

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted">{t('accessAudit.usersIntro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="sr-only">{t('accessAudit.col.account')}</span>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}>
            <option value="">{t('accessAudit.kind.all')}</option>
            {(['STAFF', 'PARTNER', 'COMPANY'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`accessAudit.kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <label className="sr-only" htmlFor="access-audit-search">
            {t('accessAudit.search')}
          </label>
          <input id="access-audit-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('accessAudit.search')} maxLength={120} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={elevated} onChange={(e) => setElevated(e.target.checked)} />
          {t('accessAudit.elevatedOnly')}
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />
          {t('accessAudit.includeInactive')}
        </label>
        <a href={csvHref} className="btn btn-secondary btn-sm" download>
          <Download className="size-4" aria-hidden /> {t('accessAudit.exportCsv')}
        </a>
      </div>
      {rows.isLoading ? (
        <div className="grid place-items-center py-12 text-primary">
          <Spinner className="size-6" />
        </div>
      ) : rows.isError ? (
        <ErrorState onRetry={() => void rows.refetch()} />
      ) : !rows.data?.length ? (
        <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-muted">{t('accessAudit.empty')}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {rows.data.map((r) => (
            <li key={r.userId}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-surface"
                aria-expanded={open === r.userId}
                onClick={() => setOpen(open === r.userId ? null : r.userId)}
              >
                {open === r.userId ? <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />}
                <span className="min-w-48 flex-1">
                  <span className={clsx('block font-medium', r.isActive ? 'text-ink' : 'text-muted line-through')}>{r.name || r.email}</span>
                  <span className="block text-xs text-muted">{r.email}</span>
                </span>
                <span className="text-sm text-ink">{roleLabel(r, t)}</span>
                {r.staff && <span className="text-sm text-muted">{t(`accessAudit.scope.${r.staff.caseScope}`)}</span>}
                <span className="text-sm text-muted">
                  {t('accessAudit.col.cases')}: {r.staff?.visibleCases ?? r.partner?.visibleCases ?? r.company?.visibleCases ?? 0}
                </span>
                <span className={clsx('text-xs', r.twoFactor ? 'text-success' : 'text-muted')}>2FA {r.twoFactor ? t('accessAudit.yes') : t('accessAudit.no')}</span>
                <span className="text-xs text-muted">
                  {t('accessAudit.col.lastLogin')}: {day(r.lastLoginAt) ?? t('accessAudit.never')}
                </span>
                <span className="flex flex-wrap gap-1">
                  {r.reasons.map((x) => (
                    <span key={x} className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning-fg">
                      {t(`accessAudit.reasons.${x}`, x)}
                    </span>
                  ))}
                </span>
              </button>
              {open === r.userId && <RowDetail row={r} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const roleLabel = (r: Row, t: (k: string, o?: Record<string, unknown>) => string) => {
  if (r.staff) return r.staff.superAdmin ? 'SUPER_ADMIN' : `${r.role} · ${r.staff.templateKey ?? r.staff.templateId ?? ''}`;
  if (r.partner) return `${t('accessAudit.partner')}: ${r.partner.partnerName} · ${r.partner.role === 'OWNER' ? t('accessAudit.owner') : t('accessAudit.member')} · ${r.partner.template}`;
  if (r.company) return `${t('accessAudit.company')}: ${r.company.companyName ?? ''} · ${r.company.isOwner ? t('accessAudit.owner') : (r.company.role ?? 'STANDARD')}`;
  return r.role;
};

function RowDetail({ row }: { row: Row }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 border-t border-line bg-surface px-4 py-3 text-sm">
      {row.staff && (
        <>
          {row.staff.superAdmin ? (
            <p className="text-ink">{t('accessAudit.superAdmin')}</p>
          ) : (
            <>
              <p className="text-muted">
                {t('accessAudit.overrides', { count: row.staff.overrides })}
                {row.staff.manageAccess ? ` · ${t('accessAudit.manageAccess')}` : ''}
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs">
                  <caption className="sr-only">{t('accessAudit.matrix')}</caption>
                  <tbody>
                    {AREAS.map((a) => (
                      <tr key={a}>
                        <th scope="row" className="py-0.5 pr-3 text-left font-normal text-muted">
                          {t(`accessAudit.areas.${a}`)}
                        </th>
                        <td className="py-0.5 text-ink">{(row.staff!.matrix[a] ?? []).map((x) => t(`accessAudit.actions.${x}`)).join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p>
            <span className="text-muted">{t('accessAudit.sensitive')}: </span>
            <span className="text-ink">
              {t('accessAudit.visible')}: {row.staff.sensitive.visible.join(', ') || '—'} · {t('accessAudit.masked')}: {row.staff.sensitive.masked.join(', ') || '—'} · {t('accessAudit.hidden')}:{' '}
              {row.staff.sensitive.hidden.join(', ') || '—'}
            </span>
          </p>
          {row.staff.breakGlass.length > 0 && (
            <div>
              <p className="font-medium text-ink">{t('accessAudit.breakGlass')}</p>
              <ul className="list-disc pl-5 text-muted">
                {row.staff.breakGlass.map((g) => (
                  <li key={g.id}>
                    {g.caseNumber ?? g.caseId} · {new Date(g.expiresAt).toLocaleString()} · {g.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {row.partner && (
        <p className="text-ink">
          {Object.entries(row.partner.perms)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join(' · ')}
        </p>
      )}
      {row.company && (
        <p className="text-ink">
          {Object.entries(row.company.perms)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(' · ')}
        </p>
      )}
      <Link to={`/admin/access?tab=${editTab(row.kind)}`} className="btn btn-secondary btn-sm">
        {t('accessAudit.edit')}
      </Link>
    </div>
  );
}

// ─── Reverse lookup ───────────────────────────────────────────────────────

interface CaseAccess {
  case: { id: string; number: string; clientId: string };
  staff: { userId: string; name: string; role: string; via: string }[];
  partners: { userId: string; name: string; role: 'OWNER' | 'MEMBER'; partnerName: string }[];
  company: { userId: string; name: string; role: string | null; isOwner: boolean; viewWorkers: boolean }[];
}

function LookupSection() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'case' | 'client'>('case');
  const [id, setId] = useState('');
  const [target, setTarget] = useState<{ mode: 'case' | 'client'; id: string } | null>(null);
  const res = useQuery({
    queryKey: ['access-audit-lookup', target],
    enabled: !!target,
    retry: false,
    queryFn: async () =>
      target!.mode === 'case'
        ? [(await api.get<CaseAccess>(`${BASE}/case-access/${encodeURIComponent(target!.id)}`)).data]
        : (await api.get<{ cases: CaseAccess[] }>(`${BASE}/client-access/${encodeURIComponent(target!.id)}`)).data.cases,
  });
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted">{t('accessAudit.lookupIntro')}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (id.trim()) setTarget({ mode, id: id.trim() });
        }}
      >
        <select className="input w-auto" value={mode} onChange={(e) => setMode(e.target.value as 'case' | 'client')} aria-label={t('accessAudit.lookupCase')}>
          <option value="case">{t('accessAudit.lookupCase')}</option>
          <option value="client">{t('accessAudit.lookupClient')}</option>
        </select>
        <input className="input max-w-xs" value={id} onChange={(e) => setId(e.target.value)} maxLength={64} aria-label={mode === 'case' ? t('accessAudit.lookupCase') : t('accessAudit.lookupClient')} />
        <button type="submit" className="btn btn-primary btn-sm">
          {t('accessAudit.lookupGo')}
        </button>
      </form>
      {res.isFetching ? (
        <Spinner className="size-5 text-primary" />
      ) : res.isError ? (
        <p className="text-sm text-muted">{t('accessAudit.lookupNotFound')}</p>
      ) : res.data ? (
        res.data.length ? (
          res.data.map((c) => (
            <div key={c.case.id} className="space-y-2 rounded-xl border border-line bg-card p-4 text-sm">
              <p className="font-medium text-ink">{t('accessAudit.caseNo', { number: c.case.number })}</p>
              <WhoList title={t('accessAudit.staffWho')} items={c.staff.map((s) => `${s.name} (${s.role}, ${t(`accessAudit.via.${s.via}`)})`)} />
              <WhoList title={t('accessAudit.partnersWho')} items={c.partners.map((p) => `${p.name} (${p.partnerName}, ${p.role === 'OWNER' ? t('accessAudit.owner') : t('accessAudit.member')})`)} />
              <WhoList title={t('accessAudit.companyWho')} items={c.company.map((p) => `${p.name} (${p.isOwner ? t('accessAudit.owner') : (p.role ?? 'STANDARD')})`)} />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">{t('accessAudit.lookupNotFound')}</p>
        )
      ) : null}
    </div>
  );
}

function WhoList({ title, items }: { title: string; items: string[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-muted">{title}</p>
      {items.length ? (
        <ul className="list-disc pl-5 text-ink">
          {items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-ink">{t('accessAudit.none')}</p>
      )}
    </div>
  );
}

// ─── Access reviews ───────────────────────────────────────────────────────

interface ReviewListItem {
  id: string;
  quarter: string;
  createdAt: string;
  completedAt: string | null;
  _count: { items: number };
}
interface ReviewItem {
  id: string;
  userId: string;
  kind: Kind;
  reasons: string[];
  status: 'PENDING' | 'CONFIRMED' | 'CHANGED';
  user: { name: string; email: string; role: string; isActive: boolean } | null;
}
interface ReviewDetail extends Omit<ReviewListItem, '_count'> {
  summary: { breakGlass?: { total: number } } | null;
  items: ReviewItem[];
}

function ReviewsSection({ initialId }: { initialId: string | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(initialId);
  const list = useQuery({ queryKey: ['access-audit-reviews'], queryFn: async () => (await api.get<{ reviews: ReviewListItem[] }>(`${BASE}/reviews`)).data.reviews });
  const create = useMutation({
    mutationFn: async () => (await api.post<{ review: ReviewListItem | null }>(`${BASE}/reviews`)).data,
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['access-audit-reviews'] });
      if (d.review) setOpenId(d.review.id);
    },
    onError: () => toast.error(t('accessAudit.error')),
  });
  if (openId) return <ReviewView id={openId} onBack={() => setOpenId(null)} />;
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted">{t('accessAudit.reviewsIntro')}</p>
      <button type="button" className="btn btn-secondary btn-sm" disabled={create.isPending} onClick={() => create.mutate()}>
        {t('accessAudit.createNow')}
      </button>
      {list.isLoading ? (
        <Spinner className="size-5 text-primary" />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !list.data?.length ? (
        <p className="text-sm text-muted">{t('accessAudit.noReviews')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {list.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium text-ink">{r.quarter}</span>
              <span className="text-muted">{r.completedAt ? t('accessAudit.completed') : `${r._count.items}`}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(r.id)}>
                {t('accessAudit.open')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['access-audit-review', id];
  const r = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ review: ReviewDetail }>(`${BASE}/reviews/${id}`)).data.review });
  const decide = useMutation({
    mutationFn: async (v: { itemId: string; status: 'CONFIRMED' | 'CHANGED' }) => (await api.post(`${BASE}/reviews/items/${v.itemId}`, { status: v.status })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
    onError: () => toast.error(t('accessAudit.error')),
  });
  const complete = useMutation({
    mutationFn: async () => (await api.post(`${BASE}/reviews/${id}/complete`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['access-audit-reviews'] });
    },
    onError: () => toast.error(t('accessAudit.error')),
  });
  if (r.isLoading) return <Spinner className="size-5 text-primary" />;
  if (r.isError || !r.data) return <ErrorState onRetry={() => void r.refetch()} />;
  const pending = r.data.items.filter((i) => i.status === 'PENDING').length;
  const done = !!r.data.completedAt;
  return (
    <div className="space-y-3">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden /> {t('accessAudit.back')}
      </button>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="type-section-title text-ink">{r.data.quarter}</h3>
        <span className="text-sm text-muted">{done ? t('accessAudit.completed') : t('accessAudit.pending', { count: pending })}</span>
        <span className="text-sm text-muted">{t('accessAudit.breakGlassTotal', { count: r.data.summary?.breakGlass?.total ?? 0 })}</span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {r.data.items.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <span className="min-w-48 flex-1">
              <span className="block font-medium text-ink">{i.user?.name || i.user?.email || i.userId}</span>
              <span className="block text-xs text-muted">
                {i.user?.role ?? ''} · {i.user?.email ?? ''}
              </span>
            </span>
            <span className="flex flex-wrap gap-1">
              {i.reasons.map((x) => (
                <span key={x} className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning-fg">
                  {t(`accessAudit.reasons.${x}`, x)}
                </span>
              ))}
            </span>
            <span className={clsx('text-xs', i.status === 'PENDING' ? 'text-muted' : 'text-success')}>{t(`accessAudit.itemStatus.${i.status}`)}</span>
            {!done && (
              <span className="flex gap-2">
                <button type="button" className="btn btn-secondary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ itemId: i.id, status: 'CONFIRMED' })}>
                  <Check className="size-4" aria-hidden /> {t('accessAudit.confirm')}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={decide.isPending} onClick={() => decide.mutate({ itemId: i.id, status: 'CHANGED' })}>
                  {t('accessAudit.changed')}
                </button>
                <Link to={`/admin/access?tab=${editTab(i.kind)}`} className="btn btn-ghost btn-sm">
                  {t('accessAudit.edit')}
                </Link>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!done && (
        <button type="button" className="btn btn-primary btn-sm" disabled={pending > 0 || complete.isPending} onClick={() => complete.mutate()}>
          <ShieldCheck className="size-4" aria-hidden /> {t('accessAudit.complete')}
        </button>
      )}
    </div>
  );
}

// ─── Anomaly alerts ───────────────────────────────────────────────────────

interface AnomalySettings {
  manyRecords: { enabled: boolean; threshold: number };
  manyReveals: { enabled: boolean; threshold: number };
  manyExports: { enabled: boolean; threshold: number };
  breakGlass: { enabled: boolean; threshold: number };
  offHours: { enabled: boolean; startHour: number; endHour: number; weekdaysOnly: boolean };
  partnerIps: { enabled: boolean; threshold: number };
}
interface AlertRow {
  id: string;
  rule: string;
  severity: string;
  status: string;
  title: string;
  summary: string;
  lastSeenAt: string;
}
const THRESHOLD_RULES = ['manyRecords', 'manyReveals', 'manyExports', 'breakGlass', 'partnerIps'] as const;

function AnomaliesSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ['access-audit-anomalies'], queryFn: async () => (await api.get<{ settings: AnomalySettings; alerts: AlertRow[] }>(`${BASE}/anomalies`)).data });
  const [draft, setDraft] = useState<AnomalySettings | null>(null);
  useEffect(() => {
    if (data.data && !draft) setDraft(data.data.settings);
  }, [data.data, draft]);
  const save = useMutation({
    mutationFn: async (s: AnomalySettings) => (await api.put<{ settings: AnomalySettings }>(`${BASE}/anomalies/settings`, s)).data,
    onSuccess: (d) => {
      setDraft(d.settings);
      void qc.invalidateQueries({ queryKey: ['access-audit-anomalies'] });
      toast.success(t('accessAudit.saved'));
    },
    onError: () => toast.error(t('accessAudit.error')),
  });
  if (data.isLoading || !draft) return data.isError ? <ErrorState onRetry={() => void data.refetch()} /> : <Spinner className="size-5 text-primary" />;
  const set = <K extends keyof AnomalySettings>(k: K, v: Partial<AnomalySettings[K]>) => setDraft({ ...draft, [k]: { ...draft[k], ...v } });
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">{t('accessAudit.anomaliesIntro')}</p>
      <div className="space-y-2 rounded-xl border border-line bg-card p-4">
        {THRESHOLD_RULES.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex min-w-64 flex-1 items-center gap-2 text-ink">
              <input type="checkbox" checked={draft[k].enabled} onChange={(e) => set(k, { enabled: e.target.checked })} />
              {t(`accessAudit.rule.${k}`)}
            </label>
            <label className="flex items-center gap-2 text-muted">
              {t('accessAudit.threshold')}
              <input type="number" className="input w-24" min={1} max={10000} value={draft[k].threshold} onChange={(e) => set(k, { threshold: Number(e.target.value) || 1 })} />
            </label>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex min-w-64 flex-1 items-center gap-2 text-ink">
            <input type="checkbox" checked={draft.offHours.enabled} onChange={(e) => set('offHours', { enabled: e.target.checked })} />
            {t('accessAudit.rule.offHours')}
          </label>
          <label className="flex items-center gap-2 text-muted">
            {t('accessAudit.startHour')}
            <input type="number" className="input w-20" min={0} max={23} value={draft.offHours.startHour} onChange={(e) => set('offHours', { startHour: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-muted">
            {t('accessAudit.endHour')}
            <input type="number" className="input w-20" min={1} max={24} value={draft.offHours.endHour} onChange={(e) => set('offHours', { endHour: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={draft.offHours.weekdaysOnly} onChange={(e) => set('offHours', { weekdaysOnly: e.target.checked })} />
            {t('accessAudit.weekdaysOnly')}
          </label>
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={() => save.mutate(draft)}>
          {t('accessAudit.save')}
        </button>
      </div>
      <div>
        <h3 className="mb-2 font-medium text-ink">{t('accessAudit.recentAlerts')}</h3>
        {!data.data?.alerts.length ? (
          <p className="text-sm text-muted">{t('accessAudit.noAlerts')}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {data.data.alerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <AlertTriangle className={clsx('mt-0.5 size-4 shrink-0', a.severity === 'HIGH' ? 'text-danger' : 'text-warning')} aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium text-ink">{a.title}</span>
                  <span className="block text-muted">{a.summary}</span>
                </span>
                <span className="text-xs text-muted">
                  {new Date(a.lastSeenAt).toLocaleString()} · {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
