import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { MailWarning, Send } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { securityOf, useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';

registerCopy(pagesLegal);

/** "Send the confirmation link again" (POST /auth/resend-verification, rate-limited server-side). */
export const ResendVerificationButton = ({ className, label }: { className?: string; label?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const { data } = await api.post<{ ok: true; alreadyVerified?: boolean }>('/auth/resend-verification');
      if (data.alreadyVerified) {
        toast.success(t('verifyEmail.alreadyVerified'));
        void qc.invalidateQueries({ queryKey: ['me'] });
      } else {
        toast.success(t('verifyBanner.sent'));
        setSent(true);
      }
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === 'TOO_MANY_REQUESTS' ? t('verifyBanner.throttled') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={resend} disabled={busy || sent} className={clsx(className ?? 'btn-ghost btn-sm')}>
      {busy ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {label ?? t('verifyBanner.resend')}
    </button>
  );
};

/** Shown in the account area until the email address is confirmed. Renders nothing otherwise. */
export const VerifyBanner = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user || securityOf(user).emailVerified !== false) return null;
  return (
    <div
      role="status"
      className={clsx(
        'flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <MailWarning className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-navy-900">{t('verifyBanner.title')}</p>
          <p className="mt-0.5 text-sm break-words text-muted">{t('verifyBanner.text', { email: user.email })}</p>
        </div>
      </div>
      <ResendVerificationButton className="btn-primary btn-sm shrink-0 self-start sm:self-center" />
    </div>
  );
};

export default VerifyBanner;
