import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAdmin } from '@/i18n/pagesMailAdmin';
import { pagesUserPerms } from '@/i18n/pagesUserPerms';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fullName } from '@/components/admin/labels';
import type { AdminUser } from '@/components/admin/types';
import { ClientSettingsTable, SecretOnce, mailboxErrorText, type ServerSettings } from '@/components/mailboxes/shared';

registerCopy(pagesMailAdmin);
registerCopy(pagesUserPerms);

type Status = { configured: boolean; domain: string; localPart: string; address: string | null; emailOnOurDomain: boolean; exists: boolean | null; connected: boolean };
type Done = { created: boolean; mailbox: { address: string; password: string; workspaceConnected: boolean; settings: ServerSettings } };
const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/**
 * "Poçt qutusu yarat / qoş" of the user menu (super admin): creates the staff member's mailbox on our mail server, or
 * connects one that already exists. An existing mailbox cannot be connected without its password, which we do not
 * have, so the admin confirms "reset password and connect" (POST /admin/users/:id/mailbox { resetPassword }).
 * The new password is shown once.
 */
export function StaffMailboxDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [local, setLocal] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  useEffect(() => {
    setLocal(null);
    setDone(null);
  }, [user?.id]);
  const status = useQuery({
    queryKey: ['admin-user-mailbox', user?.id],
    queryFn: async () => (await api.get<Status>(`/admin/users/${user!.id}/mailbox`)).data,
    enabled: !!user,
    retry: false,
    staleTime: 0,
  });
  const localPart = (local ?? status.data?.localPart ?? '').trim().toLowerCase();
  const valid = LOCAL_PART_RE.test(localPart) && !localPart.includes('..');
  const address = status.data ? `${localPart}@${status.data.domain}` : '';
  // The address being checked on the server is the suggested one; an edited local part is checked when submitting.
  const exists = local === null || local.trim().toLowerCase() === status.data?.localPart ? status.data?.exists : null;
  const run = useMutation({
    mutationFn: async (resetPassword: boolean) => (await api.post<Done>(`/admin/users/${user!.id}/mailbox`, { localPart, resetPassword })).data,
    onSuccess: (r) => {
      setDone(r);
      void qc.invalidateQueries({ queryKey: ['admin-mailboxes'] });
      void qc.invalidateQueries({ queryKey: ['admin-user-mailbox', user?.id] });
    },
    onError: (err) => {
      // An existing mailbox: re-check, the dialog then offers "reset password and connect".
      if (errorCode(err) === 'MAILBOX_PASSWORD_NEEDED') void status.refetch();
      toast.error(mailboxErrorText(err));
    },
  });
  const needsReset = exists === true || errorCode(run.error) === 'MAILBOX_PASSWORD_NEEDED';
  const close = () => {
    run.reset();
    onClose();
  };
  return (
    <Modal
      open={!!user}
      onClose={close}
      title={t('userPerms.mbox.title', { name: user ? fullName(user) : '' })}
      footer={
        done ? (
          <button type="button" className="btn-primary btn-sm" onClick={close}>
            {t('mailAdmin.actions.done')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={close}>
              {t('admin.common.cancel')}
            </button>
            {status.data?.configured && !status.data.connected && (
              <button type="button" className="btn-primary btn-sm" disabled={!valid || run.isPending} onClick={() => run.mutate(needsReset)}>
                {run.isPending ? <Spinner /> : needsReset ? t('userPerms.mbox.resetConnect') : t('userPerms.mbox.create')}
              </button>
            )}
          </>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {status.isLoading && (
          <p className="flex items-center gap-2 text-muted">
            <Spinner /> {t('userPerms.mbox.loading')}
          </p>
        )}
        {status.isError && (
          <p className="text-danger-fg" role="alert">
            {mailboxErrorText(status.error)}
          </p>
        )}
        {status.data && !status.data.configured && (
          <p className="rounded-lg border border-danger-border bg-danger-bg p-3 text-danger-fg" role="alert">
            {t('userPerms.mbox.notConfigured')}
          </p>
        )}
        {done ? (
          <div className="space-y-4">
            <p className="text-ink/80">{t(!done.mailbox.workspaceConnected ? 'userPerms.mbox.doneNoWs' : done.created ? 'userPerms.mbox.doneCreated' : 'userPerms.mbox.doneConnected', { address: done.mailbox.address })}</p>
            <SecretOnce value={done.mailbox.password} note={t('mailAdmin.created.passwordOnce')} />
            <ClientSettingsTable settings={done.mailbox.settings} address={done.mailbox.address} />
          </div>
        ) : (
          status.data?.configured && (
            <>
              <p className="text-xs text-muted">{status.data.emailOnOurDomain ? t('userPerms.mbox.emailOurs') : t('userPerms.mbox.emailOther')}</p>
              <div>
                <label className="label" htmlFor="sm-local">
                  {t('userPerms.mbox.localPart')}
                </label>
                <div className="flex items-stretch">
                  <input
                    id="sm-local"
                    className={clsx('input rounded-r-none', localPart && !valid && 'border-danger')}
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    value={localPart}
                    disabled={status.data.connected}
                    onChange={(e) => setLocal(e.target.value)}
                  />
                  <span className="grid shrink-0 place-items-center rounded-r-lg border border-l-0 border-line bg-sunken px-3 text-sm text-muted">@{status.data.domain}</span>
                </div>
              </div>
              {status.data.connected ? (
                <p className="text-success-fg">{t('userPerms.mbox.connected')}</p>
              ) : needsReset ? (
                <p className="rounded-lg border border-warning-border bg-warning-bg p-3 text-warning-fg">{t('userPerms.mbox.exists', { address })}</p>
              ) : (
                valid && <p className="text-ink/80">{t('userPerms.mbox.willCreate', { address })}</p>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  );
}
