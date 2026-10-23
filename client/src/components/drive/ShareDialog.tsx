import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, Crown, Download, Eye, Lock, Pencil, Search, ShieldCheck, Trash2, UserCheck, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { fullName, roleLabel } from '@/components/admin/labels';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, invalidateDrive, toastDriveError } from './api';
import { crumbLabel } from './labels';
import { ShareLinksSection } from './collab/ShareLinks';
import { RANK, type AccessEntry, type AccessResponse, type DriveAccess, type DriveItem, type StaffPerson } from './types';

/**
 * The four levels offered in the UI. DOWNLOAD (single files only) still exists on the server and is
 * shown when a folder already has it, but new grants pick from these four plain choices.
 */
const SIMPLE: { level: DriveAccess; icon: LucideIcon; tone: string }[] = [
  { level: 'VIEW', icon: Eye, tone: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200' },
  { level: 'EXPORT', icon: Download, tone: 'bg-sky-100 text-sky-800' },
  { level: 'EDIT', icon: Pencil, tone: 'bg-emerald-100 text-emerald-800' },
  { level: 'MANAGE', icon: ShieldCheck, tone: 'bg-violet-100 text-violet-800' },
];
const toneOf = (l: DriveAccess) => SIMPLE.find((s) => s.level === l)?.tone ?? 'bg-sky-100 text-sky-800';

type Target = { kind: 'role'; role: 'STAFF' | 'ADMIN' } | { kind: 'user'; person: StaffPerson };

const LevelBadge = ({ level }: { level: DriveAccess }) => {
  const { t } = useTranslation();
  return <span className={clsx('inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold', toneOf(level))}>{t(`drive.simple.levels.${level}`)}</span>;
};

/** Compact level picker for an existing row. */
const LevelSelect = ({ value, onChange, max }: { value: DriveAccess; onChange: (v: DriveAccess) => void; max: DriveAccess }) => {
  const { t } = useTranslation();
  const options = SIMPLE.map((s) => s.level).filter((l) => RANK[l] <= RANK[max]);
  if (!options.includes(value)) options.splice(1, 0, value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as DriveAccess)} className="input !w-auto !py-1.5 !text-xs" aria-label={t('drive.simple.changeLevel')}>
      {options.map((l) => (
        <option key={l} value={l}>
          {t(`drive.simple.levels.${l}`)}
        </option>
      ))}
    </select>
  );
};

const Avatar = ({ person, group }: { person?: { firstName: string; lastName: string } | null; group?: boolean }) =>
  group || !person ? (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
      <Users className="size-4" />
    </span>
  ) : (
    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{(person.firstName[0] ?? '') + (person.lastName[0] ?? '')}</span>
  );

/**
 * "Who can open this?" dialog, written for admins who are not IT people: one search box for people
 * and whole groups, four plain levels with an explanation, one list of everyone who has access (with
 * where it comes from), and the inheritance switch tucked away under "Advanced".
 */
