import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Clock, ExternalLink, Landmark, Link2, ListChecks, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table } from '@/components/ui/Table';
import { confirmDialog } from '@/components/ui/confirmStore';
import { ErrorBlock, LoadingBlock } from '@/components/admin/ui';
import { statusLabel } from '@/components/admin/labels';
import { AuthorityFormModal, bodyOf, draftOf, emptyAuthorityDraft, type AuthorityDraft } from '@/components/authorities/AuthorityForm';
import {
  AUTHORITY_TYPES,
  authorityError,
  authorityPlace,
  safeUrl,
  type AuthorityDetail,
  type AuthorityList,
  type AuthorityListItem,
  type AuthorityType,
  type AuthorityWaiting,
  type MatchRow,
} from '@/components/authorities/api';
import { registerCopy } from '@/i18n';
import { pagesAuthorities } from '@/i18n/pagesAuthorities';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { hasMinRole, type CaseStatus } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesAuthorities);

const LIST_KEY = ['admin', 'authorities'] as const;
type ActiveFilter = 'all' | 'active' | 'inactive';

/**
 * Admin → İşlər → Qurumlar: catalogue of embassies, Ausländerbehörden, the Agentur für Arbeit and recognition
 * bodies (/admin/authorities, detail at /admin/authorities/:id). STAFF reads, ADMIN+ edits (audited server-side).
 */
export default function AdminAuthorities() {
  const id = useParams()['*'] || '';
  return id ? <AuthorityDetailPage id={id} /> : <AuthorityListPage />;
}

const useCanEdit = () => {
  const { user } = useAuth();
  return hasMinRole(user?.role, 'ADMIN');
};

/** "~N days" from the effective value (manual, else computed), "—" without data. */
const WaitingCell = ({ w }: { w: AuthorityWaiting }) => {
  const { t } = useTranslation();
  if (w.effectiveDays === null) return <span className="text-muted">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums" title={w.manualDays === null && w.computed ? t('authorities.detail.samples', { count: w.computed.samples }) : undefined}>
      {t('authorities.days', { count: w.effectiveDays })}
    </span>
  );
};

