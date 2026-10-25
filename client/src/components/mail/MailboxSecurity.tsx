import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { KeyRound, Lock, Reply } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAdmin } from '@/i18n/pagesMailAdmin';
import { Spinner } from '@/components/ui/Spinner';
import { AutoReplyForm, Field, passwordOk, toastMailboxError, type AutoReply } from '@/components/mailboxes/shared';
import { mailKeys } from './api';

registerCopy(pagesMailAdmin);

interface MyMailbox {
  id: string;
  address: string;
  displayName: string | null;
  usedBytes: number;
  quotaBytes: number | null;
  canChangePassword: boolean;
}

interface MyMailboxes {
  configured: boolean;
  domain: string;
  mailboxes: MyMailbox[];
}

/** The staff member's own @domain mailboxes on our mail server (login email or connected workspace accounts). */
export const useMyMailboxes = (enabled = true) =>
  useQuery({
    queryKey: ['my-mailboxes'],
    queryFn: async () => (await api.get<MyMailboxes>('/mailbox/me')).data,
    enabled,
    staleTime: 60_000,
    retry: false,
  });

const ChangePassword = ({ mailbox }: { mailbox: MyMailbox }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = useId();
  const [form, setForm] = useState({ current: '', next: '', repeat: '' });
  useEffect(() => setForm({ current: '', next: '', repeat: '' }), [mailbox.address]);
  const m = useMutation({
    mutationFn: async () => (await api.post<{ ok: true; workspaceAccountsUpdated: number }>('/mailbox/me/password', { address: mailbox.address, currentPassword: form.current, newPassword: form.next })).data,
    onSuccess: (r) => {
      toast.success(t('mailAdmin.security.changed', { count: r.workspaceAccountsUpdated }));
      setForm({ current: '', next: '', repeat: '' });
      void qc.invalidateQueries({ queryKey: mailKeys.all });
    },
    onError: toastMailboxError,
  });

  if (!mailbox.canChangePassword) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-line bg-sunken p-3 text-sm text-muted">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('mailAdmin.security.senderLocked')}
      </p>
    );
  }

  const weak = !!form.next && !passwordOk(form.next);
  const mismatch = !!form.repeat && form.repeat !== form.next;
  const ready = !!form.current && passwordOk(form.next) && form.next === form.repeat;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !m.isPending) m.mutate();
      }}
    >
      {/* Lets password managers attach the new password to the right account. */}
      <input type="email" name="username" autoComplete="username" value={mailbox.address} readOnly hidden />
      <Field label={t('mailAdmin.security.current')} htmlFor={`${id}-c`}>
        <input id={`${id}-c`} type="password" className="input" autoComplete="current-password" maxLength={256} value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('mailAdmin.security.next')} hint={weak ? <span className="text-danger-fg">{t('mailAdmin.security.weak')}</span> : t('mailAdmin.security.policy')} htmlFor={`${id}-n`}>
          <input id={`${id}-n`} type="password" className={clsx('input', weak && 'border-danger')} autoComplete="new-password" maxLength={128} value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} />
        </Field>
        <Field label={t('mailAdmin.security.repeat')} hint={mismatch ? <span className="text-danger-fg">{t('mailAdmin.security.mismatch')}</span> : undefined} htmlFor={`${id}-r`}>
          <input id={`${id}-r`} type="password" className={clsx('input', mismatch && 'border-danger')} autoComplete="new-password" maxLength={128} value={form.repeat} onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value }))} />
        </Field>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="btn-primary btn-sm" disabled={!ready || m.isPending}>
          {m.isPending ? <Spinner className="size-3.5" /> : <KeyRound className="size-3.5" aria-hidden />} {t('mailAdmin.security.changePassword')}
        </button>
      </div>
    </form>
  );
};

/** Settings tab: change the mailbox password and edit the own auto-reply. */
export const MailboxSecurityTab = () => {
  const { t } = useTranslation();
  const q = useMyMailboxes();
  const [address, setAddress] = useState('');
  const list = q.data?.mailboxes ?? [];
  const current = list.find((m) => m.address === address) ?? list[0];

  if (q.isLoading) return <Spinner className="size-6 text-link" />;
  if (!q.data?.configured) return <p className="text-sm text-muted">{t('mailAdmin.security.notConfigured')}</p>;
  if (!current) return <p className="text-sm text-muted">{t('mailAdmin.security.none', { domain: q.data.domain })}</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t('mailAdmin.security.intro', { domain: q.data.domain })}</p>
      {list.length > 1 && (
        <Field label={t('mailAdmin.security.mailbox')}>
          <select className="input" value={current.address} onChange={(e) => setAddress(e.target.value)}>
            {list.map((m) => (
              <option key={m.address} value={m.address}>
                {m.address}
              </option>
            ))}
          </select>
        </Field>
      )}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <KeyRound className="size-4 text-link" aria-hidden /> {t('mailAdmin.security.changePassword')} · <span className="font-normal text-muted">{current.address}</span>
        </h3>
        <ChangePassword mailbox={current} />
      </section>
      <section className="border-t border-line pt-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <Reply className="size-4 text-link" aria-hidden /> {t('mailAdmin.autoReply.title')}
        </h3>
        <AutoReplyForm
          key={current.address}
          queryKey={['my-mailbox-auto-reply', current.address]}
          load={async () => (await api.get<{ autoReply: AutoReply }>('/mailbox/me/auto-reply', { params: { address: current.address } })).data.autoReply}
          save={async (v) => (await api.put<{ autoReply: AutoReply }>('/mailbox/me/auto-reply', { address: current.address, ...v })).data.autoReply}
        />
      </section>
    </div>
  );
};
