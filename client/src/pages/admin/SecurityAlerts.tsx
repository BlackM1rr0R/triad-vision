import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellOff, Check, KeyRound, LogOut, Save, ScanSearch, Settings2, ShieldAlert, ShieldCheck, Sparkles, UserX } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { currentLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDateTime, fmtRelative } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { SEVERITY_TONE, type Severity } from '@/components/aiMgmt/shared';

type Status = 'OPEN' | 'ACKNOWLEDGED' | 'FALSE_POSITIVE';
type Filter = Status | 'all';
type Action = 'ack' | 'revoke' | 'disable' | 'reset2fa' | 'falsePositive';

interface Alert {
  id: string;
  rule: string;
  severity: Severity;
  status: Status;
  userId: string | null;
  ip: string | null;
  title: string;
  summary: string;
  facts: Record<string, unknown>;
  hits: number;
  explanation: { summary: string; actions: string[] } | null;
  actions: { action: string; by: string; at: string }[];
  firstSeenAt: string;
  lastSeenAt: string;
  subject: { id: string; name: string; email: string; role: string; isActive: boolean; twoFactor: boolean; activeSessions: number } | null;
}

const RULES = ['failedLoginsAccount', 'failedLoginsIp', 'newIpLogin', 'unusualHourLogin', 'bulkDownload', 'bulkDelete', 'twoFactorDisabled', 'roleEscalation', 'apiKeyCreated'] as const;
type RuleKey = (typeof RULES)[number];
const NUMBER_FIELDS = ['threshold', 'windowMinutes', 'minPriorLogins', 'minLogins', 'exportThreshold', 'accountThreshold'] as const;
type RuleSettings = { enabled: boolean; severity: Severity } & Partial<Record<(typeof NUMBER_FIELDS)[number], number>>;
interface SecuritySettings {
  aiExplain: boolean;
  emailHigh: boolean;
  dedupeHours: number;
  rules: Record<RuleKey, RuleSettings>;
}

/** Facts shown in the table (identifiers like the account are shown separately). */
const FACT_KEYS = ['attempts', 'windowMinutes', 'ips', 'ip', 'accounts', 'network', 'priorLogins', 'knownNetworks', 'hour', 'usualHours', 'files', 'downloads', 'zipExports', 'datasetExports', 'items', 'usersDeleted', 'mailboxesDeleted', 'newRole', 'by', 'keyName', 'role'];

const fmtFact = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v === null || v === undefined || v === '' ? null : String(v));

