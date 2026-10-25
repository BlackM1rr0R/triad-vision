import { CallButton } from '@/components/calls/CallButton'; // click-to-call (Twilio / sipgate) or manual call log
import { lazy, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { FileSpreadsheet, FolderOpen, KeyRound, LogOut, Mail, Trash2, MessageSquare, MonitorSmartphone, Phone, Search, UserPlus, Users as UsersIcon, Wifi } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole, isStrongPassword, PASSWORD_MAX, PASSWORD_MIN, type Role } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { DeleteUserDialog } from '@/components/admin/DeleteUserDialog';
import { ROLE_TONE, fmtDate, fmtDateTime, fmtRelative, fullName, roleLabel, toastError } from '@/components/admin/labels';
import type { AdminUser } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, OnlineDot, PageHead, Switch } from '@/components/admin/ui';
import { DuplicateChip, useOpenDuplicateIds } from '@/components/duplicates/DuplicateBadge';
import { ViewAsClientButton } from '@/components/privacyTools/ViewAsClientButton';
import { useNewParam } from '@/components/command/useNewParam'; // ?new=1 deep link (Ctrl+K palette)
// Field-level change history of the user (ADMIN+, own chunk).
const HistoryButton = lazy(() => import('@/components/history/HistoryButton'));

/** Roles that can be filtered on. */
const ROLES: Role[] = ['CLIENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN'];
/** Roles the super admin can assign to another account (the single super admin is seeded, never assigned). */
const ASSIGNABLE: Role[] = ['CLIENT', 'STAFF', 'ADMIN'];
const isRole = (v: string | null): v is Role => !!v && (ROLES as string[]).includes(v);

const usePasswordHint = () => {
  const { t } = useTranslation();
  return t('admin.users.passwordHint', { min: PASSWORD_MIN, max: PASSWORD_MAX });
};

type Patch = { role?: Role; isActive?: boolean; password?: string };

const useUserPatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Patch }) => (await api.patch<{ user: AdminUser }>(`/admin/users/${id}`, patch)).data.user,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) => toastError(err),
  });
};

const CreateUserModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const passwordHint = usePasswordHint();
  const qc = useQueryClient();
  const empty = { email: '', password: '', firstName: '', lastName: '', phone: '', role: 'STAFF' as 'STAFF' | 'ADMIN' };
  const [f, setF] = useState(empty);
  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        email: f.email.trim(),
        password: f.password,
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        phone: f.phone.trim() || undefined,
        role: f.role,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-staff'] });
      void qc.invalidateQueries({ queryKey: ['docs-folders'] });
      toast.success(t('admin.users.created'));
      setF(empty);
      onClose();
    },
    onError: (err) => toastError(err),
  });
  const passwordOk = isStrongPassword(f.password);
  const valid = /\S+@\S+\.\S+/.test(f.email) && passwordOk && f.firstName.trim() && f.lastName.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.users.newStaff')}
      description={t('admin.users.newStaffDesc')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="create-user" className="btn-primary btn-sm" disabled={!valid || m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} {t('admin.common.create')}
          </button>
        </>
      }
    >
      <form
        id="create-user"
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) m.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor="cu-first">
            {t('admin.users.firstName')}
          </label>
          <input id="cu-first" className="input" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-last">
            {t('admin.users.lastName')}
          </label>
          <input id="cu-last" className="input" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cu-email">
            {t('admin.users.email')}
          </label>
          <input id="cu-email" type="email" className="input" required autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-phone">
            {t('admin.users.phoneOptional')}
          </label>
          <input id="cu-phone" type="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-role">
            {t('admin.users.role')}
          </label>
          <select id="cu-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'STAFF' | 'ADMIN' })}>
            <option value="STAFF">{roleLabel('STAFF')}</option>
            <option value="ADMIN">{roleLabel('ADMIN')}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cu-pass">
            {t('admin.users.password')}
          </label>
          <input
            id="cu-pass"
            type="password"
            className={clsx('input', f.password && !passwordOk && 'border-danger')}
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
          <p className={clsx('mt-1 text-[11px]', f.password && !passwordOk ? 'text-danger-fg' : 'text-muted')}>{passwordHint}</p>
        </div>
      </form>
    </Modal>
  );
};

