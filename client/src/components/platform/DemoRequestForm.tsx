import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';

export const INTERESTS = ['crm', 'clientPortal', 'employerPortal', 'documents', 'embassyPackage', 'germanLearning', 'jobSearch', 'seo', 'whiteLabel'] as const;
const TEAM_SIZES = ['1-5', '6-20', '21-50', '51+'] as const;

/** "Request a demo" (POST /api/platform/demo-request): stored as a SaaS lead, admins are notified. */
export const DemoRequestForm = () => {
  const { t, i18n } = useTranslation();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sent) doneRef.current?.focus({ preventScroll: true });
  }, [sent]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = fd.get(k);
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    };
    const body = {
      agencyName: str('agencyName'),
      contactName: str('contactName'),
      email: str('email'),
      phone: str('phone'),
      country: str('country'),
      agencyWebsite: str('agencyWebsite'),
      teamSize: str('teamSize'),
      interests: fd.getAll('interests').filter((v): v is string => typeof v === 'string'),
      message: str('message'),
      consent: fd.get('consent') === 'on',
      website: str('website'),
      locale: (i18n.resolvedLanguage ?? 'en').slice(0, 2),
      visitorId: leadContext().visitorId,
    };
    setSending(true);
    setError(false);
    try {
      await api.post('/platform/demo-request', body);
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  if (sent)
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col items-center py-10 text-center outline-none">
        <span className="grid size-16 place-items-center rounded-full bg-success-bg text-success-fg">
          <CheckCircle2 className="size-8" aria-hidden />
        </span>
        <p className="mt-5 max-w-sm text-lg font-semibold text-ink">{t('platform.form.sent')}</p>
      </div>
    );

  const req = <span aria-hidden> *</span>;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pf-agency">
          {t('platform.form.agencyName')}
          {req}
        </label>
        <input id="pf-agency" name="agencyName" required minLength={2} maxLength={160} className="input" autoComplete="organization" />
      </div>
      <div>
        <label className="label" htmlFor="pf-name">
          {t('platform.form.contactName')}
          {req}
        </label>
        <input id="pf-name" name="contactName" required minLength={2} maxLength={120} className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="pf-email">
          {t('platform.form.email')}
          {req}
        </label>
        <input id="pf-email" name="email" type="email" required maxLength={190} className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="pf-phone">{t('platform.form.phone')}</label>
        <input id="pf-phone" name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
      </div>
      <div>
        <label className="label" htmlFor="pf-country">{t('platform.form.country')}</label>
        <input id="pf-country" name="country" maxLength={80} className="input" autoComplete="country-name" />
      </div>
      <div>
        <label className="label" htmlFor="pf-site">{t('platform.form.website')}</label>
        <input id="pf-site" name="agencyWebsite" type="text" inputMode="url" maxLength={200} className="input" autoComplete="url" />
      </div>
      <div>
        <label className="label" htmlFor="pf-team">{t('platform.form.teamSize')}</label>
        <select id="pf-team" name="teamSize" className="input" defaultValue="">
          <option value="">{t('platform.form.teamSizeAny')}</option>
          {TEAM_SIZES.map((s) => (
            <option key={s} value={s}>
              {t('platform.form.people', { n: s })}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">{t('platform.form.interests')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {INTERESTS.map((k) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-2 text-sm text-ink has-[:checked]:border-primary">
              <input type="checkbox" name="interests" value={k} className="size-4 accent-brand-600" />
              {t(`platform.features.${k}.t`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pf-msg">{t('platform.form.message')}</label>
        <textarea id="pf-msg" name="message" maxLength={3000} rows={4} className="input resize-y" />
      </div>
      <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-brand-600" />
        <span>
          {t('platform.form.consent')}{' '}
          <Link to="/privacy" className="text-link underline">
            {t('platform.form.privacy')}
          </Link>
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-lg border border-danger-fg/30 bg-danger-bg p-3 text-sm text-danger-fg sm:col-span-2">
          {t('platform.form.error')}
        </p>
      )}
      <div className="sm:col-span-2">
        <button type="submit" disabled={sending} className={buttonClass({ size: 'lg', className: 'w-full sm:w-auto' })}>
          {sending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />}
          {sending ? t('platform.form.sending') : t('platform.form.submit')}
        </button>
      </div>
    </form>
  );
};
