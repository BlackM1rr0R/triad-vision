import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { MailPlus, RotateCw, UserMinus, UsersRound } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { confirmDialog } from '@/components/ui/ConfirmHost';
import { Spinner } from '@/components/ui/Spinner';
import { Section } from './shared';
import { COMPANY_ACCESS_KEY, type CompanyRoleName } from './access'; // employer roles (registers the companyRoles copy)

registerCopy(pagesPortalExtras);

interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: string;
  pending: boolean;
  owner: boolean;
  me: boolean;
  role?: CompanyRoleName;
}
interface Team {
  members: Member[];
  ownerId: string | null;
  isOwner: boolean;
  /** Owner, or a member with the ADMIN / OWNER role (lib/companyAccess). */
  canManage?: boolean;
  assignableRoles?: CompanyRoleName[];
  cap: number;
  activeCount: number;
}

const TEAM_KEY = ['company-team'];
const KNOWN = ['TEAM_LIMIT_REACHED', 'EMAIL_TAKEN', 'CANNOT_REMOVE_SELF', 'NOT_COMPANY_OWNER'];
const ROLE_ERRORS = ['CANNOT_CHANGE_OWNER', 'CANNOT_CHANGE_SELF', 'COMPANY_PERMISSION_REQUIRED'];

/**
 * Employer portal › Profile › Team (server: routes/companyTeam.ts). Everyone sees the company's logins; the owner
 * (the oldest active login) and members with the ADMIN role invite colleagues (set-password link by e-mail), give
 * them a role (lib/companyAccess: Standard / Admin / HR / Manager / View only), resend a pending link and
 * deactivate logins.
 */
