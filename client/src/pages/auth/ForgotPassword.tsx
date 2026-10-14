import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MailCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { email: new FormData(e.currentTarget).get('email') });
      setSent(true);
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotText')}>
      {sent ? (
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <MailCheck className="size-5 shrink-0" /> {t('auth.forgotSent')}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">{t('auth.email')}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Spinner className="size-4" /> : <Send className="size-4" />} {t('auth.sendLink')}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthShell>
  );
}
