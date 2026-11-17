import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BellRing, CheckCircle2, MailCheck } from 'lucide-react';
import i18n, { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesRateAlert } from '@/i18n/pagesRateAlert';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadVisitorId } from '@/lib/leadVisitor';
import { useClientOnly } from '@/lib/ssr';
import { useEurAzn } from '@/components/tools/AznEquivalent';
import { Button } from '@/components/ui/Button';
import { decimal, dmy, useLng } from '@/components/tools/calc/CalcShared';

registerCopy(pagesRateAlert);

export type RateDirection = 'gte' | 'lte';

const errorText = (err: unknown) => (errorCode(err) === 'TOO_MANY_ALERTS' ? String(i18n.t('rateAlert.form.tooMany')) : String(i18n.t('rateAlert.form.error')));

/** "2,05" / "2.05" → 2.05 (NaN when not a number). */
export const parseTarget = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'));

/**
 * EUR → AZN rate alert form (server routes/rateAlerts.ts): visitors get a confirmation e-mail (double opt-in, honeypot
 * field `website`); signed-in clients create the alert for their account address at once (/account/rate-alerts).
 * Shown on /send-money-home, /life-in-germany and in the portal. Renders after hydration only (the rate is live).
 */
export const RateAlertForm = ({ className, compact = false, onCreated }: { className?: string; compact?: boolean; onCreated?: () => void }) => {
  const { t } = useTranslation();
  const lng = useLng();
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = useId();
  const client = user?.role === 'CLIENT' ? user : null;
  const rateQ = useEurAzn();
  const rate = rateQ.data ?? null;
  const [direction, setDirection] = useState<RateDirection>('gte');
  const [target, setTarget] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: 'pending' | 'active'; email?: string } | null>(null);

  // Prefill a target a little above / below today's rate.
  useEffect(() => {
    if (!rate || target) return;
    const v = direction === 'gte' ? rate.rate * 1.01 : rate.rate * 0.99;
    setTarget(decimal(Math.round(v * 100) / 100, lng, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  const value = parseTarget(target);
  const valid = Number.isFinite(value) && value >= 0.5 && value <= 10;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || !valid || (!client && !consent)) return;
    setSending(true);
    setError(null);
    const body = { direction, target: value, lng: currentSiteLocale() };
    try {
      if (client) {
        await api.post('/rate-alerts/mine', body);
        void qc.invalidateQueries({ queryKey: ['rate-alerts-mine'] });
        setDone({ kind: 'active' });
        onCreated?.();
      } else {
        const r = await api.post<{ confirmed: boolean }>('/rate-alerts', { ...body, email: email.trim(), consent: true, website: website || undefined, visitorId: leadVisitorId() ?? undefined });
        setDone({ kind: r.data.confirmed ? 'active' : 'pending', email: email.trim() });
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={clsx('rounded-3xl border border-line bg-card p-5 sm:p-6', className)} aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <BellRing className="size-5 shrink-0 text-primary" aria-hidden /> {t('rateAlert.form.title')}
      </h2>
      {!compact && <p className="mt-2 text-sm leading-relaxed text-muted">{t('rateAlert.form.intro')}</p>}
      <p className="mt-2 text-sm font-semibold text-ink tabular-nums">
        {rate ? t('rateAlert.form.now', { rate: decimal(rate.rate, lng, 4), date: dmy(rate.date) }) : rateQ.isPending ? ' ' : t('rateAlert.form.noRate')}
      </p>

      {done ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-success-border bg-success-bg p-3 text-sm text-success-fg" role="status">
          {done.kind === 'pending' ? <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>
            {done.kind === 'pending' ? t('rateAlert.form.checkMail', { email: done.email }) : t('rateAlert.form.created')}{' '}
            {client && (
              <Link to="/account/rate-alerts" className="font-semibold underline">
                {t('rateAlert.form.portal')}
              </Link>
            )}
          </span>
        </p>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
          <fieldset>
            <legend className="label">{t('rateAlert.form.direction')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['gte', 'lte'] as const).map((d) => (
                <label
                  key={d}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                    direction === d ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                  )}
                >
                  <input type="radio" name={`${uid}-dir`} className="sr-only" checked={direction === d} onChange={() => setDirection(d)} />
                  {t(`rateAlert.form.${d}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className={clsx('grid gap-3', !client && 'sm:grid-cols-2')}>
            <div>
              <label htmlFor={`${uid}-target`} className="label">
                {t('rateAlert.form.target')}
              </label>
              <input
                id={`${uid}-target`}
                className="input tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                aria-invalid={target !== '' && !valid}
                required
              />
            </div>
            {!client && (
              <div>
                <label htmlFor={`${uid}-email`} className="label">
                  {t('rateAlert.form.email')}
                </label>
                <input id={`${uid}-email`} className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={190} />
              </div>
            )}
          </div>
          {/* honeypot: hidden from people and assistive tech, bots fill it */}
          <div className="hidden" aria-hidden>
            <label>
              Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>
          {!client && (
            <label className="flex items-start gap-2 text-xs leading-snug text-muted">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>
                {t('rateAlert.form.consent')}{' '}
                <Link to="/privacy" className="font-semibold text-link hover:underline">
                  {t('rateAlert.form.privacy')}
                </Link>
              </span>
            </label>
          )}
          {error && (
            <p className="text-sm text-danger-fg" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={sending || !valid || (!client && (!consent || !email.includes('@')))}>
            <BellRing className="size-4" aria-hidden /> {sending ? t('rateAlert.form.sending') : t('rateAlert.form.submit')}
          </Button>
          <p className="text-xs text-muted">{t('rateAlert.form.note')}</p>
        </form>
      )}
    </section>
  );
};

/** The form after hydration only (live rate, signed-in state); a same-height placeholder in the server render. */
export const RateAlertSlot = ({ className }: { className?: string }) => {
  const client = useClientOnly();
  return client ? <RateAlertForm className={className} /> : <div className={clsx('min-h-[24rem] sm:min-h-[20rem]', className)} aria-hidden />;
};
