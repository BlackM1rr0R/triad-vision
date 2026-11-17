import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, Search, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import i18n from '@/i18n';
import { pagesAccessLogin } from '@/i18n/pagesAccessLogin';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesAccessLogin);

/**
 * Access Center › Login security (SUPER_ADMIN, or an ADMIN granted "manage access"): 2FA per role and per user,
 * session idle timeout / maximum age per role and per user, partner logins only with an active contract.
 * Server: routes/admin/accessLoginSecurity.ts, enforcement in middleware/auth.ts + routes/auth.ts (lib/loginSecurity).
 * Staff 2FA stays mandatory whatever is chosen here.
 */

const BASE = '/admin/access/login-security';
type LoginRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'AGENT' | 'COMPANY' | 'CLIENT';
interface Lifetimes {
  webIdleMinutes: number | null;
  webMaxHours: number | null;
  mobileIdleDays: number | null;
  mobileMaxDays: number | null;
}
interface RoleRow extends Lifetimes {
  role: LoginRole;
  require2fa: boolean | null;
  requireActiveContract: boolean;
  twoFactorLocked: boolean;
  contractAvailable: boolean;
  users: number;
  withTotp: number;
  withEmailCode: number;
}
interface UserRow extends Lifetimes {
  userId: string;
  require2fa: boolean | null;
  note: string | null;
  user: { email: string; name: string; role: LoginRole; isActive: boolean; twoFactor: boolean } | null;
}
interface Overview {
  defaults: { webIdleMinutes: number; webMaxHours: number; mobileIdleDays: number; mobileMaxDays: number };
  limits: Record<keyof Lifetimes, { min: number; max: number }>;
  roles: RoleRow[];
  users: UserRow[];
}

const LIFETIME_KEYS: { key: keyof Lifetimes; label: string }[] = [
  { key: 'webIdleMinutes', label: 'webIdle' },
  { key: 'webMaxHours', label: 'webMax' },
  { key: 'mobileIdleDays', label: 'mobileIdle' },
  { key: 'mobileMaxDays', label: 'mobileMax' },
];

const STAFF: LoginRole[] = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];

const errorText = (err: unknown) => {
  const code = errorCode(err);
  return code && i18n.exists(`accessLogin.errors.${code}`) ? i18n.t(`accessLogin.errors.${code}`) : i18n.t('accessLogin.errors.generic');
};

const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

function LifetimeInputs({ value, onChange, defaults, limits, idPrefix }: { value: Lifetimes; onChange: (v: Lifetimes) => void; defaults: Overview['defaults']; limits: Overview['limits']; idPrefix: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {LIFETIME_KEYS.map(({ key, label }) => (
        <label key={key} className="block" htmlFor={`${idPrefix}-${key}`}>
          <span className="label">{t(`accessLogin.${label}`)}</span>
          <input
            id={`${idPrefix}-${key}`}
            className="input"
            type="number"
            inputMode="numeric"
            min={limits[key].min}
            max={limits[key].max}
            value={value[key] ?? ''}
            placeholder={String(defaults[key])}
            onChange={(e) => onChange({ ...value, [key]: numOrNull(e.target.value) })}
          />
          <span className="mt-1 block text-xs text-muted">{t('accessLogin.defaultValue', { value: defaults[key] })}</span>
        </label>
      ))}
    </div>
  );
}

const twoFaValue = (v: boolean | null) => (v === null ? 'default' : v ? 'on' : 'off');
const twoFaFrom = (s: string): boolean | null => (s === 'default' ? null : s === 'on');

function RoleCard({ row, data }: { row: RoleRow; data: Overview }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put(`${BASE}/roles/${row.role}`, {
          ...(row.twoFactorLocked ? {} : { require2fa: draft.require2fa }),
          webIdleMinutes: draft.webIdleMinutes,
          webMaxHours: draft.webMaxHours,
          mobileIdleDays: draft.mobileIdleDays,
          mobileMaxDays: draft.mobileMaxDays,
          ...(row.contractAvailable ? { requireActiveContract: draft.requireActiveContract } : {}),
        })
      ).data,
    onSuccess: async () => {
      toast.success(t('accessLogin.saved'));
      await qc.invalidateQueries({ queryKey: ['access-login-security'] });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <li className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{t(`accessLogin.role.${row.role}`)}</h3>
        <p className="text-xs text-muted">{t('accessLogin.stats', { users: row.users, totp: row.withTotp, email: row.withEmailCode })}</p>
      </div>
      <div className="mt-3">
        <p className="label flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-muted" aria-hidden /> {t('accessLogin.twoFactor')}
        </p>
        {row.twoFactorLocked ? (
          <p className="flex items-center gap-1.5 text-sm text-ink">
            <Lock className="size-3.5 text-muted" aria-hidden /> {t('accessLogin.twoFactorLocked')}
          </p>
        ) : (
          <>
            <select className="input max-w-xs" value={twoFaValue(draft.require2fa)} onChange={(e) => setDraft({ ...draft, require2fa: twoFaFrom(e.target.value) })} aria-label={t('accessLogin.twoFactor')}>
              <option value="default">{t('accessLogin.twoFactorOptions.default')}</option>
              <option value="on">{t('accessLogin.twoFactorOptions.on')}</option>
            </select>
            <p className="mt-1 text-xs text-muted">{t('accessLogin.twoFactorHint')}</p>
          </>
        )}
      </div>
      <div className="mt-4">
        <p className="label">{t('accessLogin.session')}</p>
        <LifetimeInputs idPrefix={`role-${row.role}`} value={draft} onChange={(v) => setDraft({ ...draft, ...v })} defaults={data.defaults} limits={data.limits} />
      </div>
      {row.contractAvailable && (
        <label className="mt-4 flex items-start gap-2.5">
          <input type="checkbox" className="mt-1 size-4" checked={draft.requireActiveContract} onChange={(e) => setDraft({ ...draft, requireActiveContract: e.target.checked })} />
          <span>
            <span className="block text-sm font-semibold text-ink">{t('accessLogin.contract')}</span>
            <span className="block text-xs text-muted">{t('accessLogin.contractHint')}</span>
          </span>
        </label>
      )}
      <button type="button" className="btn-primary mt-4" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Spinner className="size-4" />} {t('accessLogin.save')}
      </button>
    </li>
  );
}

