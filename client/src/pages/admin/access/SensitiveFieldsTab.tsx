import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Eye, EyeOff, FlaskConical, ShieldHalf, Trash2, UserPlus, Users } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesPrivacyTools } from '@/i18n/pagesPrivacyTools';
import { pagesAccessSensitive } from '@/i18n/pagesAccessSensitive';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { RevealLog } from '@/pages/admin/SensitiveAccess';

registerCopy(pagesPrivacyTools);
registerCopy(pagesAccessSensitive);

/**
 * Access Center › Sensitive fields (SUPER_ADMIN, or an ADMIN with "manage access"): per mask group and role /
 * staff template / single user: visible, masked ("••••", reveal with a reason) or hidden. Plus "test as user" and
 * the reveal log. Server: /api/admin/access/sensitive (routes/admin/accessSensitive.ts), lib/privacy/mask.ts.
 * Nothing set = today's behaviour (the new groups are visible for everybody until switched on here).
 */

type Mode = 'VISIBLE' | 'MASKED' | 'HIDDEN';
type Role = 'STAFF' | 'ADMIN';
type ModeMap = Partial<Record<string, Mode>>;
type Source = 'user' | 'template' | 'role' | 'default';
type L10nName = { az: string; de: string; en: string; ru: string };

interface Overview {
  groups: string[];
  newGroups: string[];
  modes: Mode[];
  roles: Role[];
  defaults: Record<Role, Record<string, Mode>>;
  role: Record<Role, Record<string, Mode>>;
  templates: { id: string; key: string | null; name: L10nName | string | null; modes: ModeMap; missing?: boolean }[];
  users: { id: string; name: string; email: string; role: string; modes: ModeMap }[];
}

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Preview {
  user: StaffUser;
  templateId: string | null;
  modes: Record<string, { mode: Mode; source: Source }>;
  sample: { plain: unknown; shown: unknown };
}

const KEY = ['admin-access-sensitive'];
const MODE_TONE: Record<Mode, string> = {
  VISIBLE: 'text-ink',
  MASKED: 'text-warning-fg',
  HIDDEN: 'text-danger-fg',
};

const ModeSelect = ({ value, onChange, inherit, label, disabled }: { value: Mode | ''; onChange: (m: Mode | null) => void; inherit?: boolean; label: string; disabled?: boolean }) => {
  const { t } = useTranslation();
  return (
    <select
      className={clsx('input py-1.5 text-sm', value && MODE_TONE[value])}
      value={value}
      aria-label={label}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value ? (e.target.value as Mode) : null)}
    >
      {inherit && <option value="">{t('accessSensitive.modes.INHERIT')}</option>}
      {(['VISIBLE', 'MASKED', 'HIDDEN'] as const).map((m) => (
        <option key={m} value={m}>
          {t(`accessSensitive.modes.${m}`)}
        </option>
      ))}
    </select>
  );
};

const useSave = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (path: 'role' | 'template' | 'user', body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await api.put(`/admin/access/sensitive/${path}`, body);
      await qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: [...KEY, 'preview'] });
      toast.success(t('accessSensitive.saved'));
    } catch (err) {
      const code = errorCode(err);
      toast.error(t(`accessSensitive.errors.${code}`, { defaultValue: t('accessSensitive.errors.generic') }));
    } finally {
      setBusy(false);
    }
  };
  return { save, busy };
};

