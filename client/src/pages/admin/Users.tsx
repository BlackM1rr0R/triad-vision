import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { toast } from 'sonner';
import { KeyRound, Mail, Phone, Search, UserPlus, Users as UsersIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/admin/Modal';
import { ROLE_LABEL, ROLE_TONE, fmtDate, fullName, toastError } from '@/components/admin/labels';
import type { AdminUser } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';

const ROLES: Role[] = ['CLIENT', 'STAFF', 'ADMIN'];
const isRole = (v: string | null): v is Role => !!v && (ROLES as string[]).includes(v);

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
      toast.success('Yeni istifadəçi yaradıldı.');
      setF(empty);
      onClose();
    },
    onError: (err) => toastError(err),
  });
  const valid = /\S+@\S+\.\S+/.test(f.email) && f.password.length >= 8 && f.firstName.trim() && f.lastName.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Yeni əməkdaş"
      description="Əməkdaş bu e-poçt və parolla admin panelə daxil olacaq."
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            İmtina et
          </button>
          <button type="submit" form="create-user" className="btn-primary btn-sm" disabled={!valid || m.isPending}>
            {m.isPending && <Spinner className="size-3.5" />} Yarat
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
            Ad
          </label>
          <input id="cu-first" className="input" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-last">
            Soyad
          </label>
          <input id="cu-last" className="input" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cu-email">
            E-poçt
          </label>
          <input id="cu-email" type="email" className="input" required autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-phone">
            Telefon (istəyə bağlı)
          </label>
          <input id="cu-phone" type="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="cu-role">
            Rol
          </label>
          <select id="cu-role" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'STAFF' | 'ADMIN' })}>
            <option value="STAFF">{ROLE_LABEL.STAFF}</option>
            <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="cu-pass">
            Parol
          </label>
          <input
            id="cu-pass"
            type="password"
            className="input"
            required
            minLength={8}
            autoComplete="new-password"
            value={f.password}
            onChange={(e) => setF({ ...f, password: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-muted">Ən azı 8 simvol.</p>
        </div>
      </form>
    </Modal>
  );
};

const ResetPasswordModal = ({ user, onClose }: { user: AdminUser | null; onClose: () => void }) => {
  const [password, setPassword] = useState('');
  const patch = useUserPatch();
  useEffect(() => setPassword(''), [user]);
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title="Parolu sıfırla"
      description={user ? `${fullName(user)} (${user.email}) üçün yeni parol təyin edin.` : undefined}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            İmtina et
          </button>
          <button type="submit" form="reset-pass" className="btn-primary btn-sm" disabled={password.length < 8 || patch.isPending}>
            {patch.isPending && <Spinner className="size-3.5" />} Yadda saxla
          </button>
        </>
      }
    >
      <form
        id="reset-pass"
        onSubmit={(e) => {
          e.preventDefault();
          if (!user || password.length < 8) return;
          patch.mutate(
            { id: user.id, patch: { password } },
            {
              onSuccess: () => {
                toast.success('Parol yeniləndi.');
                onClose();
              },
            },
          );
        }}
      >
        <label className="label" htmlFor="rp-pass">
          Yeni parol
        </label>
        <input
          id="rp-pass"
          type="password"
          className="input"
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-muted">Ən azı 8 simvol. Yeni parolu istifadəçiyə təhlükəsiz kanalla çatdırın.</p>
      </form>
    </Modal>
  );
};

const RoleControl = ({ u, editable }: { u: AdminUser; editable: boolean }) => {
  const patch = useUserPatch();
  if (!editable) return <span className={clsx('badge', ROLE_TONE[u.role])}>{ROLE_LABEL[u.role]}</span>;
  return (
    <select
      aria-label={`${fullName(u)} — rol`}
      className={clsx('min-h-8 shrink-0 cursor-pointer rounded-md border-0 py-1 pr-7 pl-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-brand-500/30', ROLE_TONE[u.role])}
      value={u.role}
      disabled={patch.isPending}
      onChange={(e) =>
        patch.mutate(
          { id: u.id, patch: { role: e.target.value as Role } },
          { onSuccess: (nu) => toast.success(`${fullName(nu)}: ${ROLE_LABEL[nu.role]}`) },
        )
      }
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
};

const ActiveControl = ({ u, editable }: { u: AdminUser; editable: boolean }) => {
  const patch = useUserPatch();
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        checked={u.isActive}
        disabled={!editable || patch.isPending}
        label={u.isActive ? 'Aktivdir — deaktiv et' : 'Deaktivdir — aktiv et'}
        onChange={(isActive) =>
          patch.mutate({ id: u.id, patch: { isActive } }, { onSuccess: (nu) => toast.success(nu.isActive ? 'Hesab aktivləşdirildi.' : 'Hesab deaktiv edildi.') })
        }
      />
      <span className={clsx('text-xs', u.isActive ? 'text-success' : 'text-muted')}>{u.isActive ? 'Aktiv' : 'Deaktiv'}</span>
    </span>
  );
};

