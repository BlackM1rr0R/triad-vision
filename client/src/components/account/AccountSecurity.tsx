import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AtSign, KeyRound, MailCheck, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { isStrongPassword, PASSWORD_MAX, PASSWORD_MIN } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesPortalExtras);

/**
 * Account security cards shared by the portals (agent, employer, partner, client):
 *  - ChangePasswordCard: PATCH /auth/me { currentPassword, newPassword } (other devices are logged out by the API);
 *  - ChangeEmailCard:    POST /auth/email-change → link to the new address; open request shown with "cancel".
 * Both render a plain card (`card card-pad`) so they sit in any portal layout.
 */

const issueOf = (err: unknown) => (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;

const Card = ({ title, icon: Icon, intro, children, className }: { title: string; icon: typeof KeyRound; intro?: string; children: ReactNode; className?: string }) => {
  const id = useId();
  return (
    <section className={clsx('card card-pad', className)} aria-labelledby={id}>
      <h2 id={id} className="type-card-title flex items-center gap-3">
        <span className="chip-soft grid size-9 shrink-0 place-items-center rounded-lg">
          <Icon className="size-4.5" aria-hidden />
        </span>
        {title}
      </h2>
      {intro && <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
};

export const ChangePasswordCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const uid = useId();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const valid = currentPassword.length > 0 && isStrongPassword(newPassword);
  const change = useMutation({
    mutationFn: async () => api.patch('/auth/me', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast.success(t('px.password.changed'));
    },
    onError: (err) => {
      const code = issueOf(err) === 'PASSWORD_TOO_WEAK' ? 'PASSWORD_TOO_WEAK' : errorCode(err);
      toast.error(code === 'WRONG_PASSWORD' || code === 'PASSWORD_TOO_WEAK' ? t(`px.password.${code}`) : t('common.error'));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) change.mutate();
  };
  return (
    <Card title={t('px.password.title')} icon={KeyRound} className={className}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${uid}-cur`}>
            {t('px.password.current')}
          </label>
          <PasswordInput id={`${uid}-cur`} className="input" autoComplete="current-password" maxLength={PASSWORD_MAX} value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-new`}>
            {t('px.password.next')}
          </label>
          <PasswordInput
            id={`${uid}-new`}
            className="input"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby={`${uid}-hint`}
            aria-invalid={newPassword.length > 0 && !isStrongPassword(newPassword)}
            required
          />
          <p id={`${uid}-hint`} className={clsx('mt-1 text-xs', newPassword && !isStrongPassword(newPassword) ? 'text-danger-fg' : 'text-muted')}>
            {t('px.password.hint')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={change.isPending || !valid}>
            {change.isPending ? <Spinner className="size-4" /> : <KeyRound className="size-4" aria-hidden />}
            {t('px.password.submit')}
          </button>
        </div>
      </form>
    </Card>
  );
};

interface Pending {
  newEmail: string;
  expiresAt: string;
}
const EMAIL_CHANGE_KEY = ['email-change'];

export const ChangeEmailCard = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const uid = useId();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const { data: pending } = useQuery({
    queryKey: EMAIL_CHANGE_KEY,
    queryFn: async () => (await api.get<{ pending: Pending | null }>('/auth/email-change')).data.pending,
  });
  const fail = (err: unknown) => {
    const code = errorCode(err);
    toast.error(['EMAIL_TAKEN', 'SAME_EMAIL', 'WRONG_PASSWORD', 'TOO_MANY_REQUESTS'].includes(code ?? '') ? t(`px.email.${code}`) : t('common.error'));
  };
  const request = useMutation({
    mutationFn: async () => (await api.post<{ pending: Pending | null }>('/auth/email-change', { newEmail: newEmail.trim(), currentPassword: password })).data.pending,
    onSuccess: (p) => {
      qc.setQueryData(EMAIL_CHANGE_KEY, p);
      toast.success(t('px.email.sent', { email: p?.newEmail ?? newEmail.trim() }));
      setNewEmail('');
      setPassword('');
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: async () => api.delete('/auth/email-change'),
    onSuccess: () => {
      qc.setQueryData(EMAIL_CHANGE_KEY, null);
      toast.success(t('px.email.cancelled'));
    },
    onError: fail,
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim()) && password.length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) request.mutate();
  };

  return (
    <Card title={t('px.email.title')} icon={AtSign} intro={t('px.email.intro')} className={className}>
      <dl className="mb-4">
        <dt className="text-xs font-semibold text-muted">{t('px.email.current')}</dt>
        <dd className="mt-0.5 truncate text-sm font-medium text-ink">{user?.email}</dd>
      </dl>
      {pending && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-info-border bg-info-bg px-4 py-3 text-sm text-info-fg" role="status">
          <p className="flex min-w-0 items-start gap-2">
            <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{t('px.email.pending', { email: pending.newEmail, date: dateTime(pending.expiresAt) })}</span>
          </p>
          <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X className="size-3.5" aria-hidden /> {t('px.email.cancel')}
          </button>
        </div>
      )}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${uid}-email`}>
            {t('px.email.newEmail')}
          </label>
          <input id={`${uid}-email`} className="input" type="email" autoComplete="email" maxLength={191} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`${uid}-pw`}>
            {t('px.email.password')}
          </label>
          <PasswordInput id={`${uid}-pw`} className="input" autoComplete="current-password" maxLength={PASSWORD_MAX} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={request.isPending || !valid}>
            {request.isPending ? <Spinner className="size-4" /> : <MailCheck className="size-4" aria-hidden />}
            {t('px.email.submit')}
          </button>
        </div>
      </form>
    </Card>
  );
};
