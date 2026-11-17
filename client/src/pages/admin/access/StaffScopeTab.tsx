import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesAccess } from '@/i18n/pagesAccess';
import { Button, Checkbox, Field, Input, Modal, Spinner, confirmDialog } from '@/components/ui';
import { ErrorState } from '@/components/ui/ErrorState';
import { fmtDateTime } from '@/components/admin/labels';
import { fullName, staffUsersKey, useAccessError, useStaffUsers, type StaffUser } from './StaffRolesTab';

registerCopy(pagesAccess);

/**
 * Access Center › Case visibility: per staff member ALL (default, today) / ASSIGNED / TEAM, the teams of the
 * TEAM scope, and the break-glass log (emergency access to one case outside the scope; revoke).
 * Server: routes/admin/accessStaff.ts (/access/scope/*), lib/access (caseScopeWhere, break-glass).
 */

const BASE = '/admin/access';
const SCOPES = ['ALL', 'ASSIGNED', 'TEAM'] as const;
type Scope = (typeof SCOPES)[number];

interface Team {
  id: string;
  name: string;
  description: string | null;
  memberIds: string[];
}
interface Grant {
  id: string;
  userId: string;
  caseId: string;
  caseNumber: string | null;
  reason: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  user: { firstName: string; lastName: string; email: string } | null;
  revokedBy: { firstName: string; lastName: string; email: string } | null;
}

const teamsKey = ['access-scope-teams'] as const;

export default function StaffScopeTab() {
  return (
    <div className="space-y-8">
      <ScopeSection />
      <TeamsSection />
      <BreakGlassSection />
    </div>
  );
}

