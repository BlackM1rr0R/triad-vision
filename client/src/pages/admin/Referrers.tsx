import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, ChevronDown, ChevronRight, ExternalLink, MoveRight, Network, Plus, Power, UserPlus, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesReferrers } from '@/i18n/pagesReferrers';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { fmtRelative } from '@/components/admin/labels';
import { money } from '@/components/agents/format';
import { PARTNERS_KEY } from '@/components/partners/api';

registerCopy(pagesReferrers);

/** GET /api/admin/referrers (server routes/admin/referrers.ts). Money is null for STAFF. */
interface Stats {
  clients: number;
  activeCases: number;
  approvedVisas: number;
  paidCents: number | null;
  outstandingCents: number | null;
}
type Approval = 'PENDING' | 'APPROVED' | 'REJECTED';
interface RefNode {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  active: boolean;
  parentPartnerId: string | null;
  approvalStatus: Approval;
  approvalNote: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  hasLogin: boolean;
  lastLoginAt: string | null;
  depth: number;
  own: Stats;
  total: Stats;
  subReferrers: number;
  descendants: number;
}
interface TreeResponse {
  maxDepth: number;
  canManage: boolean;
  items: RefNode[];
  pending: RefNode[];
}

const KEY = ['admin', 'referrers'] as const;
const APPROVAL_TONE: Record<Approval, string> = { PENDING: 'bg-warning-bg text-warning-fg', APPROVED: 'bg-success-bg text-success-fg', REJECTED: 'bg-danger-bg text-danger-fg' };

const useErr = (max: number) => {
  const { t } = useTranslation();
  return (err: unknown) => toast.error(t(`adminReferrers.errors.${errorCode(err)}`, { max, defaultValue: t('adminReferrers.errors.generic') }));
};