export const ShareDialog = ({ item, onClose, myId }: { item: DriveItem | null; onClose: () => void; myId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const id = item?.id ?? '';
  const q = useQuery({
    queryKey: driveKeys.access(id),
    queryFn: async () => (await api.get<AccessResponse>(`/drive/nodes/${encodeURIComponent(id)}/access`)).data,
    enabled: !!item,
  });
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [level, setLevel] = useState<DriveAccess>('VIEW');
  const [advanced, setAdvanced] = useState(false);
  const [askInherit, setAskInherit] = useState(false);

  useEffect(() => {
    setTarget(null);
    setSearch('');
    setLevel('VIEW');
    setAdvanced(false);
    setAskInherit(false);
  }, [id]);

  const a = q.data;
  const manage = !!a?.canManage;
  const people = useQuery({
    queryKey: ['drive', 'people', search],
    queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people', { params: { q: search || undefined } })).data.people,
    enabled: !!item && manage && !target,
    staleTime: 30_000,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: driveKeys.access(id) });
    void invalidateDrive(qc);
  };

  const put = useMutation({
    mutationFn: (body: { userId?: string; role?: string; access: DriveAccess }) => api.put(`/drive/nodes/${encodeURIComponent(id)}/grants`, body),
    onSuccess: () => {
      toast.success(t('drive.toasts.accessSaved'));
      setTarget(null);
      setSearch('');
      refresh();
    },
    onError: toastDriveError,
  });
  const remove = useMutation({
    mutationFn: (grantId: string) => api.delete(`/drive/nodes/${encodeURIComponent(id)}/grants/${grantId}`),
    onSuccess: () => {
      toast.success(t('drive.toasts.accessRemoved'));
      refresh();
    },
    onError: toastDriveError,
  });
  const inherit = useMutation({
    mutationFn: (body: { inherit: boolean; copyInherited?: boolean }) => api.patch(`/drive/nodes/${encodeURIComponent(id)}/inheritance`, body),
    onSuccess: (_r, body) => {
      toast.success(t(body.inherit ? 'drive.toasts.inheritOn' : 'drive.toasts.inheritOff'));
      setAskInherit(false);
      refresh();
    },
    onError: toastDriveError,
  });

  const isRoot = !!a && !a.node.parentId;
  const isFile = a?.node.kind === 'FILE';
  const entries = useMemo(() => [...(a?.entries ?? [])].sort((x, y) => Number(x.inherited) - Number(y.inherited) || RANK[y.access] - RANK[x.access]), [a]);
  const groupOptions = (['STAFF', 'ADMIN'] as const).filter((r) => !search.trim() || t(`drive.share.role${r}`).toLowerCase().includes(search.trim().toLowerCase()));

  /** Plain-language summary for the top of the dialog. */
  const summary = useMemo(() => {
    if (!a) return '';
    const staff = a.entries.find((e) => e.role === 'STAFF');
    const named = a.entries.filter((e) => e.user).length;
    const parts: string[] = [];
    if (staff) parts.push(t('drive.simple.summaryStaff', { level: t(`drive.simple.levels.${staff.access}`).toLowerCase() }));
    else parts.push(t('drive.simple.summaryNotStaff'));
    if (named) parts.push(t('drive.simple.summaryPeople', { count: named }));
    return parts.join(' ');
  }, [a, t]);

  const principalName = (e: AccessEntry) => (e.user ? fullName(e.user) : t(`drive.share.role${e.role}`, { defaultValue: e.role ? roleLabel(e.role) : '' }));
  const sourceText = (e: AccessEntry) =>
    e.inherited && e.from
      ? t('drive.simple.fromFolder', { name: e.from.system ? t(`drive.roots.${e.from.space}`) : e.from.name })
      : e.user
        ? t('drive.simple.givenHere')
        : t('drive.simple.groupHere');

  return (
    <Modal
      open={!!item}
      onClose={onClose}
      size="lg"
      title={t('drive.simple.title', { name: item ? crumbLabel({ ...item, myAccess: item.myAccess }, t, myId) : '' })}
      description={manage ? undefined : t('drive.share.readOnly')}
    >
      {!a ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. one-sentence answer to "who can see this?" */}
          <div className="flex items-start gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-ink">
            <UserCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <p>
              {summary}
              {a.node.virtual && <span className="mt-1 block text-xs text-muted">{t('drive.share.casesHint')}</span>}
              {isRoot && !a.node.virtual && <span className="mt-1 block text-xs text-muted">{t('drive.simple.rootHint')}</span>}
            </p>
          </div>

          {/* 2. give access: who → what → button */}
          {manage && (
            <section className="rounded-xl border border-line p-4">
              <h3 className="mb-3 text-sm font-bold text-ink">{t('drive.simple.addTitle')}</h3>
              <span className="mb-1.5 block text-xs font-semibold text-muted">1. {t('drive.simple.stepWho')}</span>
              {target ? (
                <div className="flex items-center gap-3 rounded-lg border border-brand-400 bg-brand-50 px-3 py-2">
                  <Avatar person={target.kind === 'user' ? target.person : null} group={target.kind === 'role'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{target.kind === 'user' ? fullName(target.person) : t(`drive.share.role${target.role}`)}</span>
                    <span className="block truncate text-xs text-muted">{target.kind === 'user' ? target.person.email : t(`drive.simple.groupHint${target.role}`)}</span>
                  </span>
                  <button type="button" onClick={() => setTarget(null)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card hover:text-ink" aria-label={t('drive.dialogs.cancel')}>
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('drive.simple.searchPh')} className="input !pl-9" data-autofocus />
                  </div>
                  <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-card">
                    {groupOptions.map((r) => (
                      <li key={r}>
                        <button type="button" onClick={() => setTarget({ kind: 'role', role: r })} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface">
                          <Avatar group />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-ink">{t(`drive.share.role${r}`)}</span>
                            <span className="block text-xs text-muted">{t(`drive.simple.groupHint${r}`)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    {people.data
                      ?.filter((p) => p.id !== myId)
                      .map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => setTarget({ kind: 'user', person: p })} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface">
                            <Avatar person={p} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{fullName(p)}</span>
                              <span className="block truncate text-xs text-muted">{p.email}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted">{roleLabel(p.role)}</span>
                          </button>
                        </li>
                      ))}
                    {people.data && people.data.filter((p) => p.id !== myId).length === 0 && groupOptions.length === 0 && <li className="px-3 py-3 text-xs text-muted">{t('drive.share.noPeople')}</li>}
                  </ul>
                </div>
              )}

              <span className="mt-4 mb-1.5 block text-xs font-semibold text-muted">2. {t('drive.simple.stepWhat')}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {SIMPLE.filter((s) => RANK[s.level] <= RANK[a.myAccess]).map(({ level: l, icon: Icon }) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevel(l)}
                    aria-pressed={level === l}
                    className={clsx(
                      'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                      level === l ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-line hover:border-brand-400/60 hover:bg-surface',
                    )}
                  >
                    <span className={clsx('grid size-8 shrink-0 place-items-center rounded-lg', toneOf(l))}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{t(`drive.simple.levels.${l}`)}</span>
                      <span className="block text-xs leading-snug text-muted">{t(`drive.simple.hints.${l}`)}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={put.isPending || !target}
                  onClick={() => target && put.mutate(target.kind === 'user' ? { userId: target.person.id, access: level } : { role: target.role, access: level })}
                >
                  {put.isPending && <Spinner className="size-3.5" />} {t('drive.simple.giveAccess')}
                </button>
              </div>
            </section>
          )}

          {/* 3. everyone who has access, in one list */}
          <section>
            <h3 className="mb-2 text-sm font-bold text-ink">{t('drive.simple.listTitle')}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              <li className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                  <Crown className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{t('drive.share.superAdmins')}</span>
                  <span className="block truncate text-xs text-muted">{t('drive.simple.always')}</span>
                </span>
                <LevelBadge level="MANAGE" />
              </li>
              {a.implicit.owner && (
                <li className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar person={a.implicit.owner} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{fullName(a.implicit.owner)}</span>
                    <span className="block truncate text-xs text-muted">{t('drive.simple.ownerSource')}</span>
                  </span>
                  <LevelBadge level="MANAGE" />
                </li>
              )}
              {a.implicit.assignedStaff && (
                <li className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar person={a.implicit.assignedStaff} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{fullName(a.implicit.assignedStaff)}</span>
                    <span className="block truncate text-xs text-muted">{t('drive.share.assignedHint')}</span>
                  </span>
                  <LevelBadge level="DOWNLOAD" />
                </li>
              )}
              {entries.map((e) => (
                <li key={e.grantId} className={clsx('flex items-center gap-3 px-3 py-2.5', e.inherited && 'bg-surface/50')}>
                  <Avatar person={e.user} group={!e.user} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {principalName(e)} {e.user?.id === myId && <span className="text-muted">({t('drive.share.you')})</span>}
                    </span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted">
                      {e.inherited && <Lock className="size-3 shrink-0" aria-hidden />}
                      {sourceText(e)}
                    </span>
                  </span>
                  {manage && !e.inherited ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <LevelSelect value={e.access} max={a.myAccess} onChange={(v) => put.mutate(e.userId ? { userId: e.userId, access: v } : { role: e.role!, access: v })} />
                      <button
                        type="button"
                        onClick={() => remove.mutate(e.grantId)}
                        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger"
                        aria-label={`${t('drive.share.remove')}: ${principalName(e)}`}
                        title={t('drive.share.remove')}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  ) : (
                    <span title={e.inherited ? t('drive.simple.inheritedTip') : undefined}>
                      <LevelBadge level={e.access} />
                    </span>
                  )}
                </li>
              ))}
              {entries.length === 0 && !a.implicit.owner && !a.implicit.assignedStaff && <li className="px-3 py-3 text-xs text-muted">{t('drive.simple.onlySuper')}</li>}
            </ul>
          </section>

          {/* 4. inheritance, for the rare case it matters */}
          {!isRoot && !a.node.virtual && (
            <section className="rounded-xl border border-line">
              <button type="button" onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-ink" aria-expanded={advanced}>
                <span className="flex items-center gap-2">
                  {!a.node.inheritPermissions && <Lock className="size-3.5 text-amber-600" />}
                  {t('drive.simple.advanced')}
                  {!a.node.inheritPermissions && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t('drive.simple.separate')}</span>}
                </span>
                <ChevronDown className={clsx('size-4 text-muted transition', advanced && 'rotate-180')} />
              </button>
              {advanced && (
                <div className="border-t border-line px-4 py-3">
                  <label className={clsx('flex items-start gap-3', manage ? 'cursor-pointer' : 'opacity-70')}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-brand-600"
                      checked={a.node.inheritPermissions}
                      disabled={!manage || inherit.isPending}
                      onChange={(e) => (e.target.checked ? inherit.mutate({ inherit: true }) : setAskInherit(true))}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{t(isFile ? 'drive.simple.inheritFile' : 'drive.simple.inheritFolder')}</span>
                      <span className="block text-xs text-muted">{t('drive.simple.inheritHint')}</span>
                    </span>
                  </label>
                  {askInherit && (
                    <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                      <p className="font-semibold text-amber-900">{t('drive.simple.inheritOffTitle')}</p>
                      <p className="mt-0.5 text-xs text-amber-800">{t('drive.simple.inheritOffBody')}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary btn-sm" disabled={inherit.isPending} onClick={() => inherit.mutate({ inherit: false, copyInherited: true })}>
                          {t('drive.simple.keepPeople')}
                        </button>
                        <button type="button" className="btn-secondary btn-sm" disabled={inherit.isPending} onClick={() => inherit.mutate({ inherit: false, copyInherited: false })}>
                          {t('drive.simple.startEmpty')}
                        </button>
                        <button type="button" className="btn-sm px-2 text-xs text-muted" onClick={() => setAskInherit(false)}>
                          {t('drive.dialogs.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 5. links for people outside the team (employer, translator) */}
          {item && !isRoot && !a.node.system && (a.myAccess === 'EDIT' || a.myAccess === 'MANAGE') && (
            <div className="border-t border-line pt-5">
              <ShareLinksSection item={item} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
