import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Check, ChevronDown, Eye, Minus, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesAccess } from '@/i18n/pagesAccess';
import { Button, Checkbox, Field, Input, Modal, Spinner, confirmDialog } from '@/components/ui';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesAccess);

/**
 * Access Center › Staff roles: role templates (area × action matrix, built-in ones editable and resettable,
 * custom ones), template per staff member, per-user grant / deny overrides, "manage access" (SUPER_ADMIN gives
 * it to ADMINs) and a "what can this user do" preview. Server: routes/admin/accessStaff.ts, lib/access.
 */

export const AREAS = ['cases', 'clients', 'documents', 'finance', 'employers', 'partners', 'content', 'settings', 'drive', 'reports', 'communications', 'analytics'] as const;
export const ACTIONS = ['view', 'edit', 'delete', 'export'] as const;
export type Area = (typeof AREAS)[number];
export type Action = (typeof ACTIONS)[number];
export type Matrix = Partial<Record<Area, Action[]>>;
type L10n = { az: string; de?: string; en?: string; ru?: string };

interface Template {
  id: string;
  key: string | null;
  name: L10n;
  description: L10n | null;
  matrix: Matrix;
  builtIn: boolean;
  modified: boolean;
  users: number;
}
interface Override {
  area: Area;
  action: Action;
  effect: 'grant' | 'deny';
}
export interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean;
  templateId: string | null;
  legacyKey: string;
  overrides: Override[];
  caseScope: 'ALL' | 'ASSIGNED' | 'TEAM';
  manageAccess: boolean;
  teamIds: string[];
}

const BASE = '/admin/access';
export const staffUsersKey = ['access-staff-users'] as const;
const templatesKey = ['access-staff-templates'] as const;

export const useLocalized = () => {
  const { i18n } = useTranslation();
  const lang = i18n.language.slice(0, 2) as keyof L10n;
  return (v: L10n | null | undefined) => (v ? v[lang] || v.az : '');
};

export const useAccessError = () => {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    const known = t(`accessStaff.errors.${code}`, { defaultValue: '' });
    toast.error(known || `${t('accessStaff.error')} (${code})`);
  };
};

export const fullName = (u: { firstName: string; lastName: string; email: string }) => `${u.firstName} ${u.lastName}`.trim() || u.email;

