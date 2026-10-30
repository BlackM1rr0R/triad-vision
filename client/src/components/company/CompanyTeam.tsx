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
}
interface Team {
  members: Member[];
  ownerId: string | null;
  isOwner: boolean;
  cap: number;
  activeCount: number;
}

const TEAM_KEY = ['company-team'];
const KNOWN = ['TEAM_LIMIT_REACHED', 'EMAIL_TAKEN', 'CANNOT_REMOVE_SELF', 'NOT_COMPANY_OWNER'];

/**
 * Employer portal › Profile › Team (server: routes/companyTeam.ts). Everyone sees the company's logins; the owner
 * (the oldest active login) invites colleagues (set-password link by e-mail), resends a pending link and
 * deactivates logins.
 */
export const CompanyTeam = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const { data, isLoading } = useQuery({ queryKey: TEAM_KEY, queryFn: async () => (await api.get<Team>('/company/team')).data });
  const fail = (err: unknown) => {
    const code = errorCode(err) ?? '';
    toast.error(KNOWN.includes(code) ? t(`px.team.${code}`) : t('common.error'));
  };
  const invite = useMutation({
    mutationFn: async () => (await api.post<{ member: Member }>('/company/team', { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() })).data.member,
    onSuccess: (m) => {
      toast.success(t('px.team.invited', { email: m.email }));
      setForm({ firstName: '', lastName: '', email: '' });
      void qc.invalidateQueries({ queryKey: TEAM_KEY });
    },
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/company/team/${id}/resend`),
    onSuccess: () => toast.success(t('px.team.resent')),
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
            {!data.isOwner && owner && <span className="text-xs text-muted">{t('px.team.ownerOnly', { name: `${owner.firstName} ${owner.lastName}`.trim() })}</span>}
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
                {data.isOwner && m.isActive && !m.me && (
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
          {data.isOwner && (
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
