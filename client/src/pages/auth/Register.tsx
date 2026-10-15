import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, MailCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { isStrongPassword, PASSWORD_MAX, PASSWORD_MIN, type SessionInfo, type User } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import { authError } from './Login';
import { ResendVerificationButton } from '@/components/auth/VerifyBanner';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';

registerCopy(pagesLegal);

/** After registration: the account exists and is logged in, but the email still has to be confirmed. */
const CheckInbox = ({ email }: { email: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <AuthShell title={t('registerInbox.title')}>
      <div className="flex flex-col items-center text-center" role="status">
        <span className="grid size-16 place-items-center rounded-full bg-brand-50 text-brand-600">
          <MailCheck className="size-8" aria-hidden />
        </span>
        <p className="mt-5 break-words text-ink">{t('registerInbox.text', { email })}</p>
        <p className="mt-2 text-sm text-muted">{t('registerInbox.hint')}</p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn-primary" onClick={() => navigate('/account', { replace: true })}>
            {t('registerInbox.continue')} <ArrowRight className="size-4" aria-hidden />
          </button>
          <ResendVerificationButton className="btn-ghost" label={t('registerInbox.resend')} />
        </div>
      </div>
    </AuthShell>
  );
};

export default function Register() {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const weak = password.length > 0 && !isStrongPassword(password);
  usePageTitle(t('auth.registerTitle'));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!isStrongPassword(String(fd.get('password') ?? ''))) {
      toast.error(t('auth.errors.PASSWORD_TOO_WEAK'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User; session: SessionInfo }>('/auth/register', {
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        email: fd.get('email'),
        phone: fd.get('phone') || undefined,
        password: fd.get('password'),
        locale,
      });
      setUser(data.user);
      // New accounts confirm their email first ("check your inbox"); pre-verified ones go straight on.
      if ((data.user as User & { emailVerified?: boolean }).emailVerified === false) setRegisteredEmail(data.user.email);
      else navigate('/account', { replace: true });
    } catch (err) {
      toast.error(authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  if (registeredEmail) return <CheckInbox email={registeredEmail} />;

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">{t('auth.firstName')}</label>
          <input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="lastName">{t('auth.lastName')}</label>
          <input id="lastName" name="lastName" required maxLength={80} autoComplete="family-name" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="email">{t('auth.email')}</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="phone">{t('auth.phone')}</label>
          <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" placeholder="+994 ..." className="input" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="password">{t('auth.password')}</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            className={`input${weak ? ' border-danger' : ''}`}
            aria-invalid={weak || undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className={`mt-1 text-xs ${weak ? 'text-danger' : 'text-muted'}`}>{t('auth.passwordHint')}</p>
        </div>
        <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
          <input type="checkbox" required className="mt-0.5 size-4 accent-brand-600" />
          <span>
            {t('auth.terms')}{' '}
            <Link to="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand-600 hover:underline">
              {t('legalPages.privacy.title')}
            </Link>
          </span>
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full sm:col-span-2">
          {busy ? <Spinner className="size-4" /> : <UserPlus className="size-4" />} {t('auth.register')}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthShell>
  );
}