function UserOverride({ row, data }: { row: UserRow; data: Overview }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);
  const staff = !!row.user && STAFF.includes(row.user.role);
  const refresh = () => qc.invalidateQueries({ queryKey: ['access-login-security'] });
  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put(`${BASE}/users/${row.userId}`, {
          ...(staff ? {} : { require2fa: draft.require2fa }),
          webIdleMinutes: draft.webIdleMinutes,
          webMaxHours: draft.webMaxHours,
          mobileIdleDays: draft.mobileIdleDays,
          mobileMaxDays: draft.mobileMaxDays,
          note: draft.note,
        })
      ).data,
    onSuccess: async () => {
      toast.success(t('accessLogin.saved'));
      await refresh();
    },
    onError: (err) => toast.error(errorText(err)),
  });
  const remove = useMutation({
    mutationFn: async () => (await api.delete(`${BASE}/users/${row.userId}`)).data,
    onSuccess: refresh,
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0">
          <span className="block font-semibold text-ink">{row.user?.name ?? row.userId}</span>
          <span className="block text-xs text-muted">
            {row.user?.email} · {row.user ? t(`accessLogin.role.${row.user.role}`) : ''}
          </span>
        </p>
        <button type="button" className="btn-ghost btn-sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
          <Trash2 className="size-3.5" aria-hidden /> {t('accessLogin.remove')}
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t('accessLogin.twoFactor')}</span>
          {staff ? (
            <span className="flex items-center gap-1.5 text-sm text-ink">
              <Lock className="size-3.5 text-muted" aria-hidden /> {t('accessLogin.twoFactorLocked')}
            </span>
          ) : (
            <select className="input" value={twoFaValue(draft.require2fa)} onChange={(e) => setDraft({ ...draft, require2fa: twoFaFrom(e.target.value) })}>
              <option value="default">{t('accessLogin.inherit')}</option>
              <option value="on">{t('accessLogin.twoFactorOptions.on')}</option>
              <option value="off">{t('accessLogin.twoFactorOptions.off')}</option>
            </select>
          )}
        </label>
        <label className="block">
          <span className="label">{t('accessLogin.note')}</span>
          <input className="input" maxLength={300} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value || null })} />
        </label>
      </div>
      <div className="mt-3">
        <LifetimeInputs idPrefix={`user-${row.userId}`} value={draft} onChange={(v) => setDraft({ ...draft, ...v })} defaults={data.defaults} limits={data.limits} />
      </div>
      <button type="button" className="btn-secondary btn-sm mt-3" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Spinner className="size-3.5" />} {t('accessLogin.save')}
      </button>
    </li>
  );
}

function AddOverride({ existing }: { existing: Set<string> }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const found = useQuery({
    queryKey: ['access-login-users', search],
    queryFn: async () => (await api.get<{ items: { id: string; email: string; firstName: string; lastName: string; role: LoginRole }[] }>(`${BASE}/users`, { params: { q: search } })).data.items,
    enabled: search.length >= 2,
  });
  const add = useMutation({
    mutationFn: async (id: string) => (await api.put(`${BASE}/users/${id}`, {})).data,
    onSuccess: async () => {
      setQ('');
      await qc.invalidateQueries({ queryKey: ['access-login-security'] });
    },
    onError: (err) => toast.error(errorText(err)),
  });
  return (
    <div className="space-y-2">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label className="sr-only" htmlFor="login-sec-user">
          {t('accessLogin.findUser')}
        </label>
        <input id="login-sec-user" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('accessLogin.findUser')} maxLength={100} />
      </div>
      {!!found.data?.length && (
        <ul className="max-w-md divide-y divide-line rounded-xl border border-line bg-card">
          {found.data
            .filter((u) => !existing.has(u.id))
            .map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium text-ink">
                    {u.firstName} {u.lastName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {u.email} · {t(`accessLogin.role.${u.role}`)}
                  </span>
                </span>
                <button type="button" className="btn-secondary btn-sm" disabled={add.isPending} onClick={() => add.mutate(u.id)}>
                  <UserPlus className="size-3.5" aria-hidden /> {t('accessLogin.add')}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default function LoginSecurityTab() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['access-login-security'], queryFn: async () => (await api.get<Overview>(BASE)).data });
  if (q.isLoading) return <Spinner className="size-6" />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const data = q.data;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-section-title text-ink">{t('accessLogin.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessLogin.intro')}</p>
      </div>
      <ul className="space-y-4">
        {data.roles.map((r) => (
          <RoleCard key={r.role} row={r} data={data} />
        ))}
      </ul>
      <section className="space-y-3">
        <div>
          <h3 className="type-section-title text-ink">{t('accessLogin.users')}</h3>
          <p className="text-xs text-muted">{t('accessLogin.usersHint')}</p>
        </div>
        <AddOverride existing={new Set(data.users.map((u) => u.userId))} />
        {data.users.length === 0 ? (
          <p className="text-sm text-muted">{t('accessLogin.noOverrides')}</p>
        ) : (
          <ul className="space-y-3">
            {data.users.map((u) => (
              <UserOverride key={u.userId} row={u} data={data} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
