import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { isStrongPassword, PASSWORD_MAX, PASSWORD_MIN } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import { authError } from './Login';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState('');
  const weak = password.length > 0 && !isStrongPassword(password);
  usePageTitle(t('auth.resetTitle'));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isStrongPassword(password)) {
      toast.error(t('auth.errors.PASSWORD_TOO_WEAK'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token: params.get('token') ?? '', password });
      setDone(true);
    } catch (err) {
      toast.error(authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.resetTitle')}>
      {done ? (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="size-5 shrink-0" /> {t('auth.resetDone')}
          </div>
          <Link to="/login" className="btn-primary w-full">
            {t('auth.login')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">{t('auth.newPassword')}</label>
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
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner className="size-4" /> : <KeyRound className="size-4" />} {t('common.save')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
