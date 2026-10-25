import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { Success } from '@/components/illustrations';
import { AuthShell } from './AuthShell';
import { authError } from './Login';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  usePageTitle(t('auth.forgotTitle'));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: new FormData(e.currentTarget).get('email') });
      setSent(true);
    } catch (err) {
      toast.error(authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotText')}>
      {sent ? (
        <div className="flex flex-col items-center text-center" role="status">
          <Success className="w-36" />
          <p className="mt-5 max-w-sm rounded-2xl bg-success-bg px-4 py-3 text-sm text-success-fg">{t('auth.forgotSent')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t('auth.email')}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
            {busy ? <Spinner className="size-4" /> : <Send className="size-4" />} {t('auth.sendLink')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-link hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthShell>
  );
}
