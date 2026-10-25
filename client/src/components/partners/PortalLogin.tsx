import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { KeyRound, Mail, Send, Unlink, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { fmtDateTime } from '@/components/admin/labels';
import { PARTNERS_KEY, partnerError, type Partner } from './api';

/** Portal login of a referral partner: create / link (with invitation), resend the invitation, unlink. */
export const PortalLoginPanel = ({ partner, isAdmin }: { partner: Partner; isAdmin: boolean }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const login = partner.login ?? null;
  const [creating, setCreating] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [form, setForm] = useState({ email: '', phone: '', locale: 'az' });
  useEffect(() => {
    if (creating) setForm({ email: partner.email ?? '', phone: partner.phone ?? '', locale: 'az' });
  }, [creating, partner.email, partner.phone]);
  const refresh = () => qc.invalidateQueries({ queryKey: PARTNERS_KEY });

  const create = useMutation({
    mutationFn: async () => (await api.post<{ created: boolean }>(`/admin/partners/${partner.id}/login`, { email: form.email.trim(), phone: form.phone.trim() || null, locale: form.locale })).data,
    onSuccess: async (r) => {
      toast.success(r.created ? t('refPartners.login.created') : t('refPartners.login.linked'));
      setCreating(false);
      await refresh();
    },
    onError: partnerError,
  });
  const resend = useMutation({
    mutationFn: async () => api.post(`/admin/partners/${partner.id}/login/invite`),
    onSuccess: async () => {
      toast.success(t('refPartners.login.resent'));
      await refresh();
    },
    onError: partnerError,
  });
  const unlink = useMutation({
    mutationFn: async () => api.delete(`/admin/partners/${partner.id}/login`),
    onSuccess: async () => {
      toast.success(t('refPartners.login.unlinked'));
      setConfirmUnlink(false);
      await refresh();
    },
    onError: partnerError,
  });

  return (
    <section className="rounded-xl border border-line bg-card p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <KeyRound className="size-4 text-primary" aria-hidden /> {t('refPartners.login.title')}
      </h2>
      {login ? (
        <div className="mt-3 space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="size-3.5 text-muted" aria-hidden />
            <span className="font-medium text-ink">{login.email}</span>
            {!login.isActive && <span className="badge bg-sunken text-muted">{t('refPartners.login.inactive')}</span>}
          </p>
          <p className="text-xs text-muted">{login.lastSeenAt ? t('refPartners.login.lastSeen', { date: fmtDateTime(login.lastSeenAt) }) : t('refPartners.login.never')}</p>
          {login.agentCode && <p className="text-xs text-muted">{t('refPartners.login.agent', { code: login.agentCode })}</p>}
          {isAdmin ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className="btn-secondary btn-sm" onClick={() => resend.mutate()} disabled={resend.isPending}>
                {resend.isPending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('refPartners.login.resend')}
              </button>
              <button type="button" className="btn-secondary btn-sm text-danger-fg" onClick={() => setConfirmUnlink(true)}>
                <Unlink className="size-3.5" /> {t('refPartners.login.unlink')}
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted">{t('refPartners.login.adminOnly')}</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{t('refPartners.login.none')}</p>
          {isAdmin ? (
            <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
              <UserPlus className="size-3.5" /> {t('refPartners.login.create')}
            </button>
          ) : (
            <p className="text-xs text-muted">{t('refPartners.login.adminOnly')}</p>
          )}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => !create.isPending && setCreating(false)}
        title={t('refPartners.login.create')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setCreating(false)} disabled={create.isPending}>
              {t('refPartners.form.cancel')}
            </button>
            <button type="submit" form="partner-login-form" className="btn-primary btn-sm" disabled={create.isPending || !form.email.trim()}>
              {create.isPending && <Spinner className="size-3.5" />} {t('refPartners.login.create')}
            </button>
          </div>
        }
      >
        <form
          id="partner-login-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (form.email.trim()) create.mutate();
          }}
        >
          <label className="block">
            <span className="label">{t('refPartners.login.email')}</span>
            <input className="input" type="email" required maxLength={191} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.login.phone')}</span>
            <input className="input" type="tel" maxLength={40} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">{t('refPartners.login.locale')}</span>
            <select className="input" value={form.locale} onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}>
              <option value="az">Azərbaycanca</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        onConfirm={() => unlink.mutate()}
        title={t('refPartners.login.unlinkTitle')}
        message={t('refPartners.login.unlinkText')}
        confirmLabel={t('refPartners.login.unlink')}
        loading={unlink.isPending}
      />
    </section>
  );
};
