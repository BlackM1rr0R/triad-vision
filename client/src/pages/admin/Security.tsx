import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Users,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { needsTwoFactorEnrollment, useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { errorMessage, fmtDate, roleLabel } from '@/components/admin/labels';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { getBrand } from '@/lib/brand';

registerCopy(pagesLegal);

interface Status {
  enabled: boolean;
  required: boolean;
  pending: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  isActive: boolean;
  twoFactorEnabled: boolean;
  twoFactorEnabledAt: string | null;
}

/** Message for an error from the 2FA endpoints (auth.errors.* first, then the admin catalogue). */
const useErr = () => {
  const { t, i18n } = useTranslation();
  return (err: unknown) => {
    const key = `auth.errors.${errorCode(err)}`;
    return i18n.exists(key) ? t(key) : errorMessage(err);
  };
};

const CodeInput = ({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) => (
  <div>
    <label htmlFor={id} className="label">
      {label}
    </label>
    <input
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      required
      className="input max-w-48 text-center font-mono text-xl tracking-[0.35em] tabular-nums"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ''))}
      placeholder="000000"
    />
  </div>
);

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const RecoveryCodes = ({ codes, onDone }: { codes: string[]; onDone: () => void }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = `${getBrand().name} – recovery codes\n${new Date().toISOString().slice(0, 10)}\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'triad-vision-recovery-codes.txt';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <KeyRound className="size-4 text-link" aria-hidden /> {t('adminSecurity.step4')}
      </h3>
      <p className="mt-1 text-sm text-muted">{t('adminSecurity.step4Text')}</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-line bg-sunken p-4 font-mono text-sm sm:grid-cols-2" aria-label={t('adminSecurity.step4')}>
        {codes.map((c) => (
          <li key={c} className="rounded-md bg-card px-3 py-1.5 text-center tracking-wider text-ink">
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={download}>
          <Download className="size-3.5" /> {t('adminSecurity.download')}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={async () => setCopied(await copyText(codes.join('\n')))}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t('adminSecurity.copied') : t('adminSecurity.copyAll')}
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={onDone}>
          <Check className="size-3.5" /> {t('adminSecurity.done')}
        </button>
      </div>
    </div>
  );
};

/** Enrollment wizard: secret + QR → confirm code → recovery codes. */
const Enroll = ({ onEnabled }: { onEnabled: (codes: string[]) => void }) => {
  const { t } = useTranslation();
  const err = useErr();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!setup) return;
    let alive = true;
    QRCode.toString(setup.otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1f44', light: '#ffffff' } })
      .then((svg) => alive && setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [setup]);

  const start = async () => {
    setBusy(true);
    try {
      setSetup((await api.post<{ secret: string; otpauthUri: string }>('/auth/2fa/setup')).data);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusy(false);
    }
  };

  const enable = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code: clean });
      onEnabled(data.recoveryCodes);
    } catch (e2) {
      toast.error(err(e2));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <div className="flex flex-col items-start gap-4">
        <ol className="space-y-2 text-sm text-ink/85">
          {(['step1', 'step2', 'step3', 'step4'] as const).map((k, i) => (
            <li key={k} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/[0.06] text-xs font-bold text-link">{i + 1}</span>
              <span className="pt-0.5">{t(`adminSecurity.${k}`)}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-primary" onClick={start} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />} {t('adminSecurity.start')}
        </button>
      </div>
    );
  }

  const groupedSecret = setup.secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Smartphone className="size-4 text-link" aria-hidden /> 1. {t('adminSecurity.step1')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('adminSecurity.step1Text')}</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">2. {t('adminSecurity.step2')}</h3>
          <p className="mt-1 text-sm text-muted">{t('adminSecurity.step2Text')}</p>
          <div className="mt-3 grid size-52 place-items-center rounded-xl border border-line bg-card p-2">
            {qr ? <img src={qr} alt="QR" className="size-full" width={200} height={200} /> : <Spinner className="size-6 text-link" />}
          </div>
          <p className="mt-3 text-xs text-muted">{t('adminSecurity.manual')}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-sunken px-2.5 py-1.5 font-mono text-sm break-all text-ink select-all">{groupedSecret}</code>
            <button type="button" className="btn-secondary btn-sm" onClick={async () => setCopied(await copyText(setup.secret))}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? t('adminSecurity.copied') : t('adminSecurity.copy')}
            </button>
          </div>
        </div>
      </div>
      <form onSubmit={enable} className="space-y-4 lg:border-l lg:border-line lg:pl-6">
        <h3 className="text-sm font-semibold text-ink">3. {t('adminSecurity.step3')}</h3>
        <CodeInput id="tf-enable" value={code} onChange={setCode} label={t('adminSecurity.codeLabel')} />
        <button type="submit" className="btn-primary" disabled={busy || code.replace(/\D/g, '').length !== 6}>
          {busy ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" />} {t('adminSecurity.activate')}
        </button>
      </form>
    </div>
  );
};

/** Regenerate recovery codes / disable 2FA. */
const Manage = ({ status, onCodes, onDisabled }: { status: Status; onCodes: (c: string[]) => void; onDisabled: () => void }) => {
  const { t } = useTranslation();
  const err = useErr();
  const [mode, setMode] = useState<null | 'regen' | 'disable'>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setMode(null);
    setCode('');
    setPassword('');
  };

  const regen = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post<{ recoveryCodes: string[] }>('/auth/2fa/recovery-codes', { code: code.replace(/\D/g, '') });
      close();
      onCodes(data.recoveryCodes);
    } catch (e2) {
      toast.error(err(e2));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/2fa/disable', { password, code: code.trim() });
      close();
      toast.success(t('adminSecurity.disabledToast'));
      onDisabled();
    } catch (e2) {
      toast.error(err(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        {status.enabledAt && <span className="text-muted">{t('adminSecurity.enabledSince', { date: fmtDate(status.enabledAt) })}</span>}
        <span className={clsx('font-medium', status.recoveryCodesLeft <= 3 ? 'text-warning-fg' : 'text-muted')}>
          {t('adminSecurity.recoveryLeft', { count: status.recoveryCodesLeft })}
        </span>
      </div>
      {status.recoveryCodesLeft <= 3 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-bg px-3 py-2 text-sm text-ink/85">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-fg" aria-hidden /> {t('adminSecurity.recoveryLow')}
        </p>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setMode('regen')}>
            <RefreshCw className="size-3.5" /> {t('adminSecurity.regenerate')}
          </button>
          <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setMode('disable')}>
            <ShieldOff className="size-3.5" /> {t('adminSecurity.disable')}
          </button>
        </div>
      )}

      {mode === 'regen' && (
        <form onSubmit={regen} className="space-y-3 rounded-xl border border-line p-4">
          <p className="text-sm text-muted">{t('adminSecurity.regenerateText')}</p>
          <CodeInput id="tf-regen" value={code} onChange={setCode} label={t('adminSecurity.codeLabel')} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={close}>
              {t('adminSecurity.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={busy || code.replace(/\D/g, '').length !== 6}>
              {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {t('adminSecurity.confirm')}
            </button>
          </div>
        </form>
      )}

      {mode === 'disable' && (
        <form onSubmit={disable} className="space-y-3 rounded-xl border border-danger-border p-4">
          <p className="text-sm text-muted">{t('adminSecurity.disableText')}</p>
          {status.required && (
            <p className="flex items-start gap-2 text-sm font-medium text-danger-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('adminSecurity.disableStaffWarn')}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="tf-pw" className="label">
                {t('adminSecurity.password')}
              </label>
              <input id="tf-pw" type="password" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <label htmlFor="tf-dis-code" className="label">
                {t('adminSecurity.codeOrRecovery')}
              </label>
              <input
                id="tf-dis-code"
                autoComplete="one-time-code"
                required
                maxLength={40}
                className="input font-mono"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={close}>
              {t('adminSecurity.cancel')}
            </button>
            <button type="submit" className="btn-danger btn-sm" disabled={busy || !password || code.trim().length < 6}>
              {busy ? <Spinner className="size-3.5" /> : <ShieldOff className="size-3.5" />} {t('adminSecurity.disable')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

/** Super admin: 2FA state of every staff member, with reset for a lost phone. */
const StaffTwoFactor = () => {
  const { t } = useTranslation();
  const err = useErr();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [target, setTarget] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-2fa-staff'],
    queryFn: async () => (await api.get<{ staff: StaffRow[] }>('/auth/2fa/staff')).data.staff,
  });

  const reset = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/auth/2fa/users/${target.id}/reset`);
      toast.success(t('adminSecurity.resetToast'));
      setTarget(null);
      await qc.invalidateQueries({ queryKey: ['admin-2fa-staff'] });
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t('adminSecurity.staffTitle')} icon={Users} bodyClassName="p-0 sm:p-0">
      <p className="border-b border-line px-5 py-3 text-sm text-muted sm:px-6">{t('adminSecurity.staffText')}</p>
      {isLoading ? (
        <LoadingBlock className="min-h-32" />
      ) : error ? (
        <div className="p-5">
          <ErrorBlock error={error} onRetry={() => refetch()} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {(data ?? []).map((s) => (
            <li key={s.id} className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 sm:px-6', !s.isActive && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {s.firstName} {s.lastName}
                  {s.id === user?.id && <span className="ml-1.5 text-xs font-normal text-muted">({t('adminSecurity.you')})</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {s.email} · {roleLabel(s.role)}
                  {!s.isActive && ` · ${t('adminSecurity.inactive')}`}
                </p>
              </div>
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                  s.twoFactorEnabled ? 'bg-success-bg text-success-fg' : 'bg-warning-bg text-warning-fg',
                )}
              >
                {s.twoFactorEnabled ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
                {s.twoFactorEnabled ? t('adminSecurity.on') : t('adminSecurity.off')}
              </span>
              {s.id !== user?.id && s.twoFactorEnabled && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setTarget(s)}>
                  <RefreshCw className="size-3.5" /> {t('adminSecurity.reset')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={reset}
        loading={busy}
        title={t('adminSecurity.reset')}
        message={target ? t('adminSecurity.resetConfirm', { name: `${target.firstName} ${target.lastName}` }) : ''}
        confirmLabel={t('adminSecurity.reset')}
      />
    </Panel>
  );
};

export default function AdminSecurity() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: async () => (await api.get<Status>('/auth/2fa/status')).data,
  });
  const mustEnroll = needsTwoFactorEnrollment(user);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['2fa-status'] }), qc.invalidateQueries({ queryKey: ['me'] })]);
  };

  const onEnabled = (c: string[]) => {
    setCodes(c);
    toast.success(t('adminSecurity.enabledToast'));
    // Keep the codes on screen; the status/me refresh unlocks the admin area behind them.
    void refresh();
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHead title={t('adminSecurity.title')} subtitle={t('adminSecurity.subtitle')} />

      {mustEnroll && !codes && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-ink/85" role="alert">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning-fg" aria-hidden />
          <p className="font-medium">{t('adminSecurity.required')}</p>
        </div>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error || !status ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : (
        <Panel
          title={
            <span className="flex items-center gap-2">
              {status.enabled ? t('adminSecurity.statusOn') : t('adminSecurity.statusOff')}
              <span className={clsx('size-2 rounded-full', status.enabled ? 'bg-success' : 'bg-warning')} aria-hidden />
            </span>
          }
          icon={status.enabled ? ShieldCheck : ShieldAlert}
        >
          {codes ? (
            <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />
          ) : status.enabled ? (
            <Manage
              status={status}
              onCodes={(c) => {
                setCodes(c);
                void refresh();
              }}
              onDisabled={() => void refresh()}
            />
          ) : (
            <Enroll onEnabled={onEnabled} />
          )}
          {!status.required && <p className="mt-5 text-xs text-muted">{t('adminSecurity.clientOptional')}</p>}
        </Panel>
      )}

      {user?.role === 'SUPER_ADMIN' && !mustEnroll && <StaffTwoFactor />}
    </div>
  );
}