const ResetPasswordModal = ({ user, onClose }: { user: AdminUser | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const passwordHint = usePasswordHint();
  const [password, setPassword] = useState('');
  const patch = useUserPatch();
  useEffect(() => setPassword(''), [user]);
  const ok = isStrongPassword(password);
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title={t('admin.users.resetPassword')}
      description={user ? t('admin.users.resetDesc', { name: fullName(user), email: user.email }) : undefined}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('admin.common.cancel')}
          </button>
          <button type="submit" form="reset-pass" className="btn-primary btn-sm" disabled={!ok || patch.isPending}>
            {patch.isPending && <Spinner className="size-3.5" />} {t('admin.common.save')}
          </button>
        </>
      }
    >
      <form
        id="reset-pass"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user || !ok) return;
          patch.mutate(
            { id: user.id, patch: { password } },
            {
              onSuccess: () => {
                toast.success(t('admin.users.passwordUpdated'));
                onClose();
              },
            },
          );
        }}
      >
        <label className="label" htmlFor="rp-pass">
          {t('admin.users.newPassword')}
        </label>
        <input
          id="rp-pass"
          type="password"
          className={clsx('input', password && !ok && 'border-danger')}
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className={clsx('mt-1 text-[11px]', password && !ok ? 'text-danger-fg' : 'text-muted')}>
          {passwordHint} {t('admin.users.deliverHint')}
        </p>
      </form>
    </Modal>
  );
};

const RevokeSessionsDialog = ({ user, onClose }: { user: AdminUser | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const m = useMutation({
    mutationFn: async (id: string) => (await api.post<{ ok: boolean; revoked: number }>(`/admin/users/${id}/revoke-sessions`)).data,
    onSuccess: (r) => {
      toast.success(r.revoked ? t('admin.users.revokedCount', { count: r.revoked }) : t('admin.users.noSessions'));
      onClose();
    },
    onError: (err) => toastError(err),
  });
  return (
    <ConfirmDialog
      open={!!user}
      onClose={onClose}
      onConfirm={() => user && m.mutate(user.id)}
      loading={m.isPending}
      title={t('admin.users.revokeTitle')}
      confirmLabel={t('admin.users.revoke')}
      message={user ? t('admin.users.revokeMsg', { name: fullName(user), email: user.email }) : undefined}
    />
  );
};

const RoleControl = ({ u, editable }: { u: AdminUser; editable: boolean }) => {
  const { t } = useTranslation();
  const patch = useUserPatch();
  if (!editable) return <span className={clsx('badge', ROLE_TONE[u.role])}>{roleLabel(u.role)}</span>;
  return (
    <select
      aria-label={t('admin.users.roleAria', { name: fullName(u) })}
      className={clsx('min-h-8 shrink-0 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-focus/30', ROLE_TONE[u.role])}
      value={u.role}
      disabled={patch.isPending}
      onChange={(e) =>
        patch.mutate(
          { id: u.id, patch: { role: e.target.value as Role } },
          { onSuccess: (nu) => toast.success(t('admin.users.roleChanged', { name: fullName(nu), role: roleLabel(nu.role) })) },
        )
      }
    >
      {ASSIGNABLE.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r)}
        </option>
      ))}
    </select>
  );
};

const ActiveControl = ({ u, editable }: { u: AdminUser; editable: boolean }) => {
  const { t } = useTranslation();
  const patch = useUserPatch();
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={u.isActive}
        disabled={!editable || patch.isPending}
        label={u.isActive ? t('admin.users.activeToggleOn') : t('admin.users.activeToggleOff')}
        onChange={(isActive) =>
          patch.mutate({ id: u.id, patch: { isActive } }, { onSuccess: (nu) => toast.success(nu.isActive ? t('admin.users.activated') : t('admin.users.deactivated')) })
        }
      />
      <span className={clsx('text-xs', u.isActive ? 'text-success-fg' : 'text-muted')}>{u.isActive ? t('admin.common.active') : t('admin.common.inactiveCap')}</span>
    </span>
  );
};

/** Session facts: last login, live sessions, logins in 30 days. */
const ActivityCell = ({ u }: { u: AdminUser }) => {
  const { t } = useTranslation();
  return (
    <span className="block text-xs">
      <span className="block whitespace-nowrap text-ink/80" title={u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : undefined}>
        {t('admin.users.lastLogin', { value: u.lastLoginAt ? fmtRelative(u.lastLoginAt) : '—' })}
      </span>
      <span className="mt-0.5 inline-flex items-center gap-2 whitespace-nowrap text-muted tabular-nums">
        <span className="inline-flex items-center gap-1" title={t('admin.users.liveSessions')}>
          <MonitorSmartphone className="size-3" aria-hidden /> {u.liveSessions}
        </span>
        <span>· {t('admin.users.logins30', { count: u.logins30d })}</span>
      </span>
    </span>
  );
};