const ScopeSection = () => {
  const { t } = useTranslation();
  const users = useStaffUsers();
  const teams = useQuery({ queryKey: teamsKey, queryFn: async () => (await api.get<{ teams: Team[] }>(`${BASE}/scope/teams`)).data.teams });
  return (
    <section aria-labelledby="access-scope-title" className="space-y-3">
      <div>
        <h2 id="access-scope-title" className="type-section-title text-ink">
          {t('accessStaff.scopeTitle')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessStaff.scopeIntro')}</p>
      </div>
      {users.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : users.isError || !users.data ? (
        <ErrorState onRetry={() => void users.refetch()} />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {users.data.map((u) => (
            <ScopeRow key={u.id} user={u} teams={teams.data ?? []} />
          ))}
        </ul>
      )}
    </section>
  );
};

const ScopeRow = ({ user, teams }: { user: StaffUser; teams: Team[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useAccessError();
  const { user: me } = useAuth();
  const locked = user.role === 'SUPER_ADMIN' || user.id === me?.id;
  const save = useMutation({
    mutationFn: async (caseScope: Scope) => api.put(`${BASE}/scope/users/${user.id}`, { caseScope }),
    onSuccess: () => {
      toast.success(t('accessStaff.saved'));
      void qc.invalidateQueries({ queryKey: staffUsersKey });
    },
    onError,
  });
  const myTeams = teams.filter((x) => x.memberIds.includes(user.id)).map((x) => x.name);
  const selectId = `scope-${user.id}`;
  return (
    <li className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', !user.isActive && 'opacity-70')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{fullName(user)}</p>
        <p className="truncate text-xs text-muted">
          {[t(`accessStaff.roles.${user.role}`), user.email, myTeams.length ? myTeams.join(', ') : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      {locked ? (
        <span className="text-xs text-muted">{user.role === 'SUPER_ADMIN' ? t('accessStaff.superAlways') : t('accessStaff.self')}</span>
      ) : (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={selectId}>
            {t('accessStaff.scopeTitle')}
          </label>
          <select id={selectId} className="input w-auto min-w-44" value={user.caseScope} disabled={save.isPending} onChange={(e) => save.mutate(e.target.value as Scope)}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {t(`accessStaff.scope.${s}`)}
              </option>
            ))}
          </select>
          {save.isPending && <Spinner className="size-4 text-primary" />}
        </div>
      )}
    </li>
  );
};

// ─── Teams ─────────────────────────────────────────────────────────────

const TeamsSection = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useAccessError();
  const teams = useQuery({ queryKey: teamsKey, queryFn: async () => (await api.get<{ teams: Team[] }>(`${BASE}/scope/teams`)).data.teams });
  const users = useStaffUsers();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, fullName(u)])), [users.data]);
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`${BASE}/scope/teams/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: teamsKey }),
    onError,
  });

  return (
    <section aria-labelledby="access-teams-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="access-teams-title" className="type-section-title text-ink">
            {t('accessStaff.teams')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessStaff.teamsIntro')}</p>
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
          {t('accessStaff.newTeam')}
        </Button>
      </div>
      {teams.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : teams.isError || !teams.data ? (
        <ErrorState onRetry={() => void teams.refetch()} />
      ) : !teams.data.length ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t('accessStaff.noTeams')}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {teams.data.map((team) => (
            <li key={team.id} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                  <Users className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{team.name}</span>
                </p>
                <span className="badge chip-soft shrink-0 text-[11px]">{t('accessStaff.membersCount', { count: team.memberIds.length })}</span>
              </div>
              {team.description && <p className="mt-1 text-xs text-muted">{team.description}</p>}
              <p className="mt-2 text-xs text-ink">{team.memberIds.map((id) => names.get(id) ?? id).join(', ')}</p>
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(team)}>
                  {t('accessStaff.edit')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={async () => {
                    if (await confirmDialog({ title: t('accessStaff.delete'), message: team.name, tone: 'danger' })) remove.mutate(team.id);
                  }}
                >
                  {t('accessStaff.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TeamEditor team={editing === 'new' ? null : editing} users={users.data ?? []} onClose={() => setEditing(null)} />}
    </section>
  );
};

const TeamEditor = ({ team, users, onClose }: { team: Team | null; users: StaffUser[]; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useAccessError();
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [members, setMembers] = useState<string[]>(team?.memberIds ?? []);
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), description: description.trim() || null, memberIds: members };
      return team ? api.put(`${BASE}/scope/teams/${team.id}`, body) : api.post(`${BASE}/scope/teams`, body);
    },
    onSuccess: () => {
      toast.success(t('accessStaff.saved'));
      void qc.invalidateQueries({ queryKey: teamsKey });
      onClose();
    },
    onError,
  });
  return (
    <Modal
      open
      onClose={onClose}
      busy={save.isPending}
      size="md"
      title={team ? team.name : t('accessStaff.newTeam')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {t('accessStaff.close')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            {t('accessStaff.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('accessStaff.teamName')} required>
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('accessStaff.description')}>
          <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">{t('accessStaff.members')}</legend>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-line p-3">
            {users
              .filter((u) => u.isActive)
              .map((u) => (
                <Checkbox
                  key={u.id}
                  label={`${fullName(u)} · ${t(`accessStaff.roles.${u.role}`)}`}
                  checked={members.includes(u.id)}
                  onChange={(e) => setMembers((m) => (e.target.checked ? [...m, u.id] : m.filter((x) => x !== u.id)))}
                />
              ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
};

// ─── Break-glass log ───────────────────────────────────────────────────

const BreakGlassSection = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useAccessError();
  const [activeOnly, setActiveOnly] = useState(false);
  const meta = useQuery({ queryKey: ['access-staff-meta'], queryFn: async () => (await api.get<{ breakGlassHours: number }>(`${BASE}/staff/meta`)).data, staleTime: 5 * 60_000 });
  const q = useQuery({
    queryKey: ['access-break-glass', activeOnly],
    queryFn: async () => (await api.get<{ grants: Grant[] }>(`${BASE}/scope/break-glass`, { params: activeOnly ? { active: 1 } : {} })).data.grants,
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => api.post(`${BASE}/scope/break-glass/${id}/revoke`),
    onSuccess: () => {
      toast.success(t('accessStaff.revoked_ok'));
      void qc.invalidateQueries({ queryKey: ['access-break-glass'] });
    },
    onError,
  });
  const statusOf = (g: Grant) => (g.revokedAt ? 'revoked' : g.active ? 'active' : 'expired');

  return (
    <section aria-labelledby="access-bg-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="access-bg-title" className="type-section-title text-ink">
            {t('accessStaff.breakGlassTitle')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessStaff.breakGlassIntro', { hours: meta.data?.breakGlassHours ?? 8 })}</p>
        </div>
        <Checkbox label={t('accessStaff.onlyActive')} checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
      </div>
      {q.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : !q.data.length ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t('accessStaff.noGrants')}</p>
      ) : (
        <ul className="space-y-2">
          {q.data.map((g) => {
            const status = statusOf(g);
            return (
              <li key={g.id} className="rounded-xl border border-line bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 font-semibold text-ink">
                    {g.user ? fullName(g.user) : g.userId} →{' '}
                    <Link className="text-primary underline-offset-2 hover:underline" to={`/admin/cases/${g.caseId}`}>
                      {g.caseNumber ?? g.caseId}
                    </Link>
                  </p>
                  <span
                    className={clsx(
                      'badge text-[11px]',
                      status === 'active' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-sunken text-muted',
                    )}
                  >
                    {t(`accessStaff.${status}`)}
                  </span>
                </div>
                <p className="mt-1 break-words text-ink">
                  <span className="text-muted">{t('accessStaff.reason')}: </span>
                  {g.reason}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t('accessStaff.when')}: {fmtDateTime(g.createdAt)} · {t('accessStaff.until')}: {fmtDateTime(g.revokedAt ?? g.expiresAt)}
                  {g.revokedBy ? ` · ${fullName(g.revokedBy)}` : ''}
                </p>
                {status === 'active' && (
                  <div className="mt-2">
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(g.id)} loading={revoke.isPending && revoke.variables === g.id}>
                      {t('accessStaff.revoke')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
