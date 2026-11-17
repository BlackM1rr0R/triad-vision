import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Mail, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { day } from '@/components/agents/format';
import { Spinner } from '@/components/ui/Spinner';
import { portalError, type PartnerPerms } from '@/components/partnerPortal/api';
import { ErrorRetry, Loading, Section } from '@/components/partnerPortal/ui';
import { PermissionMatrix, capPerms, usePermSummary } from '@/components/partnerPortal/PermissionMatrix';
import i18n from '@/i18n';

/** Team member as GET /partner/team returns it (server: lib/partnerAccess/members.ts). */
export interface TeamMember {
  id: string;
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  active: boolean;
  invitedAt: string;
  deactivatedAt: string | null;
  lastSeenAt: string | null;
  twoFactor: boolean;
  perms: PartnerPerms;
  effective: PartnerPerms;
}

const teamError = (err: unknown) => {
  const code = errorCode(err);
  return code && i18n.exists(`partnerAccess.errors.${code}`) ? i18n.t(`partnerAccess.errors.${code}`) : portalError(err);
};

const samePerms = (a: PartnerPerms, b: PartnerPerms) => (Object.keys(a) as (keyof PartnerPerms)[]).every((k) => a[k] === b[k]);

/**
 * Team members of the partner (the partner's own login only). Every member gets a subset of the partner's
 * permissions; the server refuses more (PERMS_EXCEED_PARTNER). `base` lets Access Center reuse it for staff.
 */
export function TeamManager({ base, canEdit = true }: { base: string; canEdit?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['partner-team', base];
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ partnerPerms: PartnerPerms; items: TeamMember[] }>(base)).data });
  const [inviting, setInviting] = useState(false);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '' });
  const [invitePerms, setInvitePerms] = useState<PartnerPerms | null>(null);
  const [editing, setEditing] = useState<{ id: string; perms: PartnerPerms } | null>(null);
  const summary = usePermSummary();

  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const invite = useMutation({
    mutationFn: async () => (await api.post(base, { ...form, perms: invitePerms ?? undefined })).data,
    onSuccess: async () => {
      toast.success(t('partnerAccess.team.invited'));
      setForm({ email: '', firstName: '', lastName: '' });
      setInviting(false);
      setInvitePerms(null);
      await refresh();
    },
    onError: (err) => toast.error(teamError(err)),
  });
  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: { perms?: PartnerPerms; active?: boolean } }) => (await api.patch(`${base}/${id}`, body)).data,
    onSuccess: async () => {
      toast.success(t('partnerAccess.team.saved'));
      setEditing(null);
      await refresh();
    },
    onError: (err) => toast.error(teamError(err)),
  });
  const resend = useMutation({
    mutationFn: async (id: string) => (await api.post(`${base}/${id}/invite`)).data,
    onSuccess: () => toast.success(t('partnerAccess.team.invited')),
    onError: (err) => toast.error(teamError(err)),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorRetry onRetry={() => q.refetch()} />;
  const { partnerPerms, items } = q.data;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.email.trim() && form.firstName.trim()) invite.mutate();
  };

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">{t('partnerAccess.team.intro')}</p>
      {canEdit &&
        (inviting ? (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-sunken/40 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="label">{t('partnerAccess.team.email')}</span>
                <input className="input" type="email" required maxLength={191} autoComplete="off" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="block">
                <span className="label">{t('partnerAccess.team.firstName')}</span>
                <input className="input" required maxLength={80} value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              </label>
              <label className="block">
                <span className="label">{t('partnerAccess.team.lastName')}</span>
                <input className="input" maxLength={80} value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
              </label>
            </div>
            <PermissionMatrix idPrefix="invite" value={invitePerms ?? partnerPerms} max={partnerPerms} onChange={setInvitePerms} />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={invite.isPending}>
                {invite.isPending ? <Spinner className="size-4" /> : <Mail className="size-4" aria-hidden />} {t('partnerAccess.team.send')}
              </button>
              <button type="button" className="btn-ghost" onClick={() => setInviting(false)}>
                {t('partnerAccess.team.cancel')}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn-secondary" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" aria-hidden /> {t('partnerAccess.team.invite')}
          </button>
        ))}

      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('partnerAccess.team.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((m) => (
            <li key={m.id} className="py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {`${m.firstName} ${m.lastName}`.trim() || m.email}
                    <span className={clsx('badge ml-2 align-middle', m.active ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted')}>
                      {m.active ? t('partnerAccess.team.active') : t('partnerAccess.team.inactive')}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.email} · {m.lastSeenAt ? t('partnerAccess.team.lastSeen', { date: day(m.lastSeenAt) }) : t('partnerAccess.team.never')}
                    {m.twoFactor && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-success-fg">
                        <ShieldCheck className="size-3.5" aria-hidden /> {t('partnerAccess.team.twoFactor')}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-ink">{summary(m.effective)}</p>
                  {!samePerms(m.perms, m.effective) && <p className="mt-1 text-xs text-warning-fg">{t('partnerAccess.team.capped')}</p>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(editing?.id === m.id ? null : { id: m.id, perms: capPerms(m.perms, partnerPerms) })}>
                      {t('partnerAccess.team.edit')}
                    </button>
                    {m.active && (
                      <button type="button" className="btn-ghost btn-sm" disabled={resend.isPending} onClick={() => resend.mutate(m.id)}>
                        {t('partnerAccess.team.resend')}
                      </button>
                    )}
                    <button type="button" className="btn-ghost btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ id: m.id, body: { active: !m.active } })}>
                      {m.active ? t('partnerAccess.team.deactivate') : t('partnerAccess.team.activate')}
                    </button>
                  </div>
                )}
              </div>
              {editing?.id === m.id && (
                <div className="mt-3 rounded-2xl border border-line p-4">
                  <PermissionMatrix idPrefix={`m-${m.id}`} value={editing.perms} max={partnerPerms} onChange={(perms) => setEditing({ id: m.id, perms })} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary btn-sm" disabled={patch.isPending} onClick={() => patch.mutate({ id: m.id, body: { perms: editing.perms } })}>
                      {patch.isPending && <Spinner className="size-3.5" />} {t('partnerAccess.team.save')}
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)}>
                      {t('partnerAccess.team.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PartnerTeamPage() {
  const { t } = useTranslation();
  return (
    <Section title={t('partnerAccess.team.title')} icon={Users}>
      <TeamManager base="/partner/team" />
    </Section>
  );
}
