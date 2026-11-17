import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BellRing, CheckCircle2, MailX, TriangleAlert } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesRateAlert } from '@/i18n/pagesRateAlert';
import { usePageTitle } from '@/lib/usePageTitle';
import { decimal, dmy, useLng } from '@/components/tools/calc/CalcShared';
import { parseTarget, type RateDirection } from '@/components/rateAlert/RateAlertForm';

registerCopy(pagesRateAlert);

export interface RateAlertView {
  id: string;
  email: string;
  direction: RateDirection;
  target: number;
  state: 'pending' | 'active' | 'paused' | 'expired' | 'unsubscribed';
  lastSentAt: string | null;
  lastRate: number | null;
  lastRateDate: string | null;
  expiresAt: string | null;
}

type Msg = { text: string; ok: boolean } | null;

/**
 * /rate-alert?token=…&action=confirm|unsubscribe|rearm — the links of the EUR → AZN rate alert e-mails (server
 * lib/rateAlerts). Confirm runs at once (double opt-in); unsubscribe and re-arm ask first (mail scanners open links).
 */
export default function RateAlertManage() {
  const { t } = useTranslation();
  const lng = useLng();
  usePageTitle(t('rateAlert.manage.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const action = params.get('action');
  const [alert, setAlert] = useState<RateAlertView | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<RateDirection>('gte');
  const [target, setTarget] = useState('');
  const started = useRef(false);

  const take = (a: RateAlertView) => {
    setAlert(a);
    setDirection(a.direction);
    setTarget(decimal(a.target, lng, 4));
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setInvalid(true);
      return;
    }
    void (async () => {
      try {
        if (action === 'confirm') {
          const { data } = await api.post<{ alert: RateAlertView }>('/rate-alerts/confirm', { token });
          take(data.alert);
          setMsg({ text: t('rateAlert.manage.confirmed'), ok: true });
        } else {
          const { data } = await api.get<{ alert: RateAlertView }>('/rate-alerts/manage', { params: { token } });
          take(data.alert);
        }
      } catch {
        setInvalid(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, action]);

  const run = async (path: 'rearm' | 'unsubscribe') => {
    setBusy(true);
    try {
      const body = path === 'rearm' ? { token, direction, target: parseTarget(target) } : { token };
      const { data } = await api.post<{ alert: RateAlertView }>(`/rate-alerts/${path}`, body);
      take(data.alert);
      setMsg({ text: t(path === 'rearm' ? 'rateAlert.manage.rearmed' : 'rateAlert.manage.unsubscribed'), ok: true });
    } catch (err) {
      setMsg({ text: errorCode(err) === 'TOO_MANY_ALERTS' ? t('rateAlert.form.tooMany') : t('rateAlert.form.error'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const op = (d: RateDirection) => (d === 'gte' ? '≥' : '≤');
  const value = parseTarget(target);
  const validTarget = Number.isFinite(value) && value >= 0.5 && value <= 10;
  const showRearm = alert && (alert.state !== 'active' || action === 'rearm') && alert.state !== 'pending';
  const showUnsub = alert && alert.state !== 'unsubscribed' && (action === 'unsubscribe' || !showRearm);

  return (
    <section className="section">
      <div className="container-x max-w-xl">
        <div className="card card-pad rounded-3xl" aria-live="polite">
          <h1 className="flex items-center justify-center gap-2 text-center font-display text-2xl font-semibold text-ink">
            <BellRing className="size-6 text-primary" aria-hidden /> {t('rateAlert.manage.title')}
          </h1>
          {!alert && !invalid && (
            <p className="mt-6 flex items-center justify-center gap-2 text-muted">
              <Spinner /> {t('rateAlert.manage.loading')}
            </p>
          )}
          {invalid && (
            <p className="mt-6 flex items-center justify-center gap-2 text-danger-fg" role="alert">
              <TriangleAlert className="size-5" aria-hidden /> {t('rateAlert.manage.invalid')}
            </p>
          )}
          {alert && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-line bg-sunken p-4 text-center">
                <p className="font-display text-xl font-semibold text-ink tabular-nums">{t('rateAlert.cond', { op: op(alert.direction), target: decimal(alert.target, lng, 4) })}</p>
                <p className="mt-1 text-sm text-muted">
                  {alert.email} · {t(`rateAlert.state.${alert.state}`)}
                </p>
                {alert.state === 'active' && alert.expiresAt && <p className="text-xs text-muted">{t('rateAlert.manage.expires', { date: dmy(alert.expiresAt) })}</p>}
                {alert.lastSentAt && alert.lastRate != null && alert.lastRateDate && (
                  <p className="text-xs text-muted">{t('rateAlert.portal.lastSent', { date: dmy(alert.lastRateDate), rate: decimal(alert.lastRate, lng, 4) })}</p>
                )}
              </div>
              {msg && (
                <p className={clsx('flex items-center justify-center gap-2 text-sm', msg.ok ? 'text-ink' : 'text-danger-fg')} role={msg.ok ? 'status' : 'alert'}>
                  {msg.ok ? <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="size-5 shrink-0" aria-hidden />} {msg.text}
                </p>
              )}
              {showRearm && (
                <form
                  className="space-y-3 rounded-2xl border border-line p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (validTarget) void run('rearm');
                  }}
                >
                  <h2 className="font-semibold text-ink">{t('rateAlert.manage.rearmTitle')}</h2>
                  <p className="text-sm text-muted">{t('rateAlert.manage.rearmText')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['gte', 'lte'] as const).map((d) => (
                      <label key={d} className={clsx('flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-sm font-semibold', direction === d ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}>
                        <input type="radio" name="dir" className="sr-only" checked={direction === d} onChange={() => setDirection(d)} />
                        {t(`rateAlert.form.${d}`)}
                      </label>
                    ))}
                  </div>
                  <label className="block">
                    <span className="label">{t('rateAlert.form.target')}</span>
                    <input className="input tabular-nums" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-invalid={!validTarget} />
                  </label>
                  <button type="submit" className={buttonClass()} disabled={busy || !validTarget}>
                    <BellRing className="size-4" aria-hidden /> {t('rateAlert.manage.rearmBtn')}
                  </button>
                </form>
              )}
              {showUnsub && (
                <div className="space-y-2 text-center">
                  {action === 'unsubscribe' && <p className="text-sm text-muted">{t('rateAlert.manage.unsubscribeText', { email: alert.email })}</p>}
                  <button type="button" onClick={() => void run('unsubscribe')} disabled={busy} className={buttonClass({ variant: action === 'unsubscribe' ? 'danger' : 'outline' })}>
                    <MailX className="size-4" aria-hidden /> {t('rateAlert.manage.unsubscribeBtn')}
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="mt-8 text-center">
            <Link to="/send-money-home" className="text-sm font-semibold text-link hover:underline">
              {t('rateAlert.manage.back')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