export const CompanyTeam = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', role: 'STANDARD' as CompanyRoleName });
  const { data, isLoading } = useQuery({ queryKey: TEAM_KEY, queryFn: async () => (await api.get<Team>('/company/team')).data });
  const fail = (err: unknown) => {
    const code = errorCode(err) ?? '';
    toast.error(KNOWN.includes(code) ? t(`px.team.${code}`) : ROLE_ERRORS.includes(code) ? t(`companyRoles.team.${code}`) : t('common.error'));
  };
  const invite = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ member: Member }>('/company/team', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          ...(form.role !== 'STANDARD' ? { role: form.role } : {}),
        })
      ).data.member,
    onSuccess: (m) => {
      toast.success(t('px.team.invited', { email: m.email }));
      setForm({ firstName: '', lastName: '', email: '', role: 'STANDARD' });
      void qc.invalidateQueries({ queryKey: TEAM_KEY });
    },
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/company/team/${id}/resend`),
    onSuccess: () => toast.success(t('px.team.resent')),
    onError: fail,
  });
  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: CompanyRoleName }) => api.patch(`/company/team/${id}/role`, { role }),
    onSuccess: () => {
      toast.success(t('companyRoles.team.roleChanged'));
      void qc.invalidateQueries({ queryKey: TEAM_KEY });
      void qc.invalidateQueries({ queryKey: COMPANY_ACCESS_KEY });
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/company/team/${id}`),
    onSuccess: () => {
      toast.success(t('px.team.removed'));
      void qc.invalidateQueries({ queryKey: TEAM_KEY });
    },
    onError: fail,
  });

  const askRemove = async (m: Member) => {
    const name = `${m.firstName} ${m.lastName}`.trim();
    if (await confirmDialog({ title: t('px.team.removeTitle'), message: t('px.team.removeText', { name }), confirmLabel: t('px.team.remove') })) remove.mutate(m.id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.firstName.trim() && form.lastName.trim() && form.email.trim()) invite.mutate();
  };

  const owner = data?.members.find((m) => m.owner);
  const full = !!data && data.activeCount >= data.cap;
  const canManage = !!data && (data.canManage ?? data.isOwner);
  const roles: CompanyRoleName[] = data?.assignableRoles ?? ['STANDARD'];
  // The owner and OWNER members are changed only by the owner (and Triad Vision).
  const mayChange = (m: Member) => canManage && m.isActive && !m.me && !m.owner && (m.role !== 'OWNER' || !!data?.isOwner);

  return (
    <Section title={t('px.team.title')} icon={UsersRound}>
      <p className="-mt-1 mb-4 text-sm text-muted">{t('px.team.intro')}</p>
      {isLoading || !data ? (
        <div className="grid place-items-center py-8 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className={clsx('badge', full ? 'bg-warning-bg text-warning-fg' : 'bg-sunken text-muted')}>{t('px.team.cap', { count: data.activeCount, cap: data.cap })}</span>
            {!canManage && owner && <span className="text-xs text-muted">{t('px.team.ownerOnly', { name: `${owner.firstName} ${owner.lastName}`.trim() })}</span>}
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.members.map((m) => (
              <li key={m.id} className={clsx('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', !m.isActive && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    <span className="truncate">
                      {m.firstName} {m.lastName}
                    </span>
                    {m.owner && <span className="badge chip-soft text-[11px]">{t('px.team.owner')}</span>}
                    {m.me && <span className="badge bg-sunken text-[11px] text-link">{t('px.team.you')}</span>}
                    {m.role && !m.owner && m.role !== 'STANDARD' && <span className="badge bg-sunken text-[11px] text-ink">{t(`companyRoles.role.${m.role}`)}</span>}
                    {!m.isActive ? (
                      <span className="badge bg-sunken text-[11px] text-muted">{t('px.team.inactive')}</span>
                    ) : m.pending ? (
                      <span className="badge bg-warning-bg text-[11px] text-warning-fg">{t('px.team.pending')}</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.email} · {date(m.createdAt)}
                  </p>
                </div>
                {mayChange(m) && m.role !== 'OWNER' && (
                  <div className="w-full sm:w-auto">
                    <label className="sr-only" htmlFor={`team-role-${m.id}`}>
                      {t('companyRoles.team.changeRole')}
                    </label>
                    <select
                      id={`team-role-${m.id}`}
                      className="input min-h-10 py-1.5 text-sm"
                      value={m.role ?? 'STANDARD'}
                      disabled={changeRole.isPending}
                      onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as CompanyRoleName })}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {t(`companyRoles.role.${r}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {mayChange(m) && (
                  <div className="flex flex-wrap gap-2">
                    {m.pending && (
                      <button type="button" className="btn-secondary btn-sm min-h-10" onClick={() => resend.mutate(m.id)} disabled={resend.isPending}>
                        <RotateCw className="size-3.5" aria-hidden /> {t('px.team.resend')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm min-h-10 border border-line text-ink hover:border-danger-border hover:bg-danger-bg hover:text-danger"
                      onClick={() => void askRemove(m)}
                      disabled={remove.isPending}
                    >
                      <UserMinus className="size-3.5" aria-hidden /> {t('px.team.remove')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canManage && (
            <form onSubmit={submit} className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
              <p className="text-sm font-semibold text-ink sm:col-span-3">{t('px.team.invite')}</p>
              <div>
                <label className="label" htmlFor="team-first">
                  {t('px.team.firstName')}
                </label>
                <input id="team-first" className="input" required maxLength={80} autoComplete="off" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="team-last">
                  {t('px.team.lastName')}
                </label>
                <input id="team-last" className="input" required maxLength={80} autoComplete="off" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="team-email">
                  {t('px.team.email')}
                </label>
                <input id="team-email" className="input" type="email" required maxLength={191} autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className="label" htmlFor="team-role">
                  {t('companyRoles.team.inviteRole')}
                </label>
                <select id="team-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CompanyRoleName })}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {t(`companyRoles.role.${r}`)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">{t(`companyRoles.roleHint.${form.role}`)}</p>
              </div>
              <div className="sm:col-span-3">
                <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={invite.isPending || full}>
                  {invite.isPending ? <Spinner className="size-4" /> : <MailPlus className="size-4" aria-hidden />} {t('px.team.send')}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Section>
  );
};
