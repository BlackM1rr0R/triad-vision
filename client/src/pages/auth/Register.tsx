import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import type { User } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import { authError } from './Login';

export default function Register() {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User }>('/auth/register', {
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        email: fd.get('email'),
        phone: fd.get('phone') || undefined,
        password: fd.get('password'),
        locale,
      });
      setUser(data.user);
      navigate('/account', { replace: true });
    } catch (err) {
      toast.error(authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

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
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          <p className="mt-1 text-xs text-muted">{t('auth.passwordHint')}</p>
        </div>
        <label className="flex items-start gap-2.5 text-xs text-muted sm:col-span-2">
          <input type="checkbox" required className="mt-0.5 size-4 accent-brand-600" /> {t('auth.terms')}
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
