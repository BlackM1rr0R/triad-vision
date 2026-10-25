import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookText, CalendarSync, Copy, ExternalLink, KeyRound, Plus, RefreshCw, RotateCw, Send, ShieldOff, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesOps } from '@/i18n/pagesOps';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { fmtDateTime, fmtRelative } from '@/components/admin/labels';
import { copyText, toastOpsError } from '@/components/ops/shared';

registerCopy(pagesOps);

type Scope = 'vacancies:read' | 'applications:read' | 'applications:write' | 'candidates:read' | 'cases:read' | 'events:read';
interface ApiKey { id: string; name: string; prefix: string; scopes: Scope[]; companyId: string | null; company: { name: string } | null; createdBy: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
interface Hook { id: string; url: string; events: string[]; companyId: string | null; company: { name: string } | null; active: boolean; createdAt: string; deliveries: number; failed: number; pending: number }
interface Delivery { id: string; event: string; status: 'PENDING' | 'DELIVERED' | 'FAILED'; attempts: number; responseCode: number | null; lastError: string | null; nextAttemptAt: string | null; deliveredAt: string | null; createdAt: string }
interface CompanyOption { id: string; name: string }

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn-secondary btn-sm" onClick={async () => { if (await copyText(text)) toast.success(t('ops.common.copied')); }}>
      <Copy className="size-3.5" /> {label ?? t('ops.common.copy')}
    </button>
  );
};

/** Shown once: a freshly created secret with a copy button. */
const SecretBox = ({ secret, hint, onClose }: { secret: string; hint: string; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-warning-border bg-warning-bg p-4" role="alert">
      <p className="text-sm font-semibold text-warning-fg">{hint}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2 font-mono text-xs break-all text-ink">{secret}</code>
        <CopyButton text={secret} />
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('ops.common.close')}</button>
      </div>
    </div>
  );
};

// ─── Calendar feed ──────────────────────────────────────────────────────

const CalendarFeed = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirmOff, setConfirmOff] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['calendar-token'], queryFn: async () => (await api.get<{ enabled: boolean; url: string | null }>('/calendar/token')).data });
  const create = useMutation({
    mutationFn: () => api.post('/calendar/token'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['calendar-token'] }),
    onError: toastOpsError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete('/calendar/token'),
    onSuccess: () => {
      setConfirmOff(false);
      void qc.invalidateQueries({ queryKey: ['calendar-token'] });
    },
    onError: toastOpsError,
  });
  return (
    <Panel title={t('ops.integrations.calendar.title')} icon={CalendarSync}>
      <p className="mb-4 text-sm text-muted">{t('ops.integrations.calendar.hint')}</p>
      {isLoading ? (
        <Spinner className="size-5 text-link" />
      ) : data?.enabled && data.url ? (
        <div className="space-y-4">
          <div>
            <span className="label">{t('ops.integrations.calendar.url')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-lg border border-line bg-surface/60 px-3 py-2 font-mono text-xs break-all">{data.url}</code>
              <CopyButton text={data.url} />
              <button type="button" className="btn-secondary btn-sm" disabled={create.isPending} onClick={() => create.mutate()} title={t('ops.integrations.calendar.rotateHint')}>
                <RotateCw className="size-3.5" /> {t('ops.integrations.calendar.rotate')}
              </button>
              <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmOff(true)}>
                <ShieldOff className="size-3.5" /> {t('ops.integrations.calendar.disable')}
              </button>
            </div>
          </div>
          <div className="rounded-lg bg-surface/60 p-4 text-xs text-ink/80">
            <p className="mb-2 font-semibold text-ink">{t('ops.integrations.calendar.howTo')}</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>{t('ops.integrations.calendar.google')}</li>
              <li>{t('ops.integrations.calendar.outlook')}</li>
              <li>{t('ops.integrations.calendar.apple')}</li>
            </ul>
            <p className="mt-2 text-muted">{t('ops.integrations.calendar.refreshNote')}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink/80">{t('ops.integrations.calendar.off')}</p>
          <button type="button" className="btn-primary btn-sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('ops.integrations.calendar.enable')}
          </button>
        </div>
      )}
      <ConfirmDialog open={confirmOff} onClose={() => setConfirmOff(false)} onConfirm={() => remove.mutate()} title={t('ops.integrations.calendar.disable')} loading={remove.isPending} />
    </Panel>
  );
};

// ─── API keys ───────────────────────────────────────────────────────────