/** Per-role counters: a client's cases, a staff member's assigned cases and workspace files, everyone's messages. */
const CountsCell = ({ u }: { u: AdminUser }) => {
  const { t } = useTranslation();
  const staff = u.role !== 'CLIENT';
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-xs whitespace-nowrap text-ink/80 tabular-nums">
      {staff ? (
        <>
          <span title={t('admin.users.assignedTitle')}>{t('admin.users.assignedCount', { count: u._count.assignedCases })}</span>
          <span className="inline-flex items-center gap-1" title={t('admin.users.workspaceFiles')}>
            <FolderOpen className="size-3 text-muted" aria-hidden /> {u._count.docFiles}
          </span>
        </>
      ) : (
        <span title={t('admin.users.casesTitle')}>{t('admin.users.casesCount', { count: u._count.cases })}</span>
      )}
      <span className="inline-flex items-center gap-1" title={t('admin.common.messages')}>
        <MessageSquare className="size-3 text-muted" aria-hidden /> {u._count.messages}
      </span>
    </span>
  );
};

const RowActions = ({
  u,
  onReset,
  onRevoke,
  onDelete,
  compact,
}: {
  u: AdminUser;
  onReset: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center', compact ? '-my-2 -mr-2 gap-0.5' : 'gap-1')}>
      <button
        type="button"
        className={clsx('inline-flex items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-link hover:bg-primary/[0.06]', compact ? 'min-h-10' : 'min-h-8 py-1')}
        onClick={onReset}
        title={t('admin.users.resetPassword')}
      >
        <KeyRound className="size-3.5" /> {t('admin.users.passwordBtn')}
      </button>
      <button
        type="button"
        className={clsx('inline-flex items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-muted hover:bg-danger-bg hover:text-danger-fg', compact ? 'min-h-10' : 'min-h-8 py-1')}
        onClick={onRevoke}
        title={t('admin.users.revokeTitle')}
        aria-label={t('admin.users.revokeAria', { name: fullName(u) })}
      >
        <LogOut className="size-3.5" /> {t('admin.users.revoke')}
      </button>
      <button
        type="button"
        className={clsx('inline-flex items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap text-danger-fg hover:bg-danger-bg', compact ? 'min-h-10' : 'min-h-8 py-1')}
        onClick={onDelete}
        title={t('admin.users.deleteTitle')}
        aria-label={t('admin.users.deleteAria', { name: fullName(u) })}
      >
        <Trash2 className="size-3.5" /> {t('admin.users.deleteBtn')}
      </button>
    </span>
  );
};

