import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Copy, PhoneCall, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { PageHead, Panel } from '@/components/admin/ui';
import { Tabs } from '@/components/ui/Tabs';
import { CallLog } from '@/components/calls/CallLog';
import { CallButton } from '@/components/calls/CallButton';
import { bakuDateTime, bakuTime, callError } from '@/components/calls/api';

registerCopy(pagesCalls);

type Tab = 'calls' | 'callbacks' | 'settings';
const LOCALES = ['az', 'de', 'en', 'ru'] as const;

/** Admin → Zənglər: call log, "call me back" requests and (ADMIN+) the telephony provider settings. */
export default function Calls() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const admin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || (params.get('callback') ? 'callbacks' : 'calls');
  const tabs: Tab[] = admin ? ['calls', 'callbacks', 'settings'] : ['calls', 'callbacks'];
  return (
    <div className="space-y-5">
      <PageHead title={t('calls.page.title')} subtitle={t('calls.page.subtitle')} />
      <Tabs label={t('calls.page.title')} items={tabs.map((k) => ({ key: k, label: t(`calls.page.tabs.${k}`) }))} value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
      {tab === 'calls' && <CallsTab />}
      {tab === 'callbacks' && <CallbacksTab highlight={params.get('callback')} />}
      {tab === 'settings' && admin && <SettingsTab />}
    </div>
  );
}

const CallsTab = () => {
  const { t } = useTranslation();
  const [mine, setMine] = useState(false);
  return (
    <Panel
      title={t('calls.log.title')}
      icon={PhoneCall}
      actions={
        <label className="flex items-center gap-2 text-xs font-semibold text-ink">
          <input type="checkbox" className="size-4" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('calls.page.mine')}
        </label>
      }
    >
      <CallLog mine={mine} />
    </Panel>
  );
};

interface Callback {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  locale: string;
  topic: string | null;
  message: string | null;
  asap: boolean;
  windowStart: string;
  windowEnd: string;
  source: string;
  clientId: string | null;
  inquiryId: string | null;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  outcome: string | null;
  note: string | null;
  assignees: { id: string; firstName: string; lastName: string }[];
}