/** Area × action grid of checkboxes (read-only when onChange is missing). */
export const MatrixGrid = ({ value, onChange, idPrefix }: { value: Matrix; onChange?: (m: Matrix) => void; idPrefix: string }) => {
  const { t } = useTranslation();
  const has = (a: Area, x: Action) => (value[a] ?? []).includes(x);
  const toggle = (a: Area, x: Action) => {
    if (!onChange) return;
    const cur = new Set(value[a] ?? []);
    if (cur.has(x)) cur.delete(x);
    else cur.add(x);
    onChange({ ...value, [a]: ACTIONS.filter((y) => cur.has(y)) });
  };
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[30rem] text-sm">
        <caption className="sr-only">{t('accessStaff.matrix')}</caption>
        <thead className="bg-sunken text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              {t('accessStaff.matrixHint')}
            </th>
            {ACTIONS.map((x) => (
              <th key={x} scope="col" className="px-2 py-2 text-center font-semibold">
                {t(`accessStaff.actions.${x}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {AREAS.map((a) => (
            <tr key={a}>
              <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                {t(`accessStaff.areas.${a}`)}
              </th>
              {ACTIONS.map((x) => (
                <td key={x} className="px-2 py-1.5 text-center">
                  {onChange ? (
                    <input
                      id={`${idPrefix}-${a}-${x}`}
                      type="checkbox"
                      className="size-[1.125rem] cursor-pointer rounded border-line-strong accent-brand-600"
                      checked={has(a, x)}
                      onChange={() => toggle(a, x)}
                      aria-label={`${t(`accessStaff.areas.${a}`)}: ${t(`accessStaff.actions.${x}`)}`}
                    />
                  ) : has(a, x) ? (
                    <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label={t(`accessStaff.actions.${x}`)} />
                  ) : (
                    <Minus className="mx-auto size-4 text-muted" aria-label={t('accessStaff.nothing')} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function StaffRolesTab() {
  return (
    <div className="space-y-8">
      <TemplatesSection />
      <UsersSection />
    </div>
  );
}

// ─── Templates ─────────────────────────────────────────────────────────

const useTemplates = () =>
  useQuery({ queryKey: templatesKey, queryFn: async () => (await api.get<{ templates: Template[] }>(`${BASE}/staff/templates`)).data.templates });

const TemplatesSection = () => {
  const { t } = useTranslation();
  const loc = useLocalized();
  const q = useTemplates();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  return (
    <section aria-labelledby="access-templates-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="access-templates-title" className="type-section-title text-ink">
            {t('accessStaff.templatesTitle')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessStaff.templatesIntro')}</p>
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setEditing('new')}>
          {t('accessStaff.newTemplate')}
        </Button>
      </div>
      {q.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {q.data.map((tpl) => (
            <li key={tpl.id} className="flex flex-col rounded-2xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-ink">{loc(tpl.name)}</p>
                <span className="badge chip-soft shrink-0 text-[11px]">{t('accessStaff.users', { count: tpl.users })}</span>
              </div>
              {tpl.description && <p className="mt-1 text-xs text-muted">{loc(tpl.description)}</p>}
              <p className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="badge bg-sunken text-muted">{tpl.builtIn ? t('accessStaff.builtIn') : t('accessStaff.custom')}</span>
                {tpl.modified && <span className="badge bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">{t('accessStaff.modified')}</span>}
              </p>
              <div className="mt-auto pt-3">
                <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(tpl)}>
                  {t('accessStaff.edit')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateEditor template={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
};

const TemplateEditor = ({ template, onClose }: { template: Template | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useAccessError();
  const [name, setName] = useState<L10n>(template?.name ?? { az: '' });
  const [description, setDescription] = useState(template?.description?.az ?? '');
  const [matrix, setMatrix] = useState<Matrix>(template?.matrix ?? { cases: ['view'] });
  const done = () => {
    void qc.invalidateQueries({ queryKey: templatesKey });
    void qc.invalidateQueries({ queryKey: staffUsersKey });
    void qc.invalidateQueries({ queryKey: ['admin-perms'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const body = { name, description: description.trim() ? { ...(template?.description ?? {}), az: description.trim() } : null, matrix };
      return template ? api.put(`${BASE}/staff/templates/${template.id}`, body) : api.post(`${BASE}/staff/templates`, { ...body, description: body.description ?? undefined });
    },
    onSuccess: () => {
      toast.success(t('accessStaff.saved'));
      done();
      onClose();
    },
    onError,
  });
  const reset = useMutation({
    mutationFn: async () => api.post(`${BASE}/staff/templates/${template!.id}/reset`),
    onSuccess: () => {
      toast.success(t('accessStaff.saved'));
      done();
      onClose();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete(`${BASE}/staff/templates/${template!.id}`),
    onSuccess: () => {
      done();
      onClose();
    },
    onError: (err) => (errorCode(err) === 'TEMPLATE_IN_USE' ? toast.error(t('accessStaff.inUse')) : onError(err)),
  });
  const busy = save.isPending || reset.isPending || remove.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      size="lg"
      mobile="full"
      title={template ? t('accessStaff.edit') : t('accessStaff.newTemplate')}
      footer={
        <>
          {template?.builtIn && (
            <Button
              variant="ghost"
              icon={RotateCcw}
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog({ title: t('accessStaff.resetConfirm'), tone: 'primary', confirmLabel: t('accessStaff.reset') })) reset.mutate();
              }}
            >
              {t('accessStaff.reset')}
            </Button>
          )}
          {template && !template.builtIn && (
            <Button
              variant="danger"
              icon={Trash2}
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog({ title: t('accessStaff.deleteConfirm'), tone: 'danger' })) remove.mutate();
              }}
            >
              {t('accessStaff.delete')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('accessStaff.close')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={busy || !name.az.trim()}>
            {t('accessStaff.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {(['az', 'de', 'en', 'ru'] as const).map((l) => (
            <Field key={l} label={`${t('accessStaff.name')} (${l.toUpperCase()})`} required={l === 'az'} hint={l === 'az' ? t('accessStaff.nameHint') : undefined}>
              <Input value={name[l] ?? ''} maxLength={120} onChange={(e) => setName((n) => ({ ...n, [l]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <Field label={t('accessStaff.description')}>
          <Input value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">{t('accessStaff.matrix')}</p>
          <MatrixGrid value={matrix} onChange={setMatrix} idPrefix={`tpl-${template?.id ?? 'new'}`} />
        </div>
      </div>
    </Modal>
  );
};

// ─── Users ─────────────────────────────────────────────────────────────

export const useStaffUsers = () =>
  useQuery({ queryKey: staffUsersKey, queryFn: async () => (await api.get<{ users: StaffUser[] }>(`${BASE}/staff/users`)).data.users });

const UsersSection = () => {
  const { t } = useTranslation();
  const users = useStaffUsers();
  const templates = useTemplates();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (users.data ?? []).filter((u) => !needle || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(needle));
  }, [users.data, q]);

  return (
    <section aria-labelledby="access-users-title" className="space-y-3">
      <div>
        <h2 id="access-users-title" className="type-section-title text-ink">
          {t('accessStaff.usersTitle')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">{t('accessStaff.usersIntro')}</p>
      </div>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <label className="sr-only" htmlFor="access-users-search">
          {t('accessStaff.search')}
        </label>
        <input id="access-users-search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('accessStaff.search')} maxLength={100} />
      </div>
      {users.isLoading || templates.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : users.isError || templates.isError || !users.data || !templates.data ? (
        <ErrorState onRetry={() => void users.refetch()} />
      ) : (
        <ul className="space-y-3">
          {shown.map((u) => (
            <UserCard key={u.id} user={u} templates={templates.data} />
          ))}
        </ul>
      )}
    </section>
  );
};

type Tri = 'inherit' | 'grant' | 'deny';
const NEXT: Record<Tri, Tri> = { inherit: 'grant', grant: 'deny', deny: 'inherit' };

const UserCard = ({ user, templates }: { user: StaffUser; templates: Template[] }) => {
  const { t } = useTranslation();
  const loc = useLocalized();
  const qc = useQueryClient();
  const onError = useAccessError();
  const { user: me } = useAuth();
  const viewerSuper = me?.role === 'SUPER_ADMIN';
  const locked = user.role === 'SUPER_ADMIN' || user.id === me?.id;
  const [templateId, setTemplateId] = useState<string | null>(user.templateId);
  const [overrides, setOverrides] = useState<Override[]>(user.overrides);
  const [manage, setManage] = useState(user.manageAccess);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    setTemplateId(user.templateId);
    setOverrides(user.overrides);
    setManage(user.manageAccess);
  }, [user.templateId, user.overrides, user.manageAccess]);

  const dirty = templateId !== user.templateId || JSON.stringify(overrides) !== JSON.stringify(user.overrides) || manage !== user.manageAccess;
  const save = useMutation({
    mutationFn: async () =>
      api.put(`${BASE}/staff/users/${user.id}`, { templateId, overrides, ...(viewerSuper && manage !== user.manageAccess ? { manageAccess: manage } : {}) }),
    onSuccess: () => {
      toast.success(t('accessStaff.saved'));
      void qc.invalidateQueries({ queryKey: staffUsersKey });
      void qc.invalidateQueries({ queryKey: templatesKey });
    },
    onError,
  });

  const triOf = (a: Area, x: Action): Tri => overrides.find((o) => o.area === a && o.action === x)?.effect ?? 'inherit';
  const cycle = (a: Area, x: Action) =>
    setOverrides((list) => {
      const next = NEXT[triOf(a, x)];
      const rest = list.filter((o) => !(o.area === a && o.action === x));
      return next === 'inherit' ? rest : [...rest, { area: a, action: x, effect: next }];
    });
  const legacyName = loc(templates.find((x) => x.key === user.legacyKey)?.name);

  return (
    <li className={clsx('rounded-2xl border border-line bg-card p-4', !user.isActive && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            {fullName(user)}
            <span className="badge bg-sunken text-[11px] text-muted">{t(`accessStaff.roles.${user.role}`)}</span>
            {user.manageAccess && (
              <span className="badge chip-soft text-[11px]">
                <ShieldCheck className="size-3" aria-hidden /> {t('accessCenter.title')}
              </span>
            )}
            {!user.isActive && <span className="badge bg-sunken text-[11px] text-muted">{t('accessStaff.inactive')}</span>}
          </p>
          <p className="truncate text-xs text-muted">{user.email}</p>
        </div>
        <Button variant="ghost" size="sm" icon={Eye} onClick={() => setPreview(true)}>
          {t('accessStaff.preview')}
        </Button>
      </div>

      {locked ? (
        <p className="mt-3 text-sm text-muted">{user.role === 'SUPER_ADMIN' ? t('accessStaff.superAlways') : t('accessStaff.self')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <Field label={t('accessStaff.template')} className="max-w-md">
            <select className="input" value={templateId ?? ''} onChange={(e) => setTemplateId(e.target.value || null)}>
              <option value="">
                {t('accessStaff.legacy')}
                {legacyName ? ` · ${legacyName}` : ''}
              </option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {loc(tpl.name)}
                </option>
              ))}
            </select>
          </Field>
          {viewerSuper && user.role === 'ADMIN' && (
            <Checkbox label={t('accessStaff.manageAccess')} hint={t('accessStaff.manageAccessHint')} checked={manage} onChange={(e) => setManage(e.target.checked)} />
          )}
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary"
            aria-expanded={open}
            aria-controls={`ov-${user.id}`}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={clsx('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
            {t('accessStaff.overrides')}
            {overrides.length > 0 && <span className="badge chip-soft text-[11px]">{overrides.length}</span>}
          </button>
          {open && (
            <div id={`ov-${user.id}`} className="space-y-2">
              <p className="text-xs text-muted">{t('accessStaff.overridesHint')}</p>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="bg-sunken text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">
                        {t('accessStaff.matrixHint')}
                      </th>
                      {ACTIONS.map((x) => (
                        <th key={x} scope="col" className="px-2 py-2 text-center font-semibold">
                          {t(`accessStaff.actions.${x}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {AREAS.map((a) => (
                      <tr key={a}>
                        <th scope="row" className="px-3 py-1.5 text-left font-medium text-ink">
                          {t(`accessStaff.areas.${a}`)}
                        </th>
                        {ACTIONS.map((x) => {
                          const v = triOf(a, x);
                          return (
                            <td key={x} className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => cycle(a, x)}
                                aria-label={`${t(`accessStaff.areas.${a}`)}: ${t(`accessStaff.actions.${x}`)} — ${t(`accessStaff.${v}`)}`}
                                className={clsx(
                                  'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-xs font-semibold',
                                  v === 'inherit' && 'border-line text-muted',
                                  v === 'grant' && 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
                                  v === 'deny' && 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300',
                                )}
                              >
                                {v === 'inherit' ? <Minus className="size-3.5" aria-hidden /> : v === 'grant' ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
              {t('accessStaff.save')}
            </Button>
          </div>
        </div>
      )}
      {preview && <PreviewModal user={user} onClose={() => setPreview(false)} />}
    </li>
  );
};

const PreviewModal = ({ user, onClose }: { user: StaffUser; onClose: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['access-staff-preview', user.id],
    queryFn: async () => (await api.get<{ matrix: Matrix; caseScope: StaffUser['caseScope'] }>(`${BASE}/staff/users/${user.id}/preview`)).data,
  });
  return (
    <Modal open onClose={onClose} size="lg" title={t('accessStaff.previewTitle', { name: fullName(user) })}>
      {q.isLoading ? (
        <div className="grid place-items-center py-10 text-primary">
          <Spinner className="size-5" />
        </div>
      ) : q.isError || !q.data ? (
        <ErrorState onRetry={() => void q.refetch()} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink">{t('accessStaff.previewScope', { scope: t(`accessStaff.scope.${q.data.caseScope}`) })}</p>
          <MatrixGrid value={q.data.matrix} idPrefix={`pv-${user.id}`} />
        </div>
      )}
    </Modal>
  );
};