export default function Users() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  /** Only the super admin manages accounts; admins and staff see the list. */
  const canManage = hasMinRole(me?.role, 'SUPER_ADMIN');
  const [params, setParams] = useSearchParams();
  const roleParam = params.get('role');
  const role = isRole(roleParam) ? roleParam : null;
  const onlineOnly = params.get('online') === '1';
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [search, setSearch] = useState(searchInput);
  const [creating, setCreating] = useState(false);
  useNewParam(() => canManage && setCreating(true));
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [revokeFor, setRevokeFor] = useState<AdminUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (search) next.set('search', search);
    else next.delete('search');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-users', { role, search }],
    queryFn: async () => (await api.get<{ users: AdminUser[] }>('/admin/users', { params: { role: role ?? undefined, search: search || undefined } })).data.users,
    placeholderData: keepPreviousData,
  });

  const setRole = (r: Role | null) => {
    const next = new URLSearchParams(params);
    if (r) next.set('role', r);
    else next.delete('role');
    setParams(next, { replace: true });
  };
  const setOnline = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set('online', '1');
    else next.delete('online');
    setParams(next, { replace: true });
  };

  const all = data ?? [];
  const onlineCount = all.filter((u) => u.online).length;
  const users = onlineOnly ? all.filter((u) => u.online) : all;
  // Possible duplicate clients (badge) and merged-away accounts (link to the primary).
  const dupIds = useOpenDuplicateIds(all.filter((u) => u.role === 'CLIENT' && !u.mergedIntoId).map((u) => u.id));
  const dupMark = (u: AdminUser) =>
    u.mergedIntoId ? <DuplicateChip userId={u.id} merged className="mt-1" /> : dupIds.has(u.id) ? <DuplicateChip userId={u.id} className="mt-1" /> : null;
  /** The super admin account itself and the viewer's own row are never editable. */
  const editable = (u: AdminUser) => canManage && u.id !== me?.id && u.role !== 'SUPER_ADMIN';

  const subtitle = data
    ? [t('admin.users.usersCount', { count: users.length }) + (all.length >= 200 ? ` ${t('admin.users.first200')}` : ''), t('admin.users.onlineCount', { count: onlineCount })].join(' · ')
    : undefined;

  return (
    <div>
      <PageHead
        title={t('admin.nav.users')}
        subtitle={subtitle}
        actions={
          <>
            {isFetching && !isLoading && <Spinner className="size-4 text-link" />}
            {canManage && (
              <a
                href="/api/admin/users/clients.xlsx"
                className="btn-secondary btn-sm"
                title={t('admin.users.excelHint')}
                download
              >
                <FileSpreadsheet className="size-3.5" /> {t('admin.users.excel')}
              </a>
            )}
            {canManage && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
                <UserPlus className="size-3.5" /> {t('admin.users.newStaff')}
              </button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">{t('admin.common.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder={t('admin.users.searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0">
          <Chip active={onlineOnly} onClick={() => setOnline(!onlineOnly)} count={onlineCount}>
            <Wifi className="size-3" aria-hidden /> {t('admin.common.online')}
          </Chip>
          <Chip active={!role} onClick={() => setRole(null)}>
            {t('admin.common.all')}
          </Chip>
          {ROLES.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(role === r ? null : r)}>
              {roleLabel(r)}
            </Chip>
          ))}
        </div>
      </div>

      {!canManage && <p className="mb-3 rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">{t('admin.users.readOnly')}</p>}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={UsersIcon} title={t('admin.users.notFound')} />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-card xl:block">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t('admin.users.th.user')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.contact')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.role')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.status')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.activity')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.counts')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.registered')}</th>
                  {canManage && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const self = u.id === me?.id;
                  const can = editable(u);
                  return (
                    <tr key={u.id} className={clsx(!u.isActive && 'bg-sunken text-muted')}>
                      <td className="px-4 py-3">
                        <p className="font-semibold whitespace-nowrap text-ink">
                          {fullName(u)} {self && <span className="badge ml-1 bg-primary/10 text-[10px] text-link">{t('admin.common.you')}</span>}
                        </p>
                        <OnlineDot online={u.online} lastSeenAt={u.lastSeenAt} className="mt-0.5" />
                        {dupMark(u)}
                        <ViewAsClientButton user={u} compact className="mt-1.5" />
                        <Suspense fallback={null}>
                          <HistoryButton entity="USER" entityId={u.id} name={fullName(u)} className="-ml-2" />
                        </Suspense>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <a href={`mailto:${u.email}`} className="flex min-h-6 items-center gap-1 whitespace-nowrap text-ink/80 hover:text-link">
                          <Mail className="size-3" /> {u.email}
                        </a>
                        {u.phone && (
                          <a href={`tel:${u.phone}`} className="flex min-h-6 items-center gap-1 text-muted hover:text-link">
                            <Phone className="size-3" /> {u.phone}
                          </a>
                        )}
                        {u.phone && <CallButton target={{ clientId: u.id }} phone={u.phone} name={fullName(u)} compact className="mt-1" />}
                      </td>
                      <td className="px-4 py-3">
                        <RoleControl u={u} editable={can} />
                      </td>
                      <td className="px-4 py-3">
                        <ActiveControl u={u} editable={can} />
                      </td>
                      <td className="px-4 py-3">
                        <ActivityCell u={u} />
                      </td>
                      <td className="px-4 py-3">
                        <CountsCell u={u} />
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          {can && <RowActions u={u} onReset={() => setResetFor(u)} onRevoke={() => setRevokeFor(u)} onDelete={() => setDeleteFor(u)} />}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {users.map((u) => {
              const self = u.id === me?.id;
              const can = editable(u);
              return (
                <li key={u.id} className={clsx('rounded-xl border border-line bg-card p-4', !u.isActive && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {fullName(u)} {self && <span className="badge ml-1 bg-primary/10 text-[10px] text-link">{t('admin.common.you')}</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                      {u.phone && <p className="text-xs text-muted">{u.phone}</p>}
                      <OnlineDot online={u.online} lastSeenAt={u.lastSeenAt} className="mt-1" />
                      {dupMark(u)}
                      <ViewAsClientButton user={u} compact className="mt-2" />
                      <Suspense fallback={null}>
                        <HistoryButton entity="USER" entityId={u.id} name={fullName(u)} compact className="-ml-2" />
                      </Suspense>
                    </div>
                    <RoleControl u={u} editable={can} />
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                    <ActivityCell u={u} />
                    <CountsCell u={u} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <ActiveControl u={u} editable={can} />
                    <span className="text-[11px] text-muted">{t('admin.users.registeredAt', { date: fmtDate(u.createdAt) })}</span>
                    {can && <RowActions u={u} compact onReset={() => setResetFor(u)} onRevoke={() => setRevokeFor(u)} onDelete={() => setDeleteFor(u)} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canManage && <CreateUserModal open={creating} onClose={() => setCreating(false)} />}
      {canManage && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
      {canManage && <RevokeSessionsDialog user={revokeFor} onClose={() => setRevokeFor(null)} />}
      {canManage && <DeleteUserDialog user={deleteFor} onClose={() => setDeleteFor(null)} />}
    </div>
  );
}
