import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, Building2, Check, Crown, Search, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccessEmployers } from '@/i18n/pagesAccessEmployers';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { COMPANY_PERMS, type CompanyPerm, type CompanyRoleName } from '@/components/company/access';

registerCopy(pagesAccessEmployers);

/**
 * Access Center › Employers (SUPER_ADMIN or "manage access"): company list → members → role and per-user permission
 * overrides. Server: routes/admin/accessEmployers.ts (enforcement: lib/companyAccess/guard.ts). Every change is
 * audit-logged as COMPANY_ACCESS_CHANGED with before → after.
 */

type Perms = Record<CompanyPerm, boolean>;
interface Meta {
  permissions: CompanyPerm[];
  roles: Exclude<CompanyRoleName, 'STANDARD'>[];
  templates: Record<Exclude<CompanyRoleName, 'STANDARD'>, Perms>;
}
interface CompanyRow {
  id: string;
  name: string;
  city: string | null;
  status: string;
  members: number;
  withRole: number;
}
interface MemberRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isOwner: boolean;
  role: CompanyRoleName;
  overrides: Partial<Perms>;
  permissions: Perms;
}

const BASE = '/admin/access/employers';

export default function EmployersTab() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const meta = useQuery({ queryKey: ['access-employers-meta'], queryFn: async () => (await api.get<Meta>(`${BASE}/meta`)).data, staleTime: 5 * 60_000 });
  const companies = useQuery({
    queryKey: ['access-employers-companies', search],
    queryFn: async () => (await api.get<{ items: CompanyRow[] }>(`${BASE}/companies`, { params: search ? { q: search } : {} })).data.items,
    enabled: !companyId,
  });

  if (companyId && meta.data) return <CompanyMembers companyId={companyId} meta={meta.data} onBack={() => setCompanyId(null)} />;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="type-section-title text-ink">{t('accessEmployers.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessEmployers.intro')}</p>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label className="sr-only" htmlFor="access-employers-search">
          {t('accessEmployers.search')}
        </label>
        <input id="access-employers-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('accessEmployers.search')} maxLength={100} />
      </div>
      {companies.isLoading || meta.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : companies.isError || meta.isError ? (
        <ErrorState onRetry={() => void companies.refetch()} />
      ) : !companies.data?.length ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t('accessEmployers.empty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-card">
          {companies.data.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCompanyId(c.id)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken focus-visible:bg-sunken">
                <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {[c.city, c.status, t('accessEmployers.members', { count: c.members })].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {c.withRole > 0 && <span className="badge chip-soft shrink-0 text-[11px]">{t('accessEmployers.withRole', { count: c.withRole })}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CompanyMembers = ({ companyId, meta, onBack }: { companyId: string; meta: Meta; onBack: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['access-employers-members', companyId],
    queryFn: async () => (await api.get<{ company: { id: string; name: string }; members: MemberRow[] }>(`${BASE}/companies/${companyId}/members`)).data,
  });
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {t('accessEmployers.back')}
      </button>
      {q.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <>
          <h2 className="type-section-title text-ink">{q.data.company.name}</h2>
          {q.data.members.length === 0 ? (
            <p className="text-sm text-muted">{t('accessEmployers.noMembers')}</p>
          ) : (
            <div className="space-y-4">
              {q.data.members.map((m) => (
                <MemberCard key={m.id} member={m} meta={meta} companyId={companyId} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

type Tri = 'inherit' | 'allow' | 'deny';

const MemberCard = ({ member, meta, companyId }: { member: MemberRow; meta: Meta; companyId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [role, setRole] = useState<CompanyRoleName>(member.role);
  const [overrides, setOverrides] = useState<Partial<Perms>>(member.overrides ?? {});
  useEffect(() => {
    setRole(member.role);
    setOverrides(member.overrides ?? {});
  }, [member.role, member.overrides]);

  // Preview of the result (the server recomputes it; the owner always has everything).
  const effective = useMemo<Perms>(() => {
    if (member.isOwner) return Object.fromEntries(COMPANY_PERMS.map((p) => [p, true])) as Perms;
    if (role === 'STANDARD') return Object.fromEntries(COMPANY_PERMS.map((p) => [p, p !== 'manageTeam'])) as Perms;
    return { ...meta.templates[role], ...overrides };
  }, [member.isOwner, role, overrides, meta.templates]);

  const dirty = role !== member.role || JSON.stringify(overrides) !== JSON.stringify(member.overrides ?? {});
  const save = useMutation({
    mutationFn: async () => (await api.patch(`${BASE}/members/${member.id}`, { role, overrides: role === 'STANDARD' ? null : overrides })).data,
    onSuccess: () => {
      toast.success(t('accessEmployers.saved'));
      void qc.invalidateQueries({ queryKey: ['access-employers-members', companyId] });
      void qc.invalidateQueries({ queryKey: ['access-employers-companies'] });
    },
    onError: (err) => toast.error(`${t('accessEmployers.error')} (${errorCode(err)})`),
  });

  const triOf = (p: CompanyPerm): Tri => (overrides[p] === undefined ? 'inherit' : overrides[p] ? 'allow' : 'deny');
  const setTri = (p: CompanyPerm, v: Tri) =>
    setOverrides((o) => {
      const next = { ...o };
      if (v === 'inherit') delete next[p];
      else next[p] = v === 'allow';
      return next;
    });

  return (
    <section className={clsx('rounded-2xl border border-line bg-card p-4 sm:p-5', !member.isActive && 'opacity-70')} aria-labelledby={`member-${member.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`member-${member.id}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {member.firstName} {member.lastName}
            {member.isOwner && (
              <span className="badge chip-soft text-[11px]">
                <Crown className="size-3" aria-hidden /> {t('accessEmployers.owner')}
              </span>
            )}
            {!member.isActive && <span className="badge bg-sunken text-[11px] text-muted">{t('accessEmployers.inactive')}</span>}
          </p>
          <p className="truncate text-xs text-muted">{member.email}</p>
        </div>
        <div className="w-full sm:w-64">
          <label className="label" htmlFor={`role-${member.id}`}>
            {t('accessEmployers.role')}
          </label>
          <select id={`role-${member.id}`} className="input" value={role} onChange={(e) => setRole(e.target.value as CompanyRoleName)}>
            {(['STANDARD', ...meta.roles] as CompanyRoleName[]).map((r) => (
              <option key={r} value={r}>
                {t(`companyRoles.role.${r}`)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">{t(`companyRoles.roleHint.${role}`)}</p>
        </div>
      </div>
      {member.isOwner && <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-muted">{t('accessEmployers.ownerNote')}</p>}

      <div className="mt-4">
        <p className="text-sm font-semibold text-ink">{t('accessEmployers.overrides')}</p>
        <p className="mb-2 text-xs text-muted">{t('accessEmployers.overridesHint')}</p>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-sunken text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t('accessEmployers.overrides')}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  <span className="sr-only">{t('accessEmployers.overrides')}</span>
                </th>
                <th scope="col" className="px-3 py-2 text-center font-semibold">
                  {t('accessEmployers.effective')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {COMPANY_PERMS.map((p) => (
                <tr key={p}>
                  <th scope="row" className="px-3 py-2 text-left font-normal text-ink">
                    {t(`companyRoles.perm.${p}`)}
                  </th>
                  <td className="px-3 py-2">
                    <div role="radiogroup" aria-label={t(`companyRoles.perm.${p}`)} className="inline-flex rounded-lg border border-line p-0.5">
                      {(['inherit', 'allow', 'deny'] as Tri[]).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={triOf(p) === v}
                          disabled={role === 'STANDARD'}
                          onClick={() => setTri(p, v)}
                          className={clsx(
                            'min-h-8 rounded-md px-2.5 text-xs font-semibold disabled:opacity-50',
                            triOf(p) === v ? (v === 'deny' ? 'bg-danger-bg text-danger-fg' : v === 'allow' ? 'bg-success-bg text-success-fg' : 'bg-sunken text-ink') : 'text-muted hover:text-ink',
                          )}
                        >
                          {t(`accessEmployers.${v}`)}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {effective[p] ? (
                      <Check className="mx-auto size-4 text-success-fg" aria-label={t('accessEmployers.allow')} />
                    ) : (
                      <X className="mx-auto size-4 text-danger-fg" aria-label={t('accessEmployers.deny')} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primary min-h-11" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending && <Spinner className="size-4" />} {t('accessEmployers.save')}
        </button>
      </div>
    </section>
  );
}

export { EmployersTab };