const GroupLabel = ({ g, isNew }: { g: string; isNew: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className="font-medium text-ink">
      {t(`privacyTools.access.groups.${g}`, { defaultValue: g })}
      {isNew && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-link uppercase">{t('accessSensitive.newBadge')}</span>}
    </span>
  );
};

const RoleMatrix = ({ data }: { data: Overview }) => {
  const { t } = useTranslation();
  const { save, busy } = useSave();
  return (
    <Panel title={t('accessSensitive.matrixTitle')} icon={ShieldHalf}>
      <ul className="mb-4 space-y-1 text-xs text-muted">
        {(['VISIBLE', 'MASKED', 'HIDDEN'] as const).map((m) => (
          <li key={m}>
            <span className={clsx('font-semibold', MODE_TONE[m])}>{t(`accessSensitive.modes.${m}`)}</span> — {t(`accessSensitive.modeHint.${m}`)}
          </li>
        ))}
        <li>{t('accessSensitive.superAdminNote')}</li>
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-2 pr-3 font-semibold">{t('accessSensitive.groupCol')}</th>
              {data.roles.map((r) => (
                <th key={r} className="px-2 py-2 font-semibold">
                  {t(`accessSensitive.roles.${r}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.groups.map((g) => (
              <tr key={g}>
                <td className="py-2.5 pr-3">
                  <GroupLabel g={g} isNew={data.newGroups.includes(g)} />
                </td>
                {data.roles.map((r) => (
                  <td key={r} className="px-2 py-2 align-top">
                    <ModeSelect
                      value={data.role[r][g]}
                      disabled={busy}
                      label={`${t(`accessSensitive.roles.${r}`)} · ${t(`privacyTools.access.groups.${g}`, { defaultValue: g })}`}
                      onChange={(mode) => mode && void save('role', { role: r, group: g, mode })}
                    />
                    {data.role[r][g] !== data.defaults[r][g] && (
                      <p className="mt-0.5 text-[11px] text-muted">{t('accessSensitive.defaultLabel', { mode: t(`accessSensitive.modes.${data.defaults[r][g]}`) })}</p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

/** One row of overrides (template or user): a select per group, "" = inherit. */
const OverrideGrid = ({ groups, newGroups, modes, onChange, busy, label }: { groups: string[]; newGroups: string[]; modes: ModeMap; onChange: (g: string, m: Mode | null) => void; busy: boolean; label: string }) => {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <label key={g} className="block min-w-0 text-xs">
          <span className="mb-0.5 block">
            <GroupLabel g={g} isNew={newGroups.includes(g)} />
          </span>
          <ModeSelect inherit value={modes[g] ?? ''} disabled={busy} label={`${label} · ${t(`privacyTools.access.groups.${g}`, { defaultValue: g })}`} onChange={(m) => onChange(g, m)} />
        </label>
      ))}
    </div>
  );
};

const TemplatePolicies = ({ data }: { data: Overview }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { save, busy } = useSave();
  const nameOf = (n: Overview['templates'][number]) => (n.missing ? t('accessSensitive.templateMissing') : typeof n.name === 'string' ? n.name : n.name ? tr(n.name) : (n.key ?? n.id));
  return (
    <Panel title={t('accessSensitive.templatesTitle')} icon={Users}>
      <p className="mb-4 text-sm text-muted">{t('accessSensitive.templatesIntro')}</p>
      {!data.templates.length ? (
        <p className="text-sm text-muted">{t('accessSensitive.templatesEmpty')}</p>
      ) : (
        <ul className="space-y-4">
          {data.templates.map((tpl) => (
            <li key={tpl.id} className="rounded-xl border border-line p-3">
              <p className="mb-2 font-semibold text-ink">{nameOf(tpl)}</p>
              <OverrideGrid
                groups={data.groups}
                newGroups={data.newGroups}
                modes={tpl.modes}
                busy={busy}
                label={nameOf(tpl)}
                onChange={(g, mode) => void save('template', { templateId: tpl.id, group: g, mode })}
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** Staff search (STAFF / ADMIN) for overrides and the preview. */
const UserPicker = ({ onPick, label }: { onPick: (u: StaffUser) => void; label: string }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  const { data, isFetching } = useQuery({
    queryKey: [...KEY, 'users', q],
    queryFn: async () => (await api.get<{ items: StaffUser[] }>('/admin/access/sensitive/users', { params: q ? { q } : {} })).data.items,
    enabled: q.length > 0,
  });
  return (
    <div className="relative">
      <input type="search" className="input" value={input} placeholder={t('accessSensitive.searchUser')} aria-label={label} onChange={(e) => setInput(e.target.value)} />
      {q && (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-card text-sm shadow-sm">
          {!data?.length ? (
            <li className="px-3 py-2 text-muted">{isFetching ? '…' : t('accessSensitive.noUsers')}</li>
          ) : (
            data.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left hover:bg-sunken"
                  onClick={() => {
                    onPick(u);
                    setInput('');
                  }}
                >
                  <span className="font-medium text-ink">{u.name}</span>
                  <span className="text-xs text-muted">
                    {u.email} · {u.role}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

const UserOverrides = ({ data }: { data: Overview }) => {
  const { t } = useTranslation();
  const { save, busy } = useSave();
  const [extra, setExtra] = useState<StaffUser[]>([]);
  const users = useMemo(() => [...data.users, ...extra.filter((u) => !data.users.some((x) => x.id === u.id)).map((u) => ({ ...u, modes: {} as ModeMap }))], [data.users, extra]);
  const removeAll = async (u: (typeof users)[number]) => {
    for (const g of Object.keys(u.modes)) await save('user', { userId: u.id, group: g, mode: null });
    setExtra((x) => x.filter((y) => y.id !== u.id));
  };
  return (
    <Panel title={t('accessSensitive.usersTitle')} icon={UserPlus}>
      <p className="mb-3 text-sm text-muted">{t('accessSensitive.usersIntro')}</p>
      <div className="mb-4 max-w-md">
        <UserPicker label={t('accessSensitive.addUser')} onPick={(u) => setExtra((x) => (x.some((y) => y.id === u.id) ? x : [...x, u]))} />
      </div>
      {!users.length ? (
        <p className="text-sm text-muted">{t('accessSensitive.usersEmpty')}</p>
      ) : (
        <ul className="space-y-4">
          {users.map((u) => (
            <li key={u.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <p>
                  <span className="font-semibold text-ink">{u.name}</span> <span className="text-xs text-muted">{u.email} · {u.role}</span>
                </p>
                <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void removeAll(u)}>
                  <Trash2 className="size-3.5" aria-hidden /> {t('accessSensitive.removeUser')}
                </button>
              </div>
              <OverrideGrid groups={data.groups} newGroups={data.newGroups} modes={u.modes} busy={busy} label={u.name} onChange={(g, mode) => void save('user', { userId: u.id, group: g, mode })} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** Flattens the sample record to "path → value" rows. */
const flatten = (v: unknown, path = '', out: [string, unknown][] = []): [string, unknown][] => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) flatten(x, path ? `${path}.${k}` : k, out);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
  } else out.push([path, v]);
  return out;
};
const pick = (v: unknown, path: string): unknown => flatten(v).find(([p]) => p === path)?.[1];

const PreviewPanel = ({ data }: { data: Overview }) => {
  const { t } = useTranslation();
  const [user, setUser] = useState<StaffUser | null>(null);
  const preview = useQuery({
    queryKey: [...KEY, 'preview', user?.id],
    queryFn: async () => (await api.get<Preview>('/admin/access/sensitive/preview', { params: { userId: user!.id } })).data,
    enabled: !!user,
  });
  const rows = preview.data ? flatten(preview.data.sample.plain).filter(([p]) => !/\.(relation|mainCaseId|residenceTitleKind|employerName|name)$/.test(p)) : [];
  return (
    <Panel title={t('accessSensitive.previewTitle')} icon={FlaskConical}>
      <p className="mb-3 text-sm text-muted">{t('accessSensitive.previewIntro')}</p>
      <div className="mb-4 max-w-md">
        <UserPicker label={t('accessSensitive.pickUser')} onPick={setUser} />
      </div>
      {!user ? null : preview.error ? (
        <ErrorBlock error={preview.error} onRetry={() => void preview.refetch()} />
      ) : !preview.data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-semibold text-ink">{preview.data.user.name}</span> <span className="text-xs text-muted">{preview.data.user.email} · {preview.data.user.role}</span>
          </p>
          {preview.data.user.role === 'SUPER_ADMIN' && <p className="text-sm text-muted">{t('accessSensitive.superAdminNote')}</p>}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.groups.map((g) => {
              const m = preview.data.modes[g];
              return (
                <li key={g} className="rounded-lg border border-line px-3 py-2 text-sm">
                  <GroupLabel g={g} isNew={data.newGroups.includes(g)} />
                  <p className={clsx('mt-0.5 flex items-center gap-1.5 text-xs font-semibold', MODE_TONE[m.mode])}>
                    {m.mode === 'VISIBLE' ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
                    {t(`accessSensitive.modes.${m.mode}`)} <span className="font-normal text-muted">· {t(`accessSensitive.source.${m.source}`)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-semibold">{t('accessSensitive.sampleField')}</th>
                  <th className="px-3 py-2 font-semibold">{t('accessSensitive.samplePlain')}</th>
                  <th className="py-2 pl-3 font-semibold">{t('accessSensitive.sampleShown')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(([path, plain]) => {
                  const shown = pick(preview.data.sample.shown, path);
                  const changed = shown !== plain;
                  return (
                    <tr key={path}>
                      <td className="py-2 pr-3 font-mono text-xs text-muted">{path}</td>
                      <td className="px-3 py-2 text-ink/80">{String(plain ?? '—')}</td>
                      <td className={clsx('py-2 pl-3 font-mono', changed ? 'font-semibold text-warning-fg' : 'text-ink')}>
                        {shown === null || shown === undefined ? t('accessSensitive.hiddenValue') : String(shown)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
};

export default function SensitiveFieldsTab() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<Overview>('/admin/access/sensitive')).data });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">{t('accessSensitive.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessSensitive.intro')}</p>
      </div>
      {error ? (
        <ErrorBlock error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <LoadingBlock />
      ) : !data.groups.length ? (
        <EmptyState icon={ShieldHalf} title={t('accessSensitive.title')} />
      ) : (
        <>
          <RoleMatrix data={data} />
          <TemplatePolicies data={data} />
          <UserOverrides data={data} />
          <PreviewPanel data={data} />
        </>
      )}
      <section aria-label={t('accessSensitive.logTitle')}>
        <p className="mb-2 text-sm text-muted">{t('accessSensitive.logIntro')}</p>
        <RevealLog extended />
      </section>
    </div>
  );
}
