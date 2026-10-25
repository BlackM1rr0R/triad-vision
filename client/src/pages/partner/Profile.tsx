import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CircleUser, KeyRound, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { User } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNER_ME_KEY, portalError, type PartnerMe } from '@/components/partnerPortal/api';
import { Section } from '@/components/partnerPortal/ui';

/** Name and phone of the login, password change (the regular PATCH /auth/me). No banking fields. */
export default function PartnerProfilePage({ me }: { me: PartnerMe }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { setUser } = useAuth();
  const [form, setForm] = useState({ firstName: me.user.firstName, lastName: me.user.lastName, phone: me.user.phone ?? '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const save = useMutation({
    mutationFn: async () => (await api.patch<{ user: User }>('/auth/me', { firstName: form.firstName.trim(), lastName: form.lastName.trim() || undefined, phone: form.phone.trim() || null })).data.user,
    onSuccess: async (u) => {
      setUser(u);
      toast.success(t('partnerPortal.common.saved'));
      await qc.invalidateQueries({ queryKey: PARTNER_ME_KEY });
    },
    onError: (err) => toast.error(portalError(err)),
  });
  const change = useMutation({
    mutationFn: async () => (await api.patch<{ user: User }>('/auth/me', pw)).data.user,
    onSuccess: () => {
      setPw({ currentPassword: '', newPassword: '' });
      toast.success(t('partnerPortal.profile.passwordChanged'));
    },
    onError: (err) => {
      const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
      toast.error(issue === 'PASSWORD_TOO_WEAK' ? t('partnerPortal.errors.PASSWORD_TOO_WEAK') : portalError(err));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.firstName.trim()) save.mutate();
  };
  const submitPw = (e: FormEvent) => {
    e.preventDefault();
    if (pw.currentPassword && pw.newPassword) change.mutate();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('partnerPortal.profile.title')} icon={CircleUser}>
        <dl className="mb-5 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted">{t('partnerPortal.profile.partner')}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-ink">{me.partner.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted">{t('partnerPortal.profile.email')}</dt>
            <dd className="mt-0.5 truncate text-sm font-medium text-ink">{me.user.email}</dd>
          </div>
        </dl>
        <p className="mb-5 flex items-center gap-2 text-xs text-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden /> {t('partnerPortal.profile.emailHint')}
        </p>
        <form onSubmit={submit} className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">{t('partnerPortal.profile.firstName')}</span>
            <input className="input" required maxLength={80} autoComplete="given-name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">{t('partnerPortal.profile.lastName')}</span>
            <input className="input" maxLength={80} autoComplete="family-name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">{t('partnerPortal.profile.phone')}</span>
            <input className="input" type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </label>
          <p className="text-xs text-muted sm:col-span-2">{t('partnerPortal.profile.noBanking')}</p>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={save.isPending || !form.firstName.trim()}>
              {save.isPending && <Spinner className="size-4" />} {t('partnerPortal.common.save')}
            </button>
          </div>
        </form>
      </Section>

      <Section title={t('partnerPortal.profile.password')} icon={KeyRound}>
        <form onSubmit={submitPw} className="grid gap-4">
          <label className="block">
            <span className="label">{t('partnerPortal.profile.currentPassword')}</span>
            <input className="input" type="password" autoComplete="current-password" maxLength={128} value={pw.currentPassword} onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">{t('partnerPortal.profile.newPassword')}</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={pw.newPassword} onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))} aria-describedby="pp-pw-hint" />
            <span id="pp-pw-hint" className="mt-1 block text-xs text-muted">
              {t('partnerPortal.profile.passwordHint')}
            </span>
          </label>
          <div>
            <button type="submit" className="btn-primary" disabled={change.isPending || !pw.currentPassword || pw.newPassword.length < 8}>
              {change.isPending && <Spinner className="size-4" />} {t('partnerPortal.profile.password')}
            </button>
          </div>
        </form>
      </Section>
    </div>
  );
}
