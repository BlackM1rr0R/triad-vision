import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookText, Copy, Gauge, KeyRound, Plus, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPublicApiAdmin } from '@/i18n/pagesPublicApiAdmin';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { confirmDialog } from '@/components/ui/confirmStore';
import { errorMessage, fmtDateTime } from '@/components/admin/labels';
import { copyText } from '@/components/ops/shared';

registerCopy(pagesPublicApiAdmin);

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  rateLimitPerMinute: number;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  partner: { id: string; name: string; code: string | null } | null;
  requests30d: number;
  rateLimited30d: number;
  applications: number;
  daily: { day: string; requests: number }[];
}
interface Data {
  usageDays: number;
  partners: { id: string; name: string; active: boolean }[];
  keys: KeyRow[];
}

const QK = ['admin-public-api-keys'];
const onError = (err: unknown) => toast.error(errorMessage(err));

/** Tiny bar chart of the daily requests (last 30 days), decorative: the totals are shown as text. */
const Spark = ({ daily, days }: { daily: KeyRow['daily']; days: number }) => {
  const byDay = new Map(daily.map((d) => [d.day, d.requests]));
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const values = Array.from({ length: days }, (_, i) => byDay.get(new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10)) ?? 0);
  const max = Math.max(1, ...values);
  return (
    <svg viewBox={`0 0 ${days * 4} 24`} className="h-6 w-full max-w-40 text-primary" aria-hidden preserveAspectRatio="none">
      {values.map((v, i) => (
        <rect key={i} x={i * 4} y={24 - (v / max) * 24} width={3} height={(v / max) * 24} rx={0.5} fill="currentColor" opacity={v ? 0.85 : 0.15} />
      ))}
    </svg>
  );
};

const CreateForm = ({ partners, onCreated, onCancel }: { partners: Data['partners']; onCreated: (secret: string) => void; onCancel: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState('');
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('60');
  const create = useMutation({
    mutationFn: async () => (await api.post<{ secret: string }>('/admin/public-api-keys', { partnerId, name: name.trim(), rateLimitPerMinute: Number(limit) || 60 })).data,
    onSuccess: (d) => {
      toast.success(t('papi.created'));
      void qc.invalidateQueries({ queryKey: QK });
      onCreated(d.secret);
    },
    onError,
  });
  return (
    <form
      className="card mb-4 grid gap-3 p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (partnerId && name.trim().length >= 2) create.mutate();
      }}
    >
      <label className="text-sm">
        <span className="label">{t('papi.partner')}</span>
        <select className="input" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">{t('papi.choosePartner')}</option>
          {partners.filter((p) => p.active).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="label">{t('papi.name')}</span>
        <input className="input" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm">
        <span className="label">{t('papi.limit')}</span>
        <input className="input tabular-nums" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, '').slice(0, 4))} />
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" className="btn-primary btn-sm" disabled={create.isPending}>
          {create.isPending && <Spinner className="size-3.5" />} {t('papi.save')}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
          {t('papi.cancel')}
        </button>
      </div>
    </form>
  );
};

/** /admin/public-api-keys — keys of the public vacancy API (/api/public/v1) per referral partner, with usage. ADMIN+. */
export default function AdminPublicApiKeys() {
  const { t } = useTranslation();
  usePageTitle(t('papi.title'));
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const q = useQuery({ queryKey: QK, queryFn: async () => (await api.get<Data>('/admin/public-api-keys')).data });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/admin/public-api-keys/${id}/revoke`),
    onSuccess: () => {
      toast.success(t('papi.revokedToast'));
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError,
  });
  const setLimit = useMutation({
    mutationFn: ({ id, n }: { id: string; n: number }) => api.patch(`/admin/public-api-keys/${id}`, { rateLimitPerMinute: n }),
    onSuccess: () => {
      toast.success(t('papi.limitSaved'));
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError,
  });

  return (
    <div>
      <PageHeader
        title={t('papi.title')}
        subtitle={t('papi.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/developers" className="btn-secondary btn-sm" target="_blank" rel="noopener">
              <BookText className="size-4" aria-hidden /> {t('papi.docs')}
            </Link>
            <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> {t('papi.create')}
            </button>
          </div>
        }
      />
      {secret && (
        <div className="mb-4 rounded-xl border border-warning-border bg-warning-bg p-4" role="alert">
          <p className="text-sm font-semibold text-warning-fg">{t('papi.showOnce')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2 font-mono text-xs break-all text-ink">{secret}</code>
            <button type="button" className="btn-secondary btn-sm" onClick={async () => { if (await copyText(secret)) toast.success(t('papi.copied')); }}>
              <Copy className="size-3.5" aria-hidden /> {t('papi.copy')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSecret(null)}>
              {t('papi.close')}
            </button>
          </div>
        </div>
      )}
      {creating && q.data && (
        <CreateForm
          partners={q.data.partners}
          onCancel={() => setCreating(false)}
          onCreated={(s) => {
            setSecret(s);
            setCreating(false);
          }}
        />
      )}
      {q.isLoading ? (
        <Spinner />
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : q.data.keys.length === 0 ? (
        <p className="card p-6 text-center text-sm text-muted">{t('papi.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {q.data.keys.map((k) => (
            <li key={k.id} className={clsx('card p-4', k.revokedAt && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    <KeyRound className="size-4 text-muted" aria-hidden />
                    {k.partner?.name ?? t('papi.noPartner')} · {k.name}
                    {k.revokedAt && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger-fg">{t('papi.revoked')}</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    <span className="font-mono">{k.prefix}…</span>
                    {k.partner?.code && <span>· ref={k.partner.code}</span>}
                    <span>· {t('papi.perMinute', { n: k.rateLimitPerMinute })}</span>
                    <span>· {t('papi.createdAt')} {fmtDateTime(k.createdAt)}</span>
                    <span>· {t('papi.lastUsed')}: {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : t('papi.never')}</span>
                  </p>
                </div>
                {!k.revokedAt && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={setLimit.isPending}
                      onClick={() => {
                        const raw = window.prompt(t('papi.limit'), String(k.rateLimitPerMinute));
                        const n = Number(raw);
                        if (raw && Number.isInteger(n) && n >= 1 && n <= 6000) setLimit.mutate({ id: k.id, n });
                      }}
                    >
                      <Gauge className="size-3.5" aria-hidden /> {t('papi.editLimit')}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm text-danger-fg"
                      disabled={revoke.isPending}
                      onClick={async () => {
                        if (await confirmDialog({ title: t('papi.revokeTitle'), message: t('papi.revokeBody'), confirmLabel: t('papi.revoke') })) revoke.mutate(k.id);
                      }}
                    >
                      <ShieldOff className="size-3.5" aria-hidden /> {t('papi.revoke')}
                    </button>
                  </div>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{t('papi.requests', { days: q.data.usageDays })}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{k.requests30d.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('papi.rateLimited')}</dt>
                  <dd className={clsx('font-semibold tabular-nums', k.rateLimited30d ? 'text-warning-fg' : 'text-ink')}>{k.rateLimited30d.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('papi.applications')}</dt>
                  <dd className="font-semibold tabular-nums text-ink">{k.applications.toLocaleString()}</dd>
                </div>
                <div className="col-span-2 flex items-end sm:col-span-1">
                  <Spark daily={k.daily} days={q.data.usageDays} />
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">{t('papi.note')}</p>
    </div>
  );
}