const CallbacksTab = ({ highlight }: { highlight: string | null }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<'PENDING' | 'DONE' | 'CANCELLED' | 'ALL'>('PENDING');
  const [mine, setMine] = useState(false);
  const q = useQuery({
    queryKey: ['callbacks', status, mine],
    queryFn: async () => (await api.get<{ callbacks: Callback[] }>('/calls/callbacks', { params: { status, mine: mine ? '1' : undefined } })).data.callbacks,
    refetchInterval: 60_000,
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/calls/callbacks/${id}`, { cancel: true })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['callbacks'] }),
    onError: (e) => toast.error(callError(t, e)),
  });
  const now = Date.now();
  return (
    <Panel
      title={t('calls.page.tabs.callbacks')}
      icon={PhoneCall}
      actions={
        <>
          <select className="input min-h-9 w-auto py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t('calls.statusLabel')}>
            {(['PENDING', 'DONE', 'CANCELLED', 'ALL'] as const).map((s) => (
              <option key={s} value={s}>
                {t(`calls.callbacks.statusFilter.${s}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" className="size-4" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {t('calls.page.mine')}
          </label>
        </>
      }
    >
      {!q.data?.length && <p className="text-sm text-muted">{q.isLoading ? '…' : t('calls.callbacks.empty')}</p>}
      <ul className="divide-y divide-line">
        {q.data?.map((cb) => {
          const late = cb.status === 'PENDING' && Date.parse(cb.windowEnd) < now;
          return (
            <li key={cb.id} className={clsx('flex flex-col gap-2 py-3 sm:flex-row sm:items-center', highlight === cb.id && 'rounded-lg bg-primary/[0.04] px-2')}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {cb.name} <span className="font-normal text-muted">{cb.phone}</span>
                  <span className="text-[10px] font-semibold text-muted uppercase">{cb.locale}</span>
                  {late && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger-fg">{t('calls.callbacks.overdue')}</span>}
                  {cb.outcome && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold">{t(`calls.outcome.${cb.outcome}`)}</span>}
                </p>
                <p className="text-xs text-muted">
                  {cb.asap ? `${t('calls.callbacks.asap')} · ` : ''}
                  {bakuDateTime(cb.windowStart, i18n.language)}–{bakuTime(cb.windowEnd, i18n.language)} (Bakı)
                  {cb.topic ? ` · ${t(`callback.topics.${cb.topic}`)}` : ''} · {cb.source}
                  {cb.assignees.length ? ` · ${cb.assignees.map((a) => `${a.firstName} ${a.lastName}`).join(', ')}` : ''}
                </p>
                {cb.message && <p className="mt-1 line-clamp-2 text-xs text-ink">{cb.message}</p>}
                {cb.note && <p className="mt-1 text-xs text-ink italic">{cb.note}</p>}
              </div>
              {cb.status === 'PENDING' && (
                <div className="flex flex-wrap gap-2">
                  <CallButton target={{ callbackId: cb.id }} phone={cb.phone} name={cb.name} />
                  <button type="button" className="btn-secondary btn-sm border border-line" disabled={cancel.isPending} onClick={() => cancel.mutate(cb.id)}>
                    {t('calls.callbacks.cancel')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

interface SettingsView {
  provider: 'none' | 'twilio' | 'sipgate' | 'fake';
  ready: boolean;
  callerId: string;
  recording: boolean;
  recordingNotice: Record<(typeof LOCALES)[number], string>;
  webhookBaseUrl: string;
  effectiveWebhookBase: string;
  inboundForwardTo: string;
  officeHours: { days: number[]; from: string; to: string } | null;
  twilio: { accountSid: string; hasAuthToken: boolean };
  sipgate: { tokenId: string; hasToken: boolean; deviceId: string; allowedIps: string[] };
  webhooks: { twilioVoice: string; sipgate: string };
  fakeAllowed: boolean;
}

const SettingsTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['calls', 'settings'], queryFn: async () => (await api.get<{ settings: SettingsView }>('/calls/settings')).data.settings });
  const [f, setF] = useState<SettingsView | null>(null);
  const [secrets, setSecrets] = useState({ twilioToken: '', sipgateToken: '', rotate: false });
  const [ips, setIps] = useState('');
  useEffect(() => {
    if (q.data) {
      setF(q.data);
      setIps(q.data.sipgate.allowedIps.join(', '));
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      const s = f!;
      return (
        await api.put<{ settings: SettingsView }>('/calls/settings', {
          provider: s.provider,
          callerId: s.callerId,
          recording: s.recording,
          recordingNotice: s.recordingNotice,
          webhookBaseUrl: s.webhookBaseUrl,
          inboundForwardTo: s.inboundForwardTo,
          officeHours: s.officeHours,
          twilio: { accountSid: s.twilio.accountSid, ...(secrets.twilioToken ? { authToken: secrets.twilioToken } : {}) },
          sipgate: {
            tokenId: s.sipgate.tokenId,
            deviceId: s.sipgate.deviceId,
            allowedIps: ips
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
            ...(secrets.sipgateToken ? { token: secrets.sipgateToken } : {}),
            ...(secrets.rotate ? { rotateWebhookToken: true } : {}),
          },
        })
      ).data.settings;
    },
    onSuccess: (s) => {
      qc.setQueryData(['calls', 'settings'], { settings: s });
      void qc.invalidateQueries({ queryKey: ['calls', 'status'] });
      setSecrets({ twilioToken: '', sipgateToken: '', rotate: false });
      toast.success(t('calls.settings.saved'));
    },
    onError: (e) => toast.error(callError(t, e)),
  });
  if (!f) return <p className="text-sm text-muted">…</p>;
  const set = (patch: Partial<SettingsView>) => setF({ ...f, ...patch });
  const days = t('calls.settings.days', { returnObjects: true }) as string[];
  const copy = (v: string) => void navigator.clipboard?.writeText(v).then(() => toast.success('OK'));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Panel title={t('calls.settings.provider')} icon={Settings} actions={<span className={clsx('inline-flex items-center gap-1 text-xs font-semibold', f.ready ? 'text-success-fg' : 'text-warning-fg')}>{f.ready ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />} {f.ready ? t('calls.settings.ready') : f.provider === 'none' ? t('calls.notConfigured') : t('calls.settings.notReady')}</span>}>
        <div className="space-y-4">
          {f.provider === 'none' && <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs text-warning-fg">{t('calls.setupSteps')}</p>}
          <div className="flex flex-wrap gap-2">
            {(['none', 'twilio', 'sipgate', ...(f.fakeAllowed ? ['fake'] : [])] as SettingsView['provider'][]).map((p) => (
              <button key={p} type="button" aria-pressed={f.provider === p} onClick={() => set({ provider: p })} className={clsx('min-h-9 rounded-lg border px-3 text-sm font-semibold', f.provider === p ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink')}>
                {t(`calls.settings.providers.${p}`)}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('calls.settings.callerId')} hint={t('calls.settings.callerIdHint')} value={f.callerId} onChange={(v) => set({ callerId: v })} />
            <Field label={t('calls.settings.webhookBase')} hint={`${t('calls.settings.webhookBaseHint')} — ${f.effectiveWebhookBase}`} value={f.webhookBaseUrl} onChange={(v) => set({ webhookBaseUrl: v })} />
          </div>
          {f.provider === 'twilio' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('calls.settings.twilioSid')} value={f.twilio.accountSid} onChange={(v) => set({ twilio: { ...f.twilio, accountSid: v } })} />
              <Field label={t('calls.settings.twilioToken')} type="password" hint={f.twilio.hasAuthToken ? t('calls.settings.secretSet') : undefined} value={secrets.twilioToken} onChange={(v) => setSecrets({ ...secrets, twilioToken: v })} />
              <Field label={t('calls.settings.forward')} hint={t('calls.settings.forwardHint')} value={f.inboundForwardTo} onChange={(v) => set({ inboundForwardTo: v })} />
            </div>
          )}
          {f.provider === 'sipgate' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('calls.settings.sipgateTokenId')} value={f.sipgate.tokenId} onChange={(v) => set({ sipgate: { ...f.sipgate, tokenId: v } })} />
              <Field label={t('calls.settings.sipgateToken')} type="password" hint={f.sipgate.hasToken ? t('calls.settings.secretSet') : undefined} value={secrets.sipgateToken} onChange={(v) => setSecrets({ ...secrets, sipgateToken: v })} />
              <Field label={t('calls.settings.sipgateDevice')} value={f.sipgate.deviceId} onChange={(v) => set({ sipgate: { ...f.sipgate, deviceId: v } })} />
              <Field label={t('calls.settings.sipgateIps')} value={ips} onChange={setIps} />
              <label className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" className="size-4" checked={secrets.rotate} onChange={(e) => setSecrets({ ...secrets, rotate: e.target.checked })} /> {t('calls.settings.rotate')}
              </label>
            </div>
          )}
          {(f.provider === 'twilio' || f.provider === 'sipgate') && (
            <div className="space-y-2 rounded-lg border border-line bg-sunken p-3">
              <p className="text-xs font-bold text-ink">{t('calls.settings.webhooks')}</p>
              {[[t(f.provider === 'twilio' ? 'calls.settings.twilioVoice' : 'calls.settings.sipgateHook'), f.provider === 'twilio' ? f.webhooks.twilioVoice : f.webhooks.sipgate]].map(([label, url]) => (
                <div key={label} className="space-y-1">
                  <p className="text-[11px] text-muted">{label}</p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-card px-2 py-1 text-[11px] text-ink">{url}</code>
                    <button type="button" className="grid size-8 place-items-center rounded-lg border border-line bg-card" onClick={() => copy(url)} aria-label="Copy">
                      <Copy className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title={t('calls.settings.recording')} icon={AlertTriangle}>
        <div className="space-y-3">
          <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-xs text-warning-fg">{t('calls.settings.recordingWarn')}</p>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="size-4" checked={f.recording} onChange={(e) => set({ recording: e.target.checked })} /> {t('calls.settings.recording')}
          </label>
          <p className="text-xs font-semibold text-muted">{t('calls.settings.notice')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {LOCALES.map((l) => (
              <label key={l} className="block">
                <span className="label uppercase">{l}</span>
                <textarea className="input min-h-16 text-xs" maxLength={600} value={f.recordingNotice[l]} onChange={(e) => set({ recordingNotice: { ...f.recordingNotice, [l]: e.target.value } })} />
              </label>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title={t('calls.settings.hours')}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!f.officeHours} onClick={() => set({ officeHours: null })} className={clsx('min-h-9 rounded-lg border px-3 text-xs font-semibold', !f.officeHours ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink')}>
              {t('calls.settings.hoursSite')}
            </button>
            <button type="button" aria-pressed={!!f.officeHours} onClick={() => set({ officeHours: f.officeHours ?? { days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' } })} className={clsx('min-h-9 rounded-lg border px-3 text-xs font-semibold', f.officeHours ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink')}>
              {t('calls.settings.hoursCustom')}
            </button>
          </div>
          {f.officeHours && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const on = f.officeHours!.days.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ officeHours: { ...f.officeHours!, days: on ? f.officeHours!.days.filter((x) => x !== d) : [...f.officeHours!.days, d].sort() } })}
                      className={clsx('min-h-9 min-w-11 rounded-lg border px-2 text-xs font-semibold', on ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink')}
                    >
                      {days[d]}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                <label className="block">
                  <span className="label">{t('calls.settings.from')}</span>
                  <input type="time" className="input w-32" value={f.officeHours.from} onChange={(e) => set({ officeHours: { ...f.officeHours!, from: e.target.value } })} />
                </label>
                <label className="block">
                  <span className="label">{t('calls.settings.to')}</span>
                  <input type="time" className="input w-32" value={f.officeHours.to} onChange={(e) => set({ officeHours: { ...f.officeHours!, to: e.target.value } })} />
                </label>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <button type="submit" className="btn-primary" disabled={save.isPending}>
        {t('calls.settings.save')}
      </button>
    </form>
  );
};

const Field = ({ label, hint, value, onChange, type = 'text' }: { label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <label className="block">
    <span className="label">{label}</span>
    <input className="input" type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} value={value} onChange={(e) => onChange(e.target.value)} />
    {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
  </label>
);