export default function Users() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'ADMIN';
  const [params, setParams] = useSearchParams();
  const roleParam = params.get('role');
  const role = isRole(roleParam) ? roleParam : null;
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [search, setSearch] = useState(searchInput);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

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

  const users = data ?? [];

  return (
    <div>
      <PageHead
        title="İstifadəçilər"
        subtitle={data ? `${users.length} istifadəçi${users.length >= 200 ? ' (ilk 200)' : ''}` : undefined}
        actions={
          <>
            {isFetching && !isLoading && <Spinner className="size-4 text-brand-600" />}
            {isAdmin && (
              <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
                <UserPlus className="size-3.5" /> Yeni əməkdaş
              </button>
            )}
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Axtarış</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input type="search" className="input pl-9" placeholder="Ad, soyad və ya e-poçt…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0">
          <Chip active={!role} onClick={() => setRole(null)}>
            Hamısı
          </Chip>
          {ROLES.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(role === r ? null : r)}>
              {ROLE_LABEL[r]}
            </Chip>
          ))}
        </div>
      </div>

      {!isAdmin && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
          İstifadəçiləri yalnız administratorlar redaktə edə bilər. Siz siyahını görə bilərsiniz.
        </p>
      )}

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={UsersIcon} title="İstifadəçi tapılmadı" />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-white xl:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-surface/70 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted uppercase">
                <tr>
                  <th className="px-4 py-2.5">İstifadəçi</th>
                  <th className="px-4 py-2.5">Əlaqə</th>
                  <th className="px-4 py-2.5">Rol</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Müraciət</th>
                  <th className="px-4 py-2.5">Qeydiyyat</th>
                  {isAdmin && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map((u) => {
                  const self = u.id === me?.id;
                  return (
                    <tr key={u.id} className={clsx(!u.isActive && 'bg-slate-50 text-ink/60')}>
                      <td className="px-4 py-3">
                        <p className="font-semibold whitespace-nowrap text-navy-900">
                          {fullName(u)} {self && <span className="badge ml-1 bg-brand-100 text-[10px] text-brand-700">Siz</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <a href={`mailto:${u.email}`} className="flex items-center gap-1 whitespace-nowrap text-ink/80 hover:text-brand-700">
                          <Mail className="size-3" /> {u.email}
                        </a>
                        {u.phone && (
                          <a href={`tel:${u.phone}`} className="mt-0.5 flex items-center gap-1 text-muted hover:text-brand-700">
                            <Phone className="size-3" /> {u.phone}
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RoleControl u={u} editable={isAdmin && !self} />
                      </td>
                      <td className="px-4 py-3">
                        <ActiveControl u={u} editable={isAdmin && !self} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{u._count.cases}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-brand-600 hover:bg-brand-50"
                            onClick={() => setResetFor(u)}
                          >
                            <KeyRound className="size-3.5" /> Parol
                          </button>
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
              return (
                <li key={u.id} className={clsx('rounded-xl border border-line bg-white p-4', !u.isActive && 'opacity-70')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-navy-900">
                        {fullName(u)} {self && <span className="badge ml-1 bg-brand-100 text-[10px] text-brand-700">Siz</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                      {u.phone && <p className="text-xs text-muted">{u.phone}</p>}
                    </div>
                    <RoleControl u={u} editable={isAdmin && !self} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
                    <ActiveControl u={u} editable={isAdmin && !self} />
                    <span className="text-[11px] text-muted">{u._count.cases} müraciət</span>
                    {isAdmin && (
                      <button type="button" className="-my-2 -mr-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand-600 hover:bg-brand-50" onClick={() => setResetFor(u)}>
                        <KeyRound className="size-3.5" /> Parol
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {isAdmin && <CreateUserModal open={creating} onClose={() => setCreating(false)} />}
      {isAdmin && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}