/** Create form (top level or below `parentId`). */
const AddForm = ({ nodes, parentId, maxDepth, onDone }: { nodes: RefNode[]; parentId: string | null; maxDepth: number; onDone: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useErr(maxDepth);
  const [f, setF] = useState({ name: '', phone: '', email: '', note: '', parentPartnerId: parentId ?? '', createLogin: true });
  const m = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ login: { invited: boolean; error: string | null } | null }>('/admin/referrers', {
          name: f.name,
          phone: f.phone || null,
          email: f.email || null,
          note: f.note || null,
          parentPartnerId: f.parentPartnerId || null,
          createLogin: f.createLogin && !!f.email,
        })
      ).data,
    onSuccess: (r) => {
      toast.success(r.login?.error ? t('adminReferrers.pending.approvedNoLogin', { error: r.login.error }) : t('adminReferrers.form.saved'));
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: PARTNERS_KEY });
      onDone();
    },
    onError,
  });
  const parents = nodes.filter((n) => n.approvalStatus === 'APPROVED' && n.depth < maxDepth);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  const input = (k: 'name' | 'phone' | 'email' | 'note', type = 'text') => (
    <label className="block">
      <span className="label">{t(`adminReferrers.form.${k}`)}</span>
      <input className="input" type={type} required={k === 'name'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-xl border border-line bg-card p-4">
      <p className="font-semibold text-ink">{t('adminReferrers.form.title')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {input('name')}
        {input('email', 'email')}
        {input('phone', 'tel')}
        {input('note')}
        <label className="block sm:col-span-2">
          <span className="label">{t('adminReferrers.form.parent')}</span>
          <select className="input" value={f.parentPartnerId} onChange={(e) => setF({ ...f, parentPartnerId: e.target.value })}>
            <option value="">{t('adminReferrers.form.top')}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {'— '.repeat(p.depth - 1)}
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.createLogin} disabled={!f.email} onChange={(e) => setF({ ...f, createLogin: e.target.checked })} />
        {t('adminReferrers.form.createLogin')}
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={m.isPending}>
          {m.isPending && <Spinner className="size-4" />} {t('adminReferrers.form.save')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          {t('adminReferrers.form.cancel')}
        </button>
      </div>
    </form>
  );
};

/** "Yeni alt-referal sorğuları": approve (→ login invitation) or reject. */
const PendingBox = ({ pending, nodes, canManage, maxDepth }: { pending: RefNode[]; nodes: RefNode[]; canManage: boolean; maxDepth: number }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useErr(maxDepth);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const done = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: PARTNERS_KEY });
  };
  const approve = useMutation({
    mutationFn: async (id: string) => (await api.post<{ login: { invited: boolean; error: string | null } }>(`/admin/referrers/${id}/approve`)).data,
    onSuccess: (r) => {
      toast.success(r.login.error ? t('adminReferrers.pending.approvedNoLogin', { error: r.login.error }) : t('adminReferrers.pending.approved'));
      done();
    },
    onError,
  });
  const reject = useMutation({
    mutationFn: async (id: string) => api.post(`/admin/referrers/${id}/reject`, { note: notes[id] || undefined }),
    onSuccess: () => {
      toast.success(t('adminReferrers.pending.rejected'));
      done();
    },
    onError,
  });
  const nameOf = (id: string | null) => (id ? (nodes.find((n) => n.id === id)?.name ?? '—') : '—');
  return (
    <section className="mb-5 rounded-xl border border-warning-border bg-warning-bg/40 p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-ink">
        <UserPlus className="size-4" aria-hidden /> {t('adminReferrers.pending.title')} <span className="badge bg-card text-ink">{pending.length}</span>
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-muted">{t('adminReferrers.pending.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {pending.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-ink">{p.name}</p>
                <p className="text-xs text-muted">{[p.email, p.phone].filter(Boolean).join(' · ')}</p>
                <p className="text-xs text-muted">
                  {t('adminReferrers.pending.from', { name: p.createdBy?.name ?? '—' })} · {t('adminReferrers.pending.under', { name: nameOf(p.parentPartnerId) })} · {fmtRelative(p.createdAt)}
                </p>
                {p.note && <p className="mt-1 text-xs text-ink/80">{p.note}</p>}
              </div>
              {canManage && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input h-9 w-48 text-sm"
                    placeholder={t('adminReferrers.pending.rejectNote')}
                    value={notes[p.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })}
                    maxLength={500}
                  />
                  <button type="button" className="btn-secondary btn-sm" disabled={reject.isPending} onClick={() => reject.mutate(p.id)}>
                    <X className="size-4" aria-hidden /> {t('adminReferrers.pending.reject')}
                  </button>
                  <button type="button" className="btn-primary btn-sm" disabled={approve.isPending} onClick={() => approve.mutate(p.id)}>
                    <Check className="size-4" aria-hidden /> {t('adminReferrers.pending.approve')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const Figures = ({ s }: { s: Stats }) => {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
      <span>
        {t('adminReferrers.cols.clients')}: <b className="text-ink">{s.clients}</b>
      </span>
      <span>
        {t('adminReferrers.cols.active')}: <b className="text-warning-fg">{s.activeCases}</b>
      </span>
      <span>
        {t('adminReferrers.cols.approved')}: <b className="text-success-fg">{s.approvedVisas}</b>
      </span>
      {s.paidCents != null && (
        <span>
          {t('adminReferrers.cols.paid')}: <b className="text-ink">{money(s.paidCents)}</b>
        </span>
      )}
      {s.outstandingCents != null && (
        <span>
          {t('adminReferrers.cols.outstanding')}: <b className="text-danger-fg">{money(s.outstandingCents)}</b>
        </span>
      )}
    </span>
  );
};

/** /admin/referrers — the Baku referrer tree (pyramid, no commissions) and the pending sub-referrer requests. */
export default function AdminReferrers() {
  const { t } = useTranslation();
  usePageTitle(t('adminReferrers.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<TreeResponse>('/admin/referrers')).data });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<{ parentId: string | null } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const maxDepth = q.data?.maxDepth ?? 5;
  const onError = useErr(maxDepth);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: PARTNERS_KEY });
  };
  const move = useMutation({
    mutationFn: async (v: { id: string; parentPartnerId: string | null }) => api.patch(`/admin/referrers/${v.id}/parent`, { parentPartnerId: v.parentPartnerId }),
    onSuccess: () => {
      toast.success(t('adminReferrers.form.saved'));
      setMoving(null);
      refresh();
    },
    onError,
  });
  const toggleActive = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => api.patch(`/admin/referrers/${v.id}/active`, { active: v.active }),
    onSuccess: () => {
      toast.success(t('adminReferrers.form.saved'));
      refresh();
    },
    onError,
  });

  // Rejected requests stay out of the tree (they are kept for the record only).
  const nodes = useMemo(() => (q.data?.items ?? []).filter((n) => n.approvalStatus !== 'REJECTED'), [q.data]);
  const kids = useMemo(() => {
    const m = new Map<string | null, RefNode[]>();
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      const key = n.parentPartnerId && ids.has(n.parentPartnerId) ? n.parentPartnerId : null;
      m.set(key, [...(m.get(key) ?? []), n]);
    }
    return m;
  }, [nodes]);

  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => q.refetch()} />;
  const { canManage, pending } = q.data;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const render = (n: RefNode): React.ReactNode => {
    const children = kids.get(n.id) ?? [];
    const expanded = open.has(n.id);
    return (
      <li key={n.id}>
        <div className={clsx('flex flex-wrap items-start justify-between gap-2 rounded-lg px-2 py-2.5 hover:bg-sunken', !n.active && 'opacity-60')}>
          <div className="flex min-w-0 items-start gap-1.5">
            <button
              type="button"
              className={clsx('mt-0.5 grid size-6 place-items-center rounded text-muted hover:bg-card', !children.length && 'invisible')}
              onClick={() => toggle(n.id)}
              aria-expanded={expanded}
              aria-label={n.name}
            >
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <Link to={`/admin/partners/${n.id}`} className="font-semibold text-link hover:underline">
                  {n.name}
                </Link>
                {n.approvalStatus !== 'APPROVED' && <span className={clsx('badge', APPROVAL_TONE[n.approvalStatus])}>{t(`adminReferrers.status.${n.approvalStatus}`)}</span>}
                {!n.active && <span className="badge bg-sunken text-muted">{t('adminReferrers.inactive')}</span>}
                <span className="text-xs text-muted">
                  {t('adminReferrers.cols.team')}: {n.subReferrers} · {t('adminReferrers.lastLogin')}: {n.hasLogin ? (n.lastLoginAt ? fmtRelative(n.lastLoginAt) : t('adminReferrers.never')) : t('adminReferrers.noLogin')}
                </span>
              </p>
              <div className="mt-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 shrink-0 text-xs font-semibold text-muted">{t('adminReferrers.own')}</span>
                  <Figures s={n.own} />
                </div>
                {n.descendants > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-28 shrink-0 text-xs font-semibold text-muted">{t('adminReferrers.total')}</span>
                    <Figures s={n.total} />
                  </div>
                )}
              </div>
              {moving === n.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{t('adminReferrers.form.moveTitle', { name: n.name })}</span>
                  <select className="input h-9 w-56 text-sm" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                    <option value="">{t('adminReferrers.form.top')}</option>
                    {nodes
                      .filter((p) => p.id !== n.id && p.approvalStatus === 'APPROVED')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {'— '.repeat(p.depth - 1)}
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button type="button" className="btn-primary btn-sm" disabled={move.isPending} onClick={() => move.mutate({ id: n.id, parentPartnerId: moveTo || null })}>
                    {t('adminReferrers.form.save')}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setMoving(null)}>
                    {t('adminReferrers.form.cancel')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Link to={`/admin/partners/${n.id}`} className="btn-ghost btn-sm" title={t('adminReferrers.open')}>
              <ExternalLink className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">{t('adminReferrers.open')}</span>
            </Link>
            {canManage && n.approvalStatus === 'APPROVED' && (
              <>
                {n.depth < maxDepth && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding({ parentId: n.id })} title={t('adminReferrers.addUnder')}>
                    <Plus className="size-4" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setMoving(n.id);
                    setMoveTo(n.parentPartnerId ?? '');
                  }}
                  title={t('adminReferrers.move')}
                >
                  <MoveRight className="size-4" aria-hidden />
                </button>
                <button type="button" className="btn-ghost btn-sm" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate({ id: n.id, active: !n.active })} title={n.active ? t('adminReferrers.deactivate') : t('adminReferrers.activate')}>
                  <Power className="size-4" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
        {expanded && children.length > 0 && <ul className="ml-5 border-l border-line pl-2">{children.map(render)}</ul>}
      </li>
    );
  };

  const roots = kids.get(null) ?? [];
  return (
    <div>
      <PageHead
        title={t('adminReferrers.title')}
        subtitle={t('adminReferrers.subtitle')}
        actions={
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(new Set(nodes.map((n) => n.id)))}>
              {t('adminReferrers.expandAll')}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(new Set())}>
              {t('adminReferrers.collapseAll')}
            </button>
            {canManage && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setAdding({ parentId: null })}>
                <Plus className="size-4" /> {t('adminReferrers.add')}
              </button>
            )}
          </>
        }
      />
      <PendingBox pending={pending} nodes={q.data.items} canManage={canManage} maxDepth={maxDepth} />
      {adding && <AddForm key={adding.parentId ?? 'top'} nodes={nodes} parentId={adding.parentId} maxDepth={maxDepth} onDone={() => setAdding(null)} />}
      <section className="rounded-xl border border-line bg-card p-3">
        {roots.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Network className="size-4" aria-hidden /> {t('adminReferrers.empty')}
          </p>
        ) : (
          <ul>{roots.map(render)}</ul>
        )}
      </section>
    </div>
  );
}
