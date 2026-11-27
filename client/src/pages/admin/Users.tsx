import { CallButton } from '@/components/calls/CallButton'; // click-to-call (Twilio / sipgate) or manual call log
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { BadgeCheck, CircleAlert, FileSpreadsheet, FolderOpen, Handshake, KeyRound, LogOut, Mail, MoreHorizontal, ShieldCheck, Trash2, MessageSquare, MonitorSmartphone, Phone, Search, UserPlus, Users as UsersIcon, Wifi } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesMailAdmin } from '@/i18n/pagesMailAdmin';
import { ClientSettingsTable, SecretOnce, toastMailboxError, type ServerSettings } from '@/components/mailboxes/shared';
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
import { usePartnerOptions } from '@/components/partners/api';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneInput, phoneInvalid } from '@/components/ui/PhoneInput';
import { ClientOwnerDialog } from '@/components/partners/Ownership'; // partner-owned clients: badge, filter, owner change
import { Pagination } from '@/components/ui/Pagination';
import { Avatar } from '@/components/ui/Avatar';
import { IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { StaffPermissionsPanel, StaffSummaryLine } from '@/components/admin/StaffPermissionsPanel'; // one panel: effective permissions + role / desk / work profile
import { StaffMailboxDialog } from '@/components/admin/StaffMailboxDialog'; // create / connect the staff member's mailbox (super admin)
import { useMarkSeen } from '@/components/admin/CasesNavBadge'; // opening the page clears the sidebar "new users" badge
import { pagesUserPerms } from '@/i18n/pagesUserPerms';
registerCopy(pagesUserPerms);
registerCopy(pagesMailAdmin); // "Create mailbox" option of the new-staff dialog

// Field-level change history of the user (ADMIN+, own chunk).
const USERS_PAGE = 50;
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

/** New-staff answer: the optional mailbox (password shown once) or why it could not be created. */
type CreatedMailbox = { address: string; password: string; workspaceConnected: boolean; settings: ServerSettings } | { address: string; error: string };
const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

const CreateUserModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const passwordHint = usePasswordHint();
  const qc = useQueryClient();
  const empty = { email: '', password: '', firstName: '', lastName: '', phone: '', role: 'STAFF' as 'STAFF' | 'ADMIN' };
  const [f, setF] = useState(empty);
  // Optional "Create mailbox ad.soyad@domain": the local part follows the name until it is edited by hand.
  // Checkbox defaults ON when the mail server is configured (until the admin touches it).
  const [mb, setMb] = useState({ on: false, touched: false, localPart: '', edited: false });
  const emailKey = /\S+@\S+\.\S+/.test(f.email.trim()) ? f.email.trim().toLowerCase() : '';
  const [created, setCreated] = useState<CreatedMailbox | null>(null);
  const suggestion = useQuery({
    queryKey: ['admin-mailbox-suggestion', f.firstName.trim(), f.lastName.trim(), emailKey],
    queryFn: async () =>
      (await api.get<{ localPart: string; domain: string; configured: boolean }>('/admin/users/mailbox-suggestion', { params: { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: emailKey || undefined } })).data,
    enabled: open,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const mbOn = mb.touched ? mb.on : !!suggestion.data?.configured;
  const localPart = (mb.edited ? mb.localPart : (suggestion.data?.localPart ?? '')).trim().toLowerCase();
  const domain = suggestion.data?.domain ?? '';
  const mailboxReady = !mbOn || (!!suggestion.data?.configured && LOCAL_PART_RE.test(localPart) && !localPart.includes('..'));
  const close = () => {
    setF(empty);
    setMb({ on: false, touched: false, localPart: '', edited: false });
    setCreated(null);
    onClose();
  };
  const m = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ mailbox: CreatedMailbox | null }>('/admin/users', {
          email: f.email.trim(),
          password: f.password,
          firstName: f.firstName.trim(),
          lastName: f.lastName.trim(),
          phone: f.phone.trim() || undefined,
          role: f.role,
          ...(mbOn ? { createMailbox: true, mailboxLocalPart: localPart } : {}),
        })
      ).data,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] });
      void qc.invalidateQueries({ queryKey: ['admin-staff'] });
      void qc.invalidateQueries({ queryKey: ['docs-folders'] });
      void qc.invalidateQueries({ queryKey: ['admin-mailboxes'] });
      toast.success(t('admin.users.created'));
      // With a mailbox the dialog stays open: its password is shown exactly once.
      if (data.mailbox) setCreated(data.mailbox);
      else close();
    },
    onError: (err) => (errorCode(err).startsWith('MAIL') ? toastMailboxError(err) : toastError(err)),
  });
  const passwordOk = isStrongPassword(f.password);
  const valid = /\S+@\S+\.\S+/.test(f.email) && passwordOk && f.firstName.trim() && f.lastName.trim() && mailboxReady && !phoneInvalid(f.phone);

  if (created) {
    return (
      <Modal
        open={open}
        onClose={close}
        title={t('mailAdmin.staffCreate.doneTitle')}
        footer={
          <button type="button" className="btn-primary btn-sm" onClick={close}>
            {t('mailAdmin.actions.done')}
          </button>
        }
      >
        {'error' in created ? (
          <p className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg" role="alert">
            {t('mailAdmin.staffCreate.mailboxFailed', { address: created.address, reason: t(`mailAdmin.errors.${created.error}`, { defaultValue: t('mailAdmin.errors.fallback') }) })}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-ink/80">{t(created.workspaceConnected ? 'mailAdmin.staffCreate.mailboxCreated' : 'mailAdmin.staffCreate.mailboxCreatedNoWs', { address: created.address })}</p>
            <SecretOnce value={created.password} note={t('mailAdmin.created.passwordOnce')} />
            <ClientSettingsTable settings={created.settings} address={created.address} />
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('admin.users.newStaff')}
      description={t('admin.users.newStaffDesc')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={close}>
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
          <PhoneInput id="cu-phone" value={f.phone} onChange={(phone) => setF({ ...f, phone })} />
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
          <PasswordInput
            id="cu-pass"
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
        <div className="rounded-lg border border-line p-3 sm:col-span-2">
          <label className="flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={mbOn} onChange={(e) => setMb((v) => ({ ...v, on: e.target.checked, touched: true }))} />
            <span className="min-w-0 break-all">
              {localPart && domain ? t('mailAdmin.staffCreate.checkbox', { address: `${localPart}@${domain}` }) : t('mailAdmin.staffCreate.checkboxPlain', { domain: domain || '…' })}
            </span>
          </label>
          {mbOn && (
            <div className="mt-3 pl-6.5">
              {suggestion.data && !suggestion.data.configured ? (
                <p className="text-xs text-danger-fg" role="alert">
                  {t('mailAdmin.staffCreate.notConfigured')}
                </p>
              ) : (
                <>
                  <label className="label" htmlFor="cu-mailbox">
                    {t('mailAdmin.staffCreate.localPart')}
                  </label>
                  <div className="flex items-stretch">
                    <input
                      id="cu-mailbox"
                      className={clsx('input rounded-r-none', localPart && !mailboxReady && 'border-danger')}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={64}
                      value={localPart}
                      onChange={(e) => setMb((v) => ({ ...v, localPart: e.target.value, edited: true }))}
                    />
                    <span className="grid shrink-0 place-items-center rounded-r-lg border border-l-0 border-line bg-sunken px-3 text-sm text-muted">@{domain}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{t('mailAdmin.staffCreate.hint')}</p>
                </>
              )}
            </div>
          )}
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
        <PasswordInput
          id="rp-pass"
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
  if (!editable) return <span className={clsx('inline-flex h-8 w-28 items-center rounded-md px-2.5 text-xs font-semibold', ROLE_TONE[u.role])}>{roleLabel(u.role)}</span>;
  return (
    <select
      aria-label={t('admin.users.roleAria', { name: fullName(u) })}
      className={clsx('h-8 w-28 shrink-0 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-focus/30', ROLE_TONE[u.role])}
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
/** E-mail verified (green check) or not yet (amber), next to the address. */
const EmailVerifiedBadge = ({ u }: { u: AdminUser }) => {
  const { t } = useTranslation();
  const ok = !!u.emailVerifiedAt;
  const Icon = ok ? BadgeCheck : CircleAlert;
  return (
    <span
      className={clsx('inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold', ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}
      title={t(ok ? 'admin.users.emailVerifiedTitle' : 'admin.users.emailUnverifiedTitle')}
    >
      <Icon className="size-3.5" aria-hidden /> {t(ok ? 'admin.users.emailVerified' : 'admin.users.emailUnverified')}
    </span>
  );
};

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
    <span className="inline-flex items-center gap-x-3 text-xs whitespace-nowrap text-ink/80 tabular-nums">
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

/**
 * Role cell. Active staff (ADMIN+ viewer): ONE summary line ("Əməkdaş · Marketinq · Rəhbərlik profili") and the
 * "İcazələr" button that opens the panel (permissions + role / desk / work-profile editors). Others: the plain role.
 */
const RoleCell = ({ u, editable, showSettings, onOpen }: { u: AdminUser; editable: boolean; showSettings: boolean; onOpen: (u: AdminUser) => void }) => {
  const { t } = useTranslation();
  if (!showSettings) return <RoleControl u={u} editable={editable} />;
  return (
    <span className="flex max-w-60 min-w-0 flex-col items-start gap-1">
      <StaffSummaryLine u={u} className="max-w-full" />
      <button type="button" className="btn-secondary btn-sm inline-flex items-center gap-1" aria-label={`${t('userPerms.button')}: ${fullName(u)}`} onClick={() => onOpen(u)}>
        <ShieldCheck className="size-3.5" aria-hidden /> {t('userPerms.button')}
      </button>
    </span>
  );
};

/** Row tools: view-as-client (clients, first), change history, and the "⋯" menu with Şifrə / Çıxar / Sil. */
const RowTools = ({
  u,
  onReset,
  onRevoke,
  onDelete,
  onMailbox,
  showMenu,
}: {
  u: AdminUser;
  onReset: () => void;
  onRevoke: () => void;
  onDelete: () => void;
  /** Staff accounts only: create / connect their mailbox. */
  onMailbox: () => void;
  showMenu: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center justify-end gap-1">
      <ViewAsClientButton user={u} compact iconOnly />
      <Suspense fallback={null}>
        <HistoryButton entity="USER" entityId={u.id} name={fullName(u)} label="" className="size-8 justify-center px-0" />
      </Suspense>
      {showMenu && (
        <Menu
          label={`${t('ui.moreActions')}: ${fullName(u)}`}
          trigger={<IconButton icon={MoreHorizontal} size="sm" label={`${t('ui.moreActions')}: ${fullName(u)}`} />}
          items={[
            { key: 'reset', label: t('admin.users.resetPassword'), icon: KeyRound, onSelect: onReset },
            { key: 'revoke', label: t('admin.users.revokeTitle'), icon: LogOut, onSelect: onRevoke },
            ...(u.role !== 'CLIENT' ? [{ key: 'mailbox', label: t('userPerms.mbox.menu'), icon: Mail, onSelect: onMailbox }] : []),
            'separator',
            { key: 'delete', label: t('admin.users.deleteTitle'), icon: Trash2, danger: true, onSelect: onDelete },
          ]}
        />
      )}
    </span>
  );
};

export default function Users() {
  useMarkSeen('users');
  const { t } = useTranslation();
  const { user: me } = useAuth();
  /** Only the super admin manages accounts; admins and staff see the list. */
  const canManage = hasMinRole(me?.role, 'SUPER_ADMIN');
  const isAdmin = hasMinRole(me?.role, 'ADMIN');
  const [params, setParams] = useSearchParams();
  const roleParam = params.get('role');
  const role = isRole(roleParam) ? roleParam : null;
  const onlineOnly = params.get('online') === '1';
  // Clients of a referral partner: a partner id, "any" or "none" (server: ?ownerPartnerId=).
  const partnerFilter = params.get('partner') ?? '';
  const partnerOptions = usePartnerOptions();
  const [ownerFor, setOwnerFor] = useState<AdminUser | null>(null);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [search, setSearch] = useState(searchInput);
  const [creating, setCreating] = useState(false);
  useNewParam(() => canManage && setCreating(true));
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [revokeFor, setRevokeFor] = useState<AdminUser | null>(null);
  const [deleteFor, setDeleteFor] = useState<AdminUser | null>(null);
  const [permsFor, setPermsFor] = useState<AdminUser | null>(null);
  const [mailboxFor, setMailboxFor] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (search) next.set('search', search);
    else next.delete('search');
    if ((params.get('search') ?? '') !== search) next.delete('page');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Server paging (?page= in the URL, 50 per page); every filter resets to page 1.
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-users', { role, search, partnerFilter, onlineOnly, page }],
    queryFn: async () =>
      (
        await api.get<{ users: AdminUser[]; total: number; page: number; pageSize: number; onlineCount: number }>('/admin/users', {
          params: { role: role ?? undefined, search: search || undefined, ownerPartnerId: partnerFilter || undefined, online: onlineOnly ? '1' : undefined, page, pageSize: USERS_PAGE },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p > 1) next.set('page', String(p));
    else next.delete('page');
    setParams(next, { replace: true });
  };

  const setRole = (r: Role | null) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (r) next.set('role', r);
    else next.delete('role');
    setParams(next, { replace: true });
  };
  const setPartnerFilter = (v: string) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (v) next.set('partner', v);
    else next.delete('partner');
    setParams(next, { replace: true });
  };
  const setOnline = (v: boolean) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (v) next.set('online', '1');
    else next.delete('online');
    setParams(next, { replace: true });
  };

  const users = data?.users ?? [];
  const onlineCount = data?.onlineCount ?? 0;
  const total = data?.total ?? 0;
  // Possible duplicate clients (badge) and merged-away accounts (link to the primary).
  const dupIds = useOpenDuplicateIds(users.filter((u) => u.role === 'CLIENT' && !u.mergedIntoId).map((u) => u.id));
  /** Secondary line under the name: presence dot + small chips (you, duplicate, partner), one line, never wraps. */
  const metaLine = (u: AdminUser, self: boolean) => (
    <span className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      <OnlineDot online={u.online} lastSeenAt={u.lastSeenAt} className="shrink-0" />
      {self && <span className="badge shrink-0 bg-primary/10 py-0 text-[10px] text-link">{t('admin.common.you')}</span>}
      {u.mergedIntoId ? <DuplicateChip userId={u.id} merged className="shrink-0" /> : dupIds.has(u.id) ? <DuplicateChip userId={u.id} className="shrink-0" /> : null}
      {/* Partner-owned client: badge opens the owner / history dialog (changing it is ADMIN+). */}
      {u.ownerPartner && (
        <button
          type="button"
          className="badge min-w-0 bg-accent-bg py-0 text-[10px] text-accent-fg hover:underline"
          title={t('partnerClients.admin.badge', { name: u.ownerPartner.name })}
          onClick={() => setOwnerFor(u)}
        >
          <Handshake className="size-3 shrink-0" aria-hidden /> <span className="truncate">{t('partnerClients.admin.badge', { name: u.ownerPartner.name })}</span>
        </button>
      )}
    </span>
  );
  const nameNode = (u: AdminUser) =>
    u.role === 'CLIENT' ? (
      <Link to={`/admin/clients/${u.id}`} className="hover:text-link hover:underline">
        {fullName(u)}
      </Link>
    ) : (
      fullName(u)
    );
  /** The super admin account itself and the viewer's own row are never editable. */
  const editable = (u: AdminUser) => canManage && u.id !== me?.id && u.role !== 'SUPER_ADMIN';

  const subtitle = data
    ? [t('admin.users.usersCount', { count: total }), t('admin.users.onlineCount', { count: onlineCount })].join(' · ')
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
        <label className="shrink-0">
          <span className="sr-only">{t('partnerClients.admin.filter')}</span>
          <select className="input h-10 min-w-40" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}>
            <option value="">{t('partnerClients.admin.filterAll')}</option>
            <option value="any">{t('partnerClients.admin.filterAny')}</option>
            <option value="none">{t('partnerClients.admin.filterNone')}</option>
            {(partnerOptions.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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
            <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[12%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead className="border-b border-line bg-surface/70 text-xs font-medium whitespace-nowrap text-muted">
                <tr>
                  <th className="px-4 py-2.5">{t('admin.users.th.user')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.contact')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.role')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.status')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.activity')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.counts')}</th>
                  <th className="px-4 py-2.5">{t('admin.users.th.registered')}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const self = u.id === me?.id;
                  const can = editable(u);
                  return (
                    <tr key={u.id} className={clsx('align-middle', !u.isActive && 'bg-sunken text-muted')}>
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={fullName(u)} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-ink" title={fullName(u)}>
                              {nameNode(u)}
                            </p>
                            {metaLine(u, self)}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <a href={`mailto:${u.email}`} className="flex min-h-6 items-center gap-1 text-ink/80 hover:text-link" title={u.email}>
                          <Mail className="size-3 shrink-0" aria-hidden /> <span className="truncate">{u.email}</span>
                        </a>
                        <EmailVerifiedBadge u={u} />
                        {u.phone ? (
                          <span className="flex min-h-6 items-center gap-1.5 text-muted">
                            <a href={`tel:${u.phone}`} className="flex min-w-0 items-center gap-1 tabular-nums hover:text-link">
                              <Phone className="size-3 shrink-0" aria-hidden /> <span className="truncate">{u.phone}</span>
                            </a>
                            <CallButton target={{ clientId: u.id }} phone={u.phone} name={fullName(u)} compact className="size-6 min-h-0 shrink-0 justify-center px-0 py-0" />
                          </span>
                        ) : (
                          <span className="flex min-h-6 items-center text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <RoleCell u={u} editable={can} showSettings={isAdmin && u.role !== 'CLIENT' && u.isActive} onOpen={setPermsFor} />
                      </td>
                      <td className="px-4 py-2.5">
                        <ActiveControl u={u} editable={can} />
                      </td>
                      <td className="px-4 py-2.5">
                        <ActivityCell u={u} />
                      </td>
                      <td className="px-4 py-2.5">
                        <CountsCell u={u} />
                      </td>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap text-muted tabular-nums">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <RowTools u={u} showMenu={canManage && can} onReset={() => setResetFor(u)} onRevoke={() => setRevokeFor(u)} onDelete={() => setDeleteFor(u)} onMailbox={() => setMailboxFor(u)} />
                      </td>
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
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={fullName(u)} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink" title={fullName(u)}>
                          {nameNode(u)}
                        </p>
                        {metaLine(u, self)}
                      </div>
                    </div>
                    <RowTools u={u} showMenu={canManage && can} onReset={() => setResetFor(u)} onRevoke={() => setRevokeFor(u)} onDelete={() => setDeleteFor(u)} onMailbox={() => setMailboxFor(u)} />
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-muted">
                    <a href={`mailto:${u.email}`} className="flex min-h-6 items-center gap-1 text-ink/80 hover:text-link" title={u.email}>
                      <Mail className="size-3 shrink-0" aria-hidden /> <span className="truncate">{u.email}</span>
                    </a>
                    <EmailVerifiedBadge u={u} />
                    {u.phone && (
                      <span className="flex min-h-6 items-center gap-1.5">
                        <a href={`tel:${u.phone}`} className="flex min-w-0 items-center gap-1 tabular-nums hover:text-link">
                          <Phone className="size-3 shrink-0" aria-hidden /> <span className="truncate">{u.phone}</span>
                        </a>
                        <CallButton target={{ clientId: u.id }} phone={u.phone} name={fullName(u)} compact className="size-6 min-h-0 shrink-0 justify-center px-0 py-0" />
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <RoleCell u={u} editable={can} showSettings={isAdmin && u.role !== 'CLIENT' && u.isActive} onOpen={setPermsFor} />
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3">
                    <ActivityCell u={u} />
                    <CountsCell u={u} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <ActiveControl u={u} editable={can} />
                    <span className="text-[11px] text-muted tabular-nums">{t('admin.users.registeredAt', { date: fmtDate(u.createdAt) })}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={data?.page ?? page} pages={Math.max(1, Math.ceil(total / USERS_PAGE))} total={total} pageSize={USERS_PAGE} onChange={setPage} />
        </>
      )}

      {canManage && <CreateUserModal open={creating} onClose={() => setCreating(false)} />}
      {isAdmin && <StaffPermissionsPanel user={permsFor} onClose={() => setPermsFor(null)} roleEditor={permsFor && <RoleControl u={permsFor} editable={editable(permsFor)} />} canEditDeskProfile={isAdmin} />}
      {canManage && <StaffMailboxDialog user={mailboxFor} onClose={() => setMailboxFor(null)} />}
      {canManage && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
      {canManage && <RevokeSessionsDialog user={revokeFor} onClose={() => setRevokeFor(null)} />}
      {canManage && <DeleteUserDialog user={deleteFor} onClose={() => setDeleteFor(null)} />}
      <ClientOwnerDialog userId={ownerFor?.id ?? null} name={ownerFor ? fullName(ownerFor) : ''} isAdmin={hasMinRole(me?.role, 'ADMIN')} onClose={() => setOwnerFor(null)} />
    </div>
  );
}
