import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Gauge, Inbox, MailWarning, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n, { registerCopy } from '@/i18n';
import { pagesEmailDelivery } from '@/i18n/pagesEmailDelivery';
import { LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { fmtDateTime } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/status';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(pagesEmailDelivery);

/**
 * Admin → E-poçt göndərişi (ADMIN+): EmailLog per day / recipient domain, SMTP errors, bounces and complaints read
 * from the agency mailbox, the suppression list, the automatic external auto-send limit, and SPF / DKIM / DMARC of the
 * sending domain. Server: routes/admin/emailDelivery.ts, lib/deliverability.
 */

interface Health {
  factor: number;
  reason: 'BOUNCES' | null;
  changedAt: string | null;
  last: { sent: number; hardBounces: number; failures: number; rate: number; at: string } | null;
}

interface Overview {
  sendingDomain: string;
  days: { day: string; sent: number; failed: number; console: number; employer: number; campaign: number }[];
  domains: { domain: string; sent: number; failed: number; bounced: number }[];
  failures: { id: string; to: string; subject: string; error: string; responseCode: number | null; category: string | null; createdAt: string }[];
  bounces: { id: string; address: string; kind: 'HARD' | 'SOFT' | 'COMPLAINT'; status: string | null; diagnostic: string | null; source: 'DSN' | 'SMTP' | 'ARF'; at: string }[];
  suppressions: { id: string; address: string; reason: 'HARD_BOUNCE' | 'COMPLAINT' | 'MANUAL'; detail: string | null; at: string }[];
  suppressionCount: number;
  autoSend: {
    dailyLimit: number;
    effectiveLimit: number;
    health: Health;
    stats: { sent: number; failures: number; hardBounces: number };
    rules: { threshold: number; recoverBelow: number; minSample: number; cooldownHours: number; recoverDays: number };
  };
  mailboxes: { address: string; synced: boolean; lastSyncAt: string | null; error: boolean }[];
}

type CheckStatus = 'OK' | 'WARN' | 'MISSING' | 'ERROR';
interface RecordCheck {
  status: CheckStatus;
  records: string[];
  warnings: string[];
}
interface DnsView {
  domain: string;
  spf: RecordCheck;
  dmarc: RecordCheck & { policy: string | null };
  dkim: RecordCheck & { selectors: string[] };
  mx: string[];
  checkedAt: string;
}

const KEY = ['admin', 'email-delivery'];
const STATUS_TONE: Record<CheckStatus, BadgeTone> = { OK: 'success', WARN: 'warning', MISSING: 'danger', ERROR: 'danger' };
const KIND_TONE: Record<Overview['bounces'][number]['kind'], BadgeTone> = { HARD: 'danger', SOFT: 'warning', COMPLAINT: 'danger' };
const pct = (v: number) => `${Math.round(v * 1000) / 10} %`;

const deliveryError = (err: unknown) => {
  const key = `adminDelivery.errors.${errorCode(err)}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('adminDelivery.errors.generic'));
};

const th = 'px-2 py-1.5 text-left text-xs font-semibold text-muted';
const td = 'px-2 py-1.5 align-top';

const DnsPanel = () => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(0);
  const q = useQuery({
    queryKey: ['admin', 'email-delivery', 'dns', refresh],
    queryFn: async () => (await api.get<DnsView>('/admin/email-delivery/dns', { params: refresh ? { refresh: 1 } : {} })).data,
    staleTime: 10 * 60_000,
  });
  const rows: [string, RecordCheck][] = q.data ? [['SPF', q.data.spf], ['DKIM', q.data.dkim], ['DMARC', q.data.dmarc]] : [];
  return (
    <Panel
      title={t('adminDelivery.dns.title')}
      icon={ShieldCheck}
      actions={
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={q.isFetching} onClick={() => setRefresh((n) => n + 1)}>
          {t('adminDelivery.dns.check')}
        </Button>
      }
    >
      <p className="text-xs text-muted">{t('adminDelivery.dns.intro')}</p>
      {q.isLoading && <p className="mt-3 text-sm text-muted">{t('adminDelivery.dns.checking')}</p>}
      {q.isError && <p className="mt-3 text-sm text-danger">{t('adminDelivery.dns.warnings.DNS_ERROR')}</p>}
      {q.data && (
        <ul className="mt-3 space-y-3">
          {rows.map(([name, c]) => (
            <li key={name} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink">{name}</span>
                <Badge tone={STATUS_TONE[c.status]} dot>
                  {t(`adminDelivery.dns.status.${c.status}`)}
                </Badge>
                {name === 'DKIM' && q.data.dkim.selectors.length > 0 && <span className="text-xs text-muted">{t('adminDelivery.dns.selectors', { list: q.data.dkim.selectors.join(', ') })}</span>}
              </div>
              {c.records.map((r) => (
                <code key={r} className="mt-1 block break-all rounded bg-canvas px-2 py-1 text-[11px]">
                  {r}
                </code>
              ))}
              {c.warnings.map((w) => (
                <p key={w} className="mt-1 flex items-start gap-1.5 text-xs text-ink">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  {t(`adminDelivery.dns.warnings.${w}`, { defaultValue: w })}
                </p>
              ))}
            </li>
          ))}
          {q.data.mx.length > 0 && <li className="text-xs text-muted">{t('adminDelivery.dns.mx', { list: q.data.mx.join(', ') })}</li>}
        </ul>
      )}
    </Panel>
  );
};

export default function EmailDelivery() {
  const { t } = useTranslation();
  const uid = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Overview>('/admin/email-delivery')).data, staleTime: 30_000 });
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');

  const refetch = () => qc.invalidateQueries({ queryKey: KEY });
  const add = useMutation({
    mutationFn: async () => (await api.post('/admin/email-delivery/suppressions', { address: address.trim(), note: note.trim() || undefined })).data,
    onSuccess: async () => {
      toast.success(t('adminDelivery.suppressions.added'));
      setAddress('');
      setNote('');
      await refetch();
    },
    onError: (err) => toast.error(deliveryError(err)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/email-delivery/suppressions/${id}`)).data,
    onSuccess: async () => {
      toast.success(t('adminDelivery.suppressions.removed'));
      await refetch();
    },
    onError: (err) => toast.error(deliveryError(err)),
  });
  const reset = useMutation({
    mutationFn: async () => (await api.post('/admin/email-delivery/health/reset')).data,
    onSuccess: async () => {
      toast.success(t('adminDelivery.health.resetDone'));
      await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['admin', 'external-auto-overview'] })]);
    },
    onError: (err) => toast.error(deliveryError(err)),
  });

  if (q.isLoading || !q.data) return <LoadingBlock />;
  const d = q.data;
  const a = d.autoSend;
  const lowered = a.health.factor < 1;

  return (
    <div className="space-y-5">
      <PageHead
        title={t('adminDelivery.title')}
        subtitle={
          <>
            {t('adminDelivery.intro')} <span className="text-xs">{t('adminDelivery.sendingDomain', { domain: d.sendingDomain })}</span>
          </>
        }
        actions={
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={q.isFetching} onClick={() => void refetch()}>
            {t('adminDelivery.refresh')}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('adminDelivery.health.title')} icon={Gauge}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={lowered ? 'warning' : 'success'} dot>
              {t('adminDelivery.health.limit', { effective: a.effectiveLimit, configured: a.dailyLimit })}
            </Badge>
            {lowered && (
              <Button size="sm" variant="ghost" loading={reset.isPending} onClick={() => reset.mutate()}>
                {t('adminDelivery.health.reset')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-sm text-ink">{lowered ? t('adminDelivery.health.lowered', { rate: pct(a.health.last?.rate ?? 0) }) : t('adminDelivery.health.normal')}</p>
          <p className="mt-1 text-xs text-muted">{t('adminDelivery.health.stats', { sent: a.stats.sent, failed: a.stats.failures, bounced: a.stats.hardBounces })}</p>
          <p className="mt-1 text-xs text-muted">{t('adminDelivery.health.rules', { threshold: pct(a.rules.threshold), recover: pct(a.rules.recoverBelow), days: a.rules.recoverDays })}</p>
        </Panel>

        <Panel title={t('adminDelivery.mailboxes.title')} icon={Inbox}>
          <p className="text-xs text-muted">{t('adminDelivery.mailboxes.intro')}</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {d.mailboxes.map((m) => (
              <li key={m.address} className="flex flex-wrap items-center gap-2">
                {m.synced && !m.error ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <XCircle className="size-4 text-danger" aria-hidden />}
                <span className="font-medium text-ink">{m.address}</span>
                <span className="text-xs text-muted">
                  {m.error ? t('adminDelivery.mailboxes.error') : m.synced ? t('adminDelivery.mailboxes.synced') : t('adminDelivery.mailboxes.notSynced')}
                  {m.lastSyncAt ? ` · ${t('adminDelivery.mailboxes.lastSync', { at: fmtDateTime(m.lastSyncAt) })}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <DnsPanel />

      <Panel title={t('adminDelivery.days.title')} icon={MailWarning}>
        {d.days.length === 0 ? (
          <p className="text-sm text-muted">{t('adminDelivery.days.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr>
                  <th className={th}>{t('adminDelivery.days.day')}</th>
                  <th className={th}>{t('adminDelivery.days.sent')}</th>
                  <th className={th}>{t('adminDelivery.days.failed')}</th>
                  <th className={th}>{t('adminDelivery.days.console')}</th>
                  <th className={th}>{t('adminDelivery.days.employer')}</th>
                  <th className={th}>{t('adminDelivery.days.campaign')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.days.map((r) => (
                  <tr key={r.day}>
                    <td className={td}>{r.day}</td>
                    <td className={td}>{r.sent}</td>
                    <td className={`${td} ${r.failed ? 'font-semibold text-danger' : ''}`}>{r.failed}</td>
                    <td className={td}>{r.console}</td>
                    <td className={td}>{r.employer}</td>
                    <td className={td}>{r.campaign}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t('adminDelivery.domains.title')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr>
                  <th className={th}>{t('adminDelivery.domains.domain')}</th>
                  <th className={th}>{t('adminDelivery.domains.sent')}</th>
                  <th className={th}>{t('adminDelivery.domains.failed')}</th>
                  <th className={th}>{t('adminDelivery.domains.bounced')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.domains.map((r) => (
                  <tr key={r.domain}>
                    <td className={`${td} break-all`}>{r.domain}</td>
                    <td className={td}>{r.sent}</td>
                    <td className={td}>{r.failed}</td>
                    <td className={`${td} ${r.bounced ? 'font-semibold text-danger' : ''}`}>{r.bounced}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title={t('adminDelivery.failures.title')}>
          {d.failures.length === 0 ? (
            <p className="text-sm text-muted">{t('adminDelivery.failures.empty')}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {d.failures.map((f) => (
                <li key={f.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink break-all">{f.to}</span>
                    {f.responseCode != null && (
                      <Badge tone={f.responseCode >= 500 ? 'danger' : 'warning'}>
                        {f.responseCode} · {f.responseCode >= 500 ? t('adminDelivery.failures.permanent') : t('adminDelivery.failures.temporary')}
                      </Badge>
                    )}
                    <span className="text-xs text-muted">{fmtDateTime(f.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted break-words">{f.error}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title={t('adminDelivery.bounces.title')}>
        {d.bounces.length === 0 ? (
          <p className="text-sm text-muted">{t('adminDelivery.bounces.empty')}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.bounces.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium text-ink break-all">{b.address}</span>
                <Badge tone={KIND_TONE[b.kind]} dot>
                  {t(`adminDelivery.bounces.kinds.${b.kind}`)}
                  {b.status ? ` · ${b.status}` : ''}
                </Badge>
                <span className="text-xs text-muted">
                  {t(`adminDelivery.bounces.sources.${b.source}`)} · {fmtDateTime(b.at)}
                </span>
                {b.diagnostic && <p className="w-full text-xs text-muted break-words">{b.diagnostic}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t('adminDelivery.suppressions.title', { n: d.suppressionCount })}>
        <p className="text-xs text-muted">{t('adminDelivery.suppressions.intro')}</p>
        <form
          className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (address.trim()) add.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor={`${uid}-addr`}>
              {t('adminDelivery.suppressions.addressLabel')}
            </label>
            <input id={`${uid}-addr`} type="email" required maxLength={190} className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-note`}>
              {t('adminDelivery.suppressions.noteLabel')}
            </label>
            <input id={`${uid}-note`} maxLength={300} className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" size="sm" loading={add.isPending}>
            {t('adminDelivery.suppressions.add')}
          </Button>
        </form>
        {d.suppressions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('adminDelivery.suppressions.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {d.suppressions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium text-ink break-all">{s.address}</span>
                <Badge tone={s.reason === 'MANUAL' ? 'neutral' : 'danger'}>{t(`adminDelivery.suppressions.reasons.${s.reason}`)}</Badge>
                <span className="text-xs text-muted">{fmtDateTime(s.at)}</span>
                {s.detail && <span className="text-xs text-muted break-words">{s.detail}</span>}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Trash2}
                  className="ml-auto"
                  loading={remove.isPending && remove.variables === s.id}
                  onClick={async () => {
                    if (await confirmDialog({ tone: 'danger', message: t('adminDelivery.suppressions.removeConfirm', { address: s.address }), confirmLabel: t('adminDelivery.suppressions.remove') })) remove.mutate(s.id);
                  }}
                >
                  {t('adminDelivery.suppressions.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