const AlertCard = ({ alert, highlighted, onChanged }: { alert: Alert; highlighted: boolean; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const locale = currentLocale();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState<Action | 'explain' | null>(null);
  const s = alert.subject;
  const resolved = alert.status !== 'OPEN';

  const run = async (action: Action) => {
    setBusy(action);
    try {
      if (action === 'ack') await api.post(`/admin/mgmt/security/alerts/${alert.id}/ack`, {});
      else if (action === 'falsePositive') await api.post(`/admin/mgmt/security/alerts/${alert.id}/false-positive`, {});
      else {
        // The existing super-admin endpoints do the work; the alert records what was done.
        if (action === 'revoke') await api.post(`/admin/users/${s!.id}/revoke-sessions`, {});
        if (action === 'disable') await api.patch(`/admin/users/${s!.id}`, { isActive: false });
        if (action === 'reset2fa') await api.post(`/auth/2fa/users/${s!.id}/reset`, {});
        await api.post(`/admin/mgmt/security/alerts/${alert.id}/actions`, { action: action === 'revoke' ? 'REVOKE_SESSIONS' : action === 'disable' ? 'DISABLE_USER' : 'RESET_2FA' });
      }
      toast.success(t(`aiMgmt.security.done.${action}`));
      onChanged();
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  const explain = async () => {
    setBusy('explain');
    try {
      const res = (await api.post<{ reason: string | null }>(`/admin/mgmt/security/alerts/${alert.id}/explain`, {}, { params: { locale } })).data;
      if (res.reason) toast.error(t('aiMgmt.security.explainFailed'));
      onChanged();
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setBusy(null);
    }
  };

  const facts = FACT_KEYS.map((k) => [k, fmtFact(alert.facts[k])] as const).filter(([, v]) => v !== null);
  const isSelf = s?.id === user?.id;
  const button = (action: Action, icon: ReactNode, show = true, danger = false) =>
    show ? (
      <button
        type="button"
        className={clsx('btn-sm border', danger ? 'border-red-200 bg-card text-red-700 hover:bg-red-50' : 'btn-white border-line')}
        disabled={!!busy}
        onClick={() => (action === 'ack' ? void run('ack') : setConfirm(action))}
      >
        {busy === action ? <Spinner className="size-3.5" /> : icon} {t(`aiMgmt.security.${action}`)}
      </button>
    ) : null;

  return (
    <article id={`alert-${alert.id}`} className={clsx('rounded-xl border bg-card p-4 sm:p-5', highlighted ? 'border-brand-400 ring-2 ring-brand-100' : 'border-line', resolved && 'opacity-80')}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', SEVERITY_TONE[alert.severity])}>{t(`aiMgmt.security.severity.${alert.severity}`)}</span>
            <h3 className="text-sm font-semibold text-navy-900">{alert.title}</h3>
            {resolved && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">{t(`aiMgmt.security.status.${alert.status}`)}</span>}
          </div>
          <p className="mt-1 text-sm text-ink">{alert.summary}</p>
        </div>
        <p className="shrink-0 text-right text-[11px] text-muted" title={`${t('aiMgmt.security.firstSeen')}: ${fmtDateTime(alert.firstSeenAt)}`}>
          {fmtRelative(alert.lastSeenAt)}
          {alert.hits > 1 && <span className="block">{t('aiMgmt.security.times', { count: alert.hits })}</span>}
        </p>
      </header>

      {s && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="font-semibold text-ink">{t('aiMgmt.security.account')}:</span> {s.name} · {s.email} · {s.role}
          {!s.isActive && <span className="rounded-full bg-red-100 px-2 text-red-700">{t('aiMgmt.security.inactive')}</span>}
          <span>· {t('aiMgmt.security.sessions', { count: s.activeSessions })}</span>
          {!s.twoFactor && <span className="rounded-full bg-amber-100 px-2 text-amber-800">{t('aiMgmt.security.noTwoFactor')}</span>}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface p-3 text-xs sm:grid-cols-3">
            {facts.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-muted">{t(`aiMgmt.security.factLabels.${k}`)}</dt>
                <dd className="truncate font-semibold text-ink" title={v ?? undefined}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="rounded-lg border border-brand-100 bg-brand-50/50 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand-700">
            <Sparkles className="size-3.5" aria-hidden /> {t('aiMgmt.security.ai')}
          </p>
          {alert.explanation ? (
            <>
              <p className="text-ink">{alert.explanation.summary}</p>
              {alert.explanation.actions.length > 0 && (
                <>
                  <p className="mt-2 text-xs font-semibold text-muted">{t('aiMgmt.security.recommended')}</p>
                  <ul className="list-disc pl-5 text-ink">{alert.explanation.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                </>
              )}
            </>
          ) : (
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void explain()}>
              {busy === 'explain' ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" aria-hidden />} {t('aiMgmt.security.explain')}
            </button>
          )}
        </div>
      </div>

      <footer className="mt-4 flex flex-wrap gap-2">
        {button('ack', <Check className="size-3.5" aria-hidden />, alert.status === 'OPEN')}
        {button('revoke', <LogOut className="size-3.5" aria-hidden />, !!s && s.activeSessions > 0 && !isSelf, true)}
        {button('disable', <UserX className="size-3.5" aria-hidden />, !!s && s.isActive && s.role !== 'SUPER_ADMIN' && !isSelf, true)}
        {button('reset2fa', <KeyRound className="size-3.5" aria-hidden />, !!s && s.twoFactor && !isSelf, true)}
        {button('falsePositive', <BellOff className="size-3.5" aria-hidden />, alert.status !== 'FALSE_POSITIVE')}
      </footer>

      {alert.actions.length > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          {t('aiMgmt.security.log')}: {alert.actions.map((a) => `${t(`aiMgmt.security.logActions.${a.action}`, { defaultValue: a.action })} (${fmtDateTime(a.at)})`).join(' · ')}
        </p>
      )}

      <ConfirmDialog
        open={!!confirm && confirm !== 'ack'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && void run(confirm)}
        loading={!!busy}
        tone={confirm === 'falsePositive' ? 'primary' : 'danger'}
        title={confirm ? t(`aiMgmt.security.${confirm}`) : ''}
        message={confirm && confirm !== 'ack' ? t(`aiMgmt.security.confirm.${confirm}`) : undefined}
        confirmLabel={confirm ? t(`aiMgmt.security.${confirm}`) : undefined}
      />
    </article>
  );
};

const RulesPanel = () => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['mgmt', 'security', 'settings'], queryFn: async () => (await api.get<{ settings: SecuritySettings }>('/admin/mgmt/security/settings')).data.settings });
  const [form, setForm] = useState<SecuritySettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (q.data && !form) setForm(q.data);
  }, [q.data, form]);
  if (!form) return q.error ? <ErrorBlock error={q.error} /> : <LoadingBlock className="min-h-24" />;

  const setRule = (k: RuleKey, patch: Partial<RuleSettings>) => setForm({ ...form, rules: { ...form.rules, [k]: { ...form.rules[k], ...patch } } });
  const valid = Number.isFinite(form.dedupeHours) && RULES.every((k) => NUMBER_FIELDS.every((f) => form.rules[k][f] === undefined || Number.isFinite(form.rules[k][f])));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put<{ settings: SecuritySettings }>('/admin/mgmt/security/settings', form);
      setForm(data.settings);
      toast.success(t('aiMgmt.security.settings.saved'));
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t('aiMgmt.security.settings.title')} icon={Settings2} className="bg-card">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t('aiMgmt.security.settings.aiExplain')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('aiMgmt.security.settings.aiExplainHint')}</p>
          </div>
          <Switch checked={form.aiExplain} onChange={(v) => setForm({ ...form, aiExplain: v })} label={t('aiMgmt.security.settings.aiExplain')} />
        </div>
        <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <div>
            <p className="text-sm font-semibold text-ink">{t('aiMgmt.security.settings.emailHigh')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('aiMgmt.security.settings.emailHighHint')}</p>
          </div>
          <Switch checked={form.emailHigh} onChange={(v) => setForm({ ...form, emailHigh: v })} label={t('aiMgmt.security.settings.emailHigh')} />
        </div>
        <label className="block rounded-lg border border-line bg-surface p-3">
          <span className="text-sm font-semibold text-ink">{t('aiMgmt.security.settings.dedupeHours')}</span>
          <input type="number" min={1} max={168} className="input mt-1" value={Number.isFinite(form.dedupeHours) ? form.dedupeHours : ''} onChange={(e) => setForm({ ...form, dedupeHours: e.target.value === '' ? NaN : Number(e.target.value) })} />
          <span className="mt-1 block text-[11px] text-muted">{t('aiMgmt.security.settings.dedupeHoursHint')}</span>
        </label>
      </div>

      <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
        {RULES.map((k) => {
          const r = form.rules[k];
          return (
            <li key={k} className="flex flex-wrap items-end gap-3 p-3">
              <div className="flex min-w-[14rem] flex-1 items-center gap-3">
                <Switch checked={r.enabled} onChange={(v) => setRule(k, { enabled: v })} label={t(`aiMgmt.security.settings.rules.${k}`)} />
                <span className={clsx('text-sm font-semibold', r.enabled ? 'text-ink' : 'text-muted')}>{t(`aiMgmt.security.settings.rules.${k}`)}</span>
              </div>
              <label className="block">
                <span className="text-[11px] text-muted">{t('aiMgmt.security.settings.fields.severity')}</span>
                <select className="input mt-0.5 !w-auto !py-1.5 text-xs" value={r.severity} disabled={!r.enabled} onChange={(e) => setRule(k, { severity: e.target.value as Severity })}>
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((sv) => (
                    <option key={sv} value={sv}>
                      {t(`aiMgmt.security.severity.${sv}`)}
                    </option>
                  ))}
                </select>
              </label>
              {NUMBER_FIELDS.filter((f) => r[f] !== undefined).map((f) => (
                <label key={f} className="block">
                  <span className="text-[11px] text-muted">{t(`aiMgmt.security.settings.fields.${f}`)}</span>
                  <input
                    type="number"
                    min={1}
                    className="input mt-0.5 !w-24 !py-1.5 text-xs"
                    disabled={!r.enabled}
                    value={Number.isFinite(r[f]) ? r[f] : ''}
                    onChange={(e) => setRule(k, { [f]: e.target.value === '' ? NaN : Number(e.target.value) })}
                  />
                </label>
              ))}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primary btn-sm" disabled={saving || !valid} onClick={() => void save()}>
          {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" aria-hidden />} {t('aiMgmt.security.settings.save')}
        </button>
      </div>
    </Panel>
  );
};

/** Admin → Security alerts (super admin): deterministic rule hits with AI explanation and one-click actions. */
export default function AdminSecurityAlerts() {
  const { t } = useTranslation();
  usePageTitle(t('aiMgmt.security.title'));
  const qc = useQueryClient();
  const locale = currentLocale();
  const [params] = useSearchParams();
  const highlight = params.get('id');
  const [filter, setFilter] = useState<Filter>(highlight ? 'all' : 'OPEN');
  const [scanning, setScanning] = useState(false);
  const q = useQuery({
    queryKey: ['mgmt', 'security', 'alerts', filter, locale],
    queryFn: async () => (await api.get<{ items: Alert[]; counts: Partial<Record<Status, number>> }>('/admin/mgmt/security/alerts', { params: { status: filter, locale } })).data,
    refetchInterval: 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['mgmt', 'security'] });
  };

  useEffect(() => {
    if (highlight && q.data) document.getElementById(`alert-${highlight}`)?.scrollIntoView({ block: 'center' });
  }, [highlight, q.data]);

  const scan = async () => {
    setScanning(true);
    try {
      const res = (await api.post<{ created: string[] }>('/admin/mgmt/security/scan', {})).data;
      toast.success(t('aiMgmt.security.scanned', { count: res.created.length }));
      refresh();
    } catch (err) {
      toast.error(errorCode(err));
    } finally {
      setScanning(false);
    }
  };

  const counts = q.data?.counts ?? {};
  const total = (counts.OPEN ?? 0) + (counts.ACKNOWLEDGED ?? 0) + (counts.FALSE_POSITIVE ?? 0);
  return (
    <div className="space-y-6">
      <PageHead
        title={t('aiMgmt.security.title')}
        subtitle={t('aiMgmt.security.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" disabled={scanning} onClick={() => void scan()}>
            {scanning ? <Spinner className="size-3.5" /> : <ScanSearch className="size-3.5" aria-hidden />} {t('aiMgmt.security.scan')}
          </button>
        }
      />
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'all'] as const).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={f === 'all' ? total : (counts[f] ?? 0)}>
            {t(`aiMgmt.security.filters.${f}`)}
          </Chip>
        ))}
      </div>
      {q.isLoading ? (
        <LoadingBlock />
      ) : q.error ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data?.items.length ? (
        <div className="space-y-4">
          {q.data.items.map((a) => (
            <AlertCard key={a.id} alert={a} highlighted={a.id === highlight} onChanged={refresh} />
          ))}
        </div>
      ) : (
        <Panel className="bg-card">
          <EmptyState icon={filter === 'OPEN' ? ShieldCheck : ShieldAlert} title={t('aiMgmt.security.empty')}>
            {t('aiMgmt.security.emptyHint')}
          </EmptyState>
        </Panel>
      )}
      <RulesPanel />
    </div>
  );
}