const ApiKeys = ({ companies }: { companies: CompanyOption[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['vacancies:read', 'applications:read']);
  const [companyId, setCompanyId] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['api-keys'], queryFn: async () => (await api.get<{ keys: ApiKey[]; scopes: Scope[] }>('/admin/ops/api-keys')).data });
  const create = useMutation({
    mutationFn: () => api.post<{ secret: string }>('/admin/ops/api-keys', { name: name.trim(), scopes, companyId: companyId || null }),
    onSuccess: (res) => {
      toast.success(t('ops.integrations.apiKeys.created'));
      setSecret(res.data.secret);
      setCreating(false);
      setName('');
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: toastOpsError,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/admin/ops/api-keys/${id}/revoke`),
    onSuccess: () => {
      toast.success(t('ops.integrations.apiKeys.revokedOk'));
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: toastOpsError,
  });
  const toggleScope = (s: Scope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  return (
    <Panel
      title={t('ops.integrations.apiKeys.title')}
      icon={KeyRound}
      actions={
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> {t('ops.integrations.apiKeys.new')}
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('ops.integrations.apiKeys.hint')}</p>
      {secret && <div className="mb-4"><SecretBox secret={secret} hint={t('ops.integrations.apiKeys.showOnce')} onClose={() => setSecret(null)} /></div>}
      {isLoading ? (
        <LoadingBlock className="min-h-32" />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.keys.length ? (
        <EmptyState icon={KeyRound} title={t('ops.integrations.apiKeys.empty')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs font-medium text-muted">
              <tr>
                <th className="py-2 pr-3">{t('ops.integrations.apiKeys.name')}</th>
                <th className="py-2 pr-3">{t('ops.integrations.apiKeys.scopes')}</th>
                <th className="py-2 pr-3">{t('ops.integrations.apiKeys.company')}</th>
                <th className="py-2 pr-3">{t('ops.integrations.apiKeys.lastUsed')}</th>
                <th className="py-2 pr-3">{t('ops.common.status')}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.keys.map((k) => (
                <tr key={k.id} className={clsx(k.revokedAt && 'opacity-60')}>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-ink">{k.name}</span>
                    <span className="block code-id text-[11px] text-muted">{k.prefix}…</span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="rounded bg-sunken px-1.5 py-0.5 code-id text-[10px]">{s}</span>)}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">{k.company?.name ?? <span className="text-muted">{t('ops.integrations.apiKeys.platformWide')}</span>}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted">{k.lastUsedAt ? fmtRelative(k.lastUsedAt) : t('ops.integrations.apiKeys.never')}</td>
                  <td className="py-2.5 pr-3">{k.revokedAt ? <span className="badge bg-neutral-bg text-neutral-fg">{t('ops.integrations.apiKeys.revoked')}</span> : <span className="badge bg-success-bg text-success-fg">{t('ops.integrations.apiKeys.active')}</span>}</td>
                  <td className="py-2.5 text-right">
                    {!k.revokedAt && (
                      <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setRevoking(k)}>
                        <ShieldOff className="size-3.5" /> {t('ops.integrations.apiKeys.revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('ops.integrations.apiKeys.new')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCreating(false)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={name.trim().length < 2 || !scopes.length || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('ops.common.create')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="ak-name">{t('ops.integrations.apiKeys.name')}</label>
            <input id="ak-name" data-autofocus className="input" maxLength={80} placeholder={t('ops.integrations.apiKeys.namePh')} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <fieldset>
            <legend className="label">{t('ops.integrations.apiKeys.scopes')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(data?.scopes ?? []).map((s) => (
                <label key={s} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                  <span><span className="block code-id text-xs text-ink">{s}</span><span className="text-xs text-muted">{t(`ops.integrations.apiKeys.scopeLabels.${s}`)}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="ak-company">{t('ops.integrations.apiKeys.company')}</label>
            <select id="ak-company" className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{t('ops.integrations.apiKeys.platformWide')}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-muted">{t('ops.integrations.apiKeys.companyHint')}</p>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} onConfirm={() => revoking && revoke.mutate(revoking.id)} title={t('ops.integrations.apiKeys.revoke')} message={t('ops.integrations.apiKeys.confirmRevoke')} loading={revoke.isPending} />
    </Panel>
  );
};

// ─── Webhooks ───────────────────────────────────────────────────────────

const DeliveriesLog = ({ hook }: { hook: Hook }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['webhook-deliveries', hook.id], queryFn: async () => (await api.get<{ deliveries: Delivery[] }>(`/admin/ops/webhooks/${hook.id}/deliveries`)).data.deliveries, refetchInterval: 30_000 });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/admin/ops/webhooks/deliveries/${id}/retry`),
    onSuccess: () => {
      toast.success(t('ops.integrations.webhooks.retried'));
      void qc.invalidateQueries({ queryKey: ['webhook-deliveries', hook.id] });
      void qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: toastOpsError,
  });
  const TONE = { PENDING: 'bg-warning-bg text-warning-fg', DELIVERED: 'bg-success-bg text-success-fg', FAILED: 'bg-danger-bg text-danger-fg' } as const;
  if (isLoading) return <LoadingBlock className="min-h-24" />;
  if (!data?.length) return <p className="px-1 py-3 text-xs text-muted">{t('ops.integrations.webhooks.noDeliveries')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="text-xs font-medium text-muted">
          <tr>
            <th className="py-1.5 pr-3">{t('ops.integrations.webhooks.event')}</th>
            <th className="py-1.5 pr-3">{t('ops.common.status')}</th>
            <th className="py-1.5 pr-3">{t('ops.integrations.webhooks.attempts')}</th>
            <th className="py-1.5 pr-3">{t('ops.integrations.webhooks.response')}</th>
            <th className="py-1.5 pr-3">{t('ops.integrations.webhooks.nextAttempt')}</th>
            <th className="py-1.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {data.map((d) => (
            <tr key={d.id}>
              <td className="py-1.5 pr-3"><span className="font-mono">{d.event}</span><span className="block text-[10px] text-muted">{fmtDateTime(d.createdAt)}</span></td>
              <td className="py-1.5 pr-3"><span className={clsx('badge', TONE[d.status])}>{t(`ops.integrations.webhooks.status.${d.status}`)}</span></td>
              <td className="py-1.5 pr-3 tabular-nums">{d.attempts}</td>
              <td className="py-1.5 pr-3">{d.responseCode ?? '—'}{d.lastError && <span className="block max-w-56 truncate text-[10px] text-danger-fg" title={d.lastError}>{d.lastError}</span>}</td>
              <td className="py-1.5 pr-3 text-muted">{d.status === 'PENDING' && d.nextAttemptAt ? fmtDateTime(d.nextAttemptAt) : d.deliveredAt ? fmtDateTime(d.deliveredAt) : '—'}</td>
              <td className="py-1.5 text-right">
                {d.status !== 'DELIVERED' && (
                  <button type="button" className="btn-secondary btn-sm" disabled={retry.isPending} onClick={() => retry.mutate(d.id)}>
                    <RefreshCw className="size-3" /> {t('ops.integrations.webhooks.retry')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const Webhooks = ({ companies }: { companies: CompanyOption[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Hook | null>(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['webhooks'], queryFn: async () => (await api.get<{ webhooks: Hook[]; events: string[] }>('/admin/ops/webhooks')).data });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['webhooks'] });
  const create = useMutation({
    mutationFn: () => api.post<{ secret: string }>('/admin/ops/webhooks', { url: url.trim(), events, companyId: companyId || null }),
    onSuccess: (res) => {
      toast.success(t('ops.integrations.webhooks.created'));
      setSecret(res.data.secret);
      setCreating(false);
      setUrl('');
      setEvents([]);
      invalidate();
    },
    onError: toastOpsError,
  });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/admin/ops/webhooks/${id}`, body), onSuccess: invalidate, onError: toastOpsError });
  const test = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; delivery: Delivery }>(`/admin/ops/webhooks/${id}/test`),
    onSuccess: (res, id) => {
      const d = res.data.delivery;
      if (res.data.ok) toast.success(t('ops.integrations.webhooks.testOk', { code: d.responseCode }));
      else toast.error(t('ops.integrations.webhooks.testFail', { error: d.lastError ?? d.responseCode ?? '?' }));
      void qc.invalidateQueries({ queryKey: ['webhook-deliveries', id] });
      invalidate();
    },
    onError: toastOpsError,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => api.post<{ secret: string }>(`/admin/ops/webhooks/${id}/rotate-secret`),
    onSuccess: (res) => {
      toast.success(t('ops.integrations.webhooks.rotated'));
      setSecret(res.data.secret);
    },
    onError: toastOpsError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/ops/webhooks/${id}`),
    onSuccess: () => {
      toast.success(t('ops.integrations.webhooks.deleted'));
      setDeleting(null);
      invalidate();
    },
    onError: toastOpsError,
  });
  const toggleEvent = (e: string) => setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  return (
    <Panel
      title={t('ops.integrations.webhooks.title')}
      icon={WebhookIcon}
      actions={
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> {t('ops.integrations.webhooks.new')}
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('ops.integrations.webhooks.hint')}</p>
      {secret && <div className="mb-4"><SecretBox secret={secret} hint={t('ops.integrations.webhooks.showOnce')} onClose={() => setSecret(null)} /></div>}
      {isLoading ? (
        <LoadingBlock className="min-h-32" />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : !data?.webhooks.length ? (
        <EmptyState icon={WebhookIcon} title={t('ops.integrations.webhooks.empty')} />
      ) : (
        <ul className="space-y-3">
          {data.webhooks.map((h) => (
            <li key={h.id} className="rounded-xl border border-line">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Switch checked={h.active} onChange={(active) => patch.mutate({ id: h.id, body: { active } })} label={t('ops.integrations.webhooks.active')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate code-id text-xs font-medium text-ink">{h.url}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted">
                    {h.events.map((e) => <span key={e} className="rounded bg-sunken px-1.5 py-0.5 code-id text-[10px]">{e}</span>)}
                    {h.company && <span className="rounded bg-primary/[0.06] px-1.5 py-0.5 text-link">{h.company.name}</span>}
                  </p>
                </div>
                <span className={clsx('text-[11px] tabular-nums', h.failed ? 'text-danger-fg' : 'text-muted')}>{t('ops.integrations.webhooks.stats', { failed: h.failed, pending: h.pending })}</span>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-secondary btn-sm" disabled={test.isPending} onClick={() => test.mutate(h.id)}>
                    <Send className="size-3.5" /> {t('ops.integrations.webhooks.test')}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
                    {t('ops.integrations.webhooks.deliveries')} ({h.deliveries})
                  </button>
                  <button type="button" className="btn-secondary btn-sm" disabled={rotate.isPending} onClick={() => rotate.mutate(h.id)}>
                    <RotateCw className="size-3.5" /> {t('ops.integrations.webhooks.rotate')}
                  </button>
                  <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setDeleting(h)} aria-label={t('ops.integrations.webhooks.delete')}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              {openId === h.id && <div className="border-t border-line bg-surface/40 px-4 py-2"><DeliveriesLog hook={h} /></div>}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('ops.integrations.webhooks.new')}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCreating(false)}>{t('ops.common.cancel')}</button>
            <button type="button" className="btn-primary btn-sm" disabled={!/^https?:\/\/.+/.test(url.trim()) || !events.length || create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('ops.common.create')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="wh-url">{t('ops.integrations.webhooks.url')}</label>
            <input id="wh-url" data-autofocus type="url" className="input font-mono text-sm" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <fieldset>
            <legend className="label">{t('ops.integrations.webhooks.events')}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(data?.events ?? []).map((e) => (
                <label key={e} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
                  <span><span className="block code-id text-xs text-ink">{e}</span><span className="text-xs text-muted">{t(`ops.integrations.webhooks.eventLabels.${e}`)}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label className="label" htmlFor="wh-company">{t('ops.integrations.webhooks.company')}</label>
            <select id="wh-company" className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">{t('ops.integrations.apiKeys.platformWide')}</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && remove.mutate(deleting.id)} title={t('ops.integrations.webhooks.delete')} message={t('ops.integrations.webhooks.confirmDelete')} loading={remove.isPending} />
    </Panel>
  );
};

// ─── API docs ───────────────────────────────────────────────────────────

const ENDPOINTS: { method: string; path: string; scope: Scope | '—'; key: string }[] = [
  { method: 'GET', path: '/api/v1/vacancies', scope: 'vacancies:read', key: 'vacancies' },
  { method: 'GET', path: '/api/v1/vacancies/{id}/applications', scope: 'applications:read', key: 'vacancyApplications' },
  { method: 'GET', path: '/api/v1/applications/{id}', scope: 'applications:read', key: 'application' },
  { method: 'PATCH', path: '/api/v1/applications/{id}', scope: 'applications:write', key: 'applicationPatch' },
  { method: 'GET', path: '/api/v1/candidates/{id}', scope: 'candidates:read', key: 'candidate' },
  { method: 'GET', path: '/api/v1/cases', scope: 'cases:read', key: 'cases' },
  { method: 'GET', path: '/api/v1/events?since=…', scope: 'events:read', key: 'events' },
  { method: 'GET', path: '/api/v1/openapi.json', scope: '—', key: 'openapi' },
];

const ApiDocs = ({ events }: { events: string[] }) => {
  const { t } = useTranslation();
  const base = `${window.location.origin}/api/v1`;
  const curl = `curl -H "Authorization: Bearer tv_XXXXXXXX" \\\n  "${base}/vacancies"\n\ncurl -X PATCH -H "Authorization: Bearer tv_XXXXXXXX" \\\n  -H "Content-Type: application/json" \\\n  -d '{"status":"INTERVIEW","note":"Next Tuesday 10:00"}' \\\n  "${base}/applications/APPLICATION_ID"`;
  const verify = `import crypto from 'node:crypto';\n\n// Express: keep the raw body (express.raw) and compare in constant time.\nconst verify = (secret, rawBody, header) => {\n  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');\n  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));\n};\n\napp.post('/hook', express.raw({ type: 'application/json' }), (req, res) => {\n  if (!verify(process.env.TV_WEBHOOK_SECRET, req.body, req.get('X-TV-Signature') ?? '')) return res.sendStatus(401);\n  const { event, at, data } = JSON.parse(req.body.toString());\n  // req.get('X-TV-Delivery') is unique per delivery: use it to ignore retries you already handled.\n  res.sendStatus(204);\n});`;
  return (
    <Panel title={t('ops.integrations.docs.title')} icon={BookText} actions={<a href="/api/v1/openapi.json" target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="size-3.5" /> {t('ops.integrations.docs.openapi')}</a>}>
      <p className="mb-4 text-sm text-muted">{t('ops.integrations.docs.hint', { base })}</p>
      <h3 className="mb-2 text-sm font-semibold text-ink">{t('ops.integrations.docs.endpoints')}</h3>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="min-w-full text-left text-xs">
          <tbody className="divide-y divide-line">
            {ENDPOINTS.map((e) => (
              <tr key={e.path + e.method}>
                <td className="px-3 py-2 font-mono whitespace-nowrap"><span className={clsx('mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold', e.method === 'GET' ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg')}>{e.method}</span>{e.path}</td>
                <td className="px-3 py-2 text-ink/80">{t(`ops.integrations.docs.endpointList.${e.key}`)}</td>
                <td className="px-3 py-2 code-id text-[10px] whitespace-nowrap text-muted">{e.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-1.5 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">{t('ops.integrations.docs.example')}</h3><CopyButton text={curl} /></div>
          <pre tabIndex={0} className="overflow-x-auto rounded-lg bg-navy-950 p-3 font-mono text-[11px] leading-relaxed text-white/90"><code>{curl}</code></pre>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">{t('ops.integrations.docs.signature')}</h3><CopyButton text={verify} /></div>
          <p className="mb-1.5 text-[11px] text-muted">{t('ops.integrations.docs.signatureHint')} {t('ops.integrations.docs.headers')}</p>
          <pre tabIndex={0} className="overflow-x-auto rounded-lg bg-navy-950 p-3 font-mono text-[11px] leading-relaxed text-white/90"><code>{verify}</code></pre>
        </div>
      </div>
      {events.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-1.5 text-sm font-semibold text-ink">{t('ops.integrations.docs.events')}</h3>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {events.map((e) => <li key={e}><span className="font-mono text-ink">{e}</span> <span className="text-muted">— {t(`ops.integrations.webhooks.eventLabels.${e}`)}</span></li>)}
          </ul>
        </div>
      )}
    </Panel>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function Integrations() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  usePageTitle(t('ops.integrations.title'));
  const { data: companies } = useQuery({ queryKey: ['company-options'], queryFn: async () => (await api.get<{ items: CompanyOption[] }>('/admin/companies/options')).data.items, staleTime: 300_000 });
  const { data: hooks } = useQuery({ queryKey: ['webhooks'], queryFn: async () => (await api.get<{ webhooks: Hook[]; events: string[] }>('/admin/ops/webhooks')).data, enabled: isAdmin });
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead title={t('ops.integrations.title')} subtitle={t('ops.integrations.subtitle')} />
      <CalendarFeed />
      {isAdmin && (
        <>
          <ApiKeys companies={companies ?? []} />
          <Webhooks companies={companies ?? []} />
        </>
      )}
      <ApiDocs events={hooks?.events ?? []} />
    </div>
  );
}