function AuthorityListPage() {
  const { t } = useTranslation();
  usePageTitle(t('authorities.title'));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [type, setType] = useState<AuthorityType | ''>('');
  const [city, setCity] = useState('');
  const [active, setActive] = useState<ActiveFilter>('all');
  const [creating, setCreating] = useState(false);
  const params = { q: q.trim() || undefined, type: type || undefined, city: city || undefined, active };
  const list = useQuery({
    queryKey: [...LIST_KEY, params],
    queryFn: async () => (await api.get<AuthorityList>('/admin/authorities', { params })).data,
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    mutationFn: async (d: AuthorityDraft) => (await api.post<AuthorityDetail>('/admin/authorities', bodyOf(d))).data,
    onSuccess: (res) => {
      toast.success(t('authorities.saved'));
      setCreating(false);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate(`/admin/authorities/${res.authority.id}`);
    },
    onError: (err) => toast.error(t(`authorities.errors.${authorityError(err)}`, { defaultValue: t('authorities.errors.generic') })),
  });
  const filtered = !!(q.trim() || type || city || active !== 'all');
  const total = Object.values(list.data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="stack-page">
      <PageHeader
        title={t('authorities.title')}
        subtitle={t('authorities.subtitle')}
        actions={
          canEdit ? (
            <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
              {t('authorities.add')}
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <label className="relative block min-w-56 flex-1">
          <span className="sr-only">{t('authorities.filters.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" type="search" value={q} maxLength={120} placeholder={t('authorities.filters.search')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="block">
          <span className="sr-only">{t('authorities.f.type')}</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AuthorityType | '')}>
            <option value="">{t('authorities.filters.allTypes')}</option>
            {AUTHORITY_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`authorities.types.${k}`)}
                {list.data?.counts[k] ? ` (${list.data.counts[k]})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">{t('authorities.f.city')}</span>
          <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">{t('authorities.filters.allCities')}</option>
            {(list.data?.cities ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">{t('authorities.filters.active')}</span>
          <select className="input" value={active} onChange={(e) => setActive(e.target.value as ActiveFilter)}>
            {(['all', 'active', 'inactive'] as const).map((k) => (
              <option key={k} value={k}>
                {t(`authorities.filters.activeOpts.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.error ? (
        <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table<AuthorityListItem>
          rows={list.data?.items}
          loading={list.isLoading}
          rowKey={(r) => r.id}
          stackOnMobile
          onRowClick={(r) => navigate(`/admin/authorities/${r.id}`)}
          empty={
            filtered && total > 0 ? (
              <EmptyState compact icon={Landmark} title={t('authorities.emptyFiltered')} />
            ) : (
              <EmptyState compact icon={Landmark} title={t('authorities.empty')} text={t('authorities.emptyHint')} />
            )
          }
          columns={[
            {
              key: 'name',
              header: t('authorities.cols.name'),
              primary: true,
              cell: (r) => (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <Link to={`/admin/authorities/${r.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.name}
                  </Link>
                  {!r.active && <Badge tone="neutral">{t('authorities.inactive')}</Badge>}
                </span>
              ),
            },
            { key: 'type', header: t('authorities.cols.type'), cell: (r) => <Badge tone="brand">{t(`authorities.types.${r.type}`)}</Badge> },
            { key: 'city', header: t('authorities.cols.city'), cell: (r) => authorityPlace(r) || <span className="text-muted">—</span> },
            { key: 'contact', header: t('authorities.cols.contact'), hideBelow: 'lg', cell: (r) => <span className="text-xs text-muted">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}</span> },
            { key: 'waiting', header: t('authorities.cols.waiting'), numeric: true, cell: (r) => <WaitingCell w={r.waiting} /> },
            { key: 'cases', header: t('authorities.cols.cases'), numeric: true, hideBelow: 'md', cell: (r) => <span className="tabular-nums">{r.linkedCases}</span> },
          ]}
        />
      )}

      {creating && <AuthorityFormModal open initial={emptyAuthorityDraft(type || 'EMBASSY')} editing={false} saving={create.isPending} onClose={() => setCreating(false)} onSave={(d) => create.mutate(d)} />}
    </div>
  );
}

const WaitingPanel = ({ w }: { w: AuthorityWaiting }) => {
  const { t } = useTranslation();
  const row = (label: string, value: string | null, sub?: string | null) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right">
        <span className="font-semibold text-ink tabular-nums">{value ?? t('authorities.detail.noData')}</span>
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </dd>
    </div>
  );
  return (
    <Card title={t('authorities.detail.waiting')} icon={Clock}>
      <dl className="divide-y divide-line">
        {row(t('authorities.detail.manual'), w.manualDays === null ? null : t('authorities.days', { count: w.manualDays }))}
        {row(
          t('authorities.detail.computed'),
          w.computed ? t('authorities.days', { count: w.computed.days }) : null,
          w.computed ? `${t(`authorities.detail.basis.${w.computed.basis}`)} · ${t('authorities.detail.samples', { count: w.computed.samples })}` : null,
        )}
        {w.appointmentLead &&
          row(t('authorities.detail.lead'), t('authorities.days', { count: w.appointmentLead.days }), `${t('authorities.detail.leadBasis')} · ${t('authorities.detail.samples', { count: w.appointmentLead.samples })}`)}
      </dl>
    </Card>
  );
};

function MatchesPanel({ id }: { id: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const q = useQuery({ queryKey: [...LIST_KEY, id, 'matches'], queryFn: async () => (await api.get<{ items: MatchRow[] }>(`/admin/authorities/${id}/matches`)).data.items });
  const link = useMutation({
    mutationFn: async (caseIds: string[]) => (await api.post<{ linked: number }>(`/admin/authorities/${id}/matches`, { caseIds })).data,
    onSuccess: (res) => {
      toast.success(t('authorities.matches.linked', { count: res.linked }));
      setPicked(new Set());
      void qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toast.error(t(`authorities.errors.${authorityError(err)}`, { defaultValue: t('authorities.errors.generic') })),
  });
  const items = q.data ?? [];
  if (q.isLoading || !items.length) return null;
  const toggle = (caseId: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(caseId)) n.delete(caseId);
      else n.add(caseId);
      return n;
    });
  return (
    <Card
      title={t('authorities.matches.title')}
      subtitle={t('authorities.matches.hint')}
      icon={Link2}
      actions={
        <Button size="sm" disabled={!picked.size} loading={link.isPending} onClick={() => link.mutate([...picked])}>
          {t('authorities.matches.link', { count: picked.size })}
        </Button>
      }
    >
      <label className="mb-2 inline-flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" checked={picked.size === items.length} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((m) => m.caseId)) : new Set())} />
        {t('authorities.matches.selectAll')}
      </label>
      <ul className="divide-y divide-line">
        {items.map((m) => (
          <li key={m.caseId} className="flex items-start gap-3 py-2">
            <input type="checkbox" className="mt-1" checked={picked.has(m.caseId)} onChange={() => toggle(m.caseId)} aria-label={`${m.number} · ${m.clientName}`} />
            <div className="min-w-0 flex-1 text-sm">
              <Link to={`/admin/cases/${m.caseId}`} className="font-semibold text-ink hover:underline">
                {m.number}
              </Link>{' '}
              <span className="text-muted">· {m.clientName} · {statusLabel(m.status as CaseStatus)}</span>
              <p className="truncate text-xs text-muted" title={m.text}>
                {m.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AuthorityDetailPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const { date } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: [...LIST_KEY, id], queryFn: async () => (await api.get<AuthorityDetail>(`/admin/authorities/${id}`)).data });
  usePageTitle(q.data?.authority.name ?? t('authorities.title'));
  const save = useMutation({
    mutationFn: async (d: AuthorityDraft) => (await api.put<AuthorityDetail>(`/admin/authorities/${id}`, bodyOf(d))).data,
    onSuccess: (res) => {
      toast.success(t('authorities.saved'));
      setEditing(false);
      qc.setQueryData([...LIST_KEY, id], res);
      void qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (err) => toast.error(t(`authorities.errors.${authorityError(err)}`, { defaultValue: t('authorities.errors.generic') })),
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`/admin/authorities/${id}`),
    onSuccess: () => {
      toast.success(t('authorities.deleted'));
      void qc.invalidateQueries({ queryKey: LIST_KEY });
      navigate('/admin/authorities');
    },
    onError: (err) => toast.error(t(`authorities.errors.${authorityError(err)}`, { defaultValue: t('authorities.errors.generic') })),
  });
  const initial = useMemo(() => (q.data ? draftOf(q.data.authority) : null), [q.data]);

  const back = (
    <Link to="/admin/authorities" className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> {t('authorities.detail.back')}
    </Link>
  );
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data)
    return (
      <div className="stack-page">
        {back}
        {(q.error as { response?: { status?: number } } | null)?.response?.status === 404 ? <EmptyState icon={Landmark} title={t('authorities.detail.notFound')} /> : <ErrorBlock error={q.error} onRetry={() => q.refetch()} />}
      </div>
    );
  const { authority: a, waiting, cases, totalCases } = q.data;
  const url = safeUrl(a.website);
  const askDelete = async () => {
    if (await confirmDialog({ message: t('authorities.deleteConfirm', { name: a.name }) })) remove.mutate();
  };

  return (
    <div className="stack-page">
      {back}
      <PageHeader
        title={a.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{t(`authorities.types.${a.type}`)}</Badge>
            {authorityPlace(a) && <span>{authorityPlace(a)}</span>}
            {!a.active && <Badge tone="neutral">{t('authorities.inactive')}</Badge>}
          </span>
        }
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(true)}>
                {t('authorities.edit')}
              </Button>
              <Button variant="danger" size="sm" icon={Trash2} loading={remove.isPending} onClick={() => void askDelete()}>
                {t('authorities.delete')}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="stack-page min-w-0">
          <Card title={t('authorities.detail.requirements')} icon={ListChecks}>
            {a.requirements ? <p className="text-sm whitespace-pre-line text-ink">{a.requirements}</p> : <p className="text-sm text-muted">—</p>}
            {a.checklist.length > 0 && (
              <>
                <h3 className="mt-4 mb-2 text-sm font-semibold text-ink">{t('authorities.detail.checklist')}</h3>
                <ul className="space-y-1.5">
                  {a.checklist.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-ink">
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                      {c.label}
                      {!c.required && <Badge tone="neutral" size="sm">{t('authorities.f.optional')}</Badge>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title={t('authorities.detail.cases')} subtitle={totalCases > cases.length ? t('authorities.detail.moreCases', { shown: cases.length, total: totalCases }) : undefined} icon={Users} padding="none">
            <Table
              rows={cases}
              rowKey={(c) => `${c.role}-${c.id}`}
              stackOnMobile
              dense
              empty={<EmptyState compact icon={Users} title={t('authorities.detail.noCases')} />}
              columns={[
                {
                  key: 'number',
                  header: '#',
                  primary: true,
                  cell: (c) => (
                    <Link to={`/admin/cases/${c.id}`} className="font-semibold text-ink hover:underline">
                      {c.number}
                    </Link>
                  ),
                },
                { key: 'client', header: t('authorities.cols.name'), cell: (c) => `${c.client.firstName} ${c.client.lastName}`.trim() },
                { key: 'role', header: t('authorities.cols.type'), cell: (c) => <Badge tone="neutral">{t(`authorities.detail.roles.${c.role}`)}</Badge> },
                { key: 'status', header: '', cell: (c) => statusLabel(c.status as CaseStatus) },
                { key: 'appointment', header: '', hideBelow: 'md', cell: (c) => (c.appointmentAt ? date(c.appointmentAt) : '') },
              ]}
            />
          </Card>

          {canEdit && <MatchesPanel id={a.id} />}
        </div>

        <div className="stack-page min-w-0">
          <Card title={t('authorities.detail.contact')} icon={MapPin}>
            <div className="space-y-2 text-sm">
              {a.address && <p className="whitespace-pre-line text-ink">{a.address}</p>}
              {a.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 text-muted" aria-hidden />
                  <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} className="text-link hover:underline">
                    {a.phone}
                  </a>
                </p>
              )}
              {a.email && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 text-muted" aria-hidden />
                  <a href={`mailto:${a.email}`} className="break-all text-link hover:underline">
                    {a.email}
                  </a>
                </p>
              )}
              {url && (
                <p className="flex items-center gap-2">
                  <ExternalLink className="size-4 text-muted" aria-hidden />
                  <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-link hover:underline">
                    {url.replace(/^https?:\/\//i, '')}
                  </a>
                </p>
              )}
              {a.openingHours && (
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 text-muted" aria-hidden />
                  <span className="whitespace-pre-line text-ink">{a.openingHours}</span>
                </p>
              )}
              {!a.address && !a.phone && !a.email && !url && !a.openingHours && <p className="text-muted">—</p>}
            </div>
          </Card>

          <WaitingPanel w={waiting} />

          <Card title={t('authorities.detail.contacts')} icon={Users}>
            {a.contacts.length ? (
              <ul className="divide-y divide-line">
                {a.contacts.map((c, i) => (
                  <li key={c.id ?? i} className="py-2 text-sm">
                    <p className="font-semibold text-ink">
                      {c.name}
                      {c.role && <span className="font-normal text-muted"> · {c.role}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {c.phone && (
                        <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="text-link hover:underline">
                          {c.phone}
                        </a>
                      )}
                      {c.phone && c.email && ' · '}
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="break-all text-link hover:underline">
                          {c.email}
                        </a>
                      )}
                    </p>
                    {c.note && <p className="mt-0.5 text-xs text-muted">{c.note}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('authorities.detail.noContacts')}</p>
            )}
          </Card>

          {a.notes && (
            <Card title={t('authorities.detail.notes')}>
              <p className="text-sm whitespace-pre-line text-ink">{a.notes}</p>
            </Card>
          )}
        </div>
      </div>

      {editing && initial && <AuthorityFormModal open initial={initial} editing saving={save.isPending} onClose={() => setEditing(false)} onSave={(d) => save.mutate(d)} />}
    </div>
  );
}
