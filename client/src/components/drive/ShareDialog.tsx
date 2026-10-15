import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Crown, Lock, Plus, Search, Trash2, User, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { fullName, roleLabel } from '@/components/admin/labels';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveKeys, invalidateDrive, toastDriveError } from './api';
import { crumbLabel } from './labels';
import { LEVELS, RANK, type AccessEntry, type AccessResponse, type DriveAccess, type DriveItem, type StaffPerson } from './types';

const LevelSelect = ({ value, onChange, max, disabled, id }: { value: DriveAccess; onChange: (v: DriveAccess) => void; max: DriveAccess; disabled?: boolean; id?: string }) => {
  const { t } = useTranslation();
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as DriveAccess)} className="input !w-auto !py-1.5 !text-xs">
      {LEVELS.filter((l) => RANK[l] <= RANK[max]).map((l) => (
        <option key={l} value={l} title={t(`drive.levelHints.${l}`)}>
          {t(`drive.levels.${l}`)}
        </option>
      ))}
    </select>
  );
};

/**
 * "Access" dialog: own and inherited grants (with the folder they come from), implicit holders, adding a
 * person or a whole role with a level, and the Windows-like "inherit from parent" switch.
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
  const [mode, setMode] = useState<'user' | 'role'>('user');
  const [search, setSearch] = useState('');
  const [person, setPerson] = useState<StaffPerson | null>(null);
  const [role, setRole] = useState<'STAFF' | 'ADMIN'>('STAFF');
  const [level, setLevel] = useState<DriveAccess>('VIEW');
  const [askInherit, setAskInherit] = useState(false);

  useEffect(() => {
    setPerson(null);
    setSearch('');
    setLevel('VIEW');
  }, [id]);

  const people = useQuery({
    queryKey: ['drive', 'people', search],
    queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people', { params: { q: search || undefined } })).data.people,
    enabled: !!item && mode === 'user' && !!q.data?.canManage,
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
      setPerson(null);
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

  const a = q.data;
  const own = useMemo(() => a?.entries.filter((e) => !e.inherited) ?? [], [a]);
  const inherited = useMemo(() => a?.entries.filter((e) => e.inherited) ?? [], [a]);
  const manage = !!a?.canManage;
  const isRoot = !!a && !a.node.parentId;

  const principal = (e: AccessEntry) =>
    e.user ? (
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">
          {(e.user.firstName[0] ?? '') + (e.user.lastName[0] ?? '')}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink">
            {fullName(e.user)} {e.user.id === myId && <span className="text-muted">({t('drive.share.you')})</span>}
          </span>
          <span className="block truncate text-[11px] text-muted">{e.user.email}</span>
        </span>
      </span>
    ) : (
      <span className="flex min-w-0 items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-violet-100 text-violet-700">
          <Users className="size-3.5" />
        </span>
        <span className="truncate text-sm font-medium text-ink">{t(`drive.share.role${e.role}`, { defaultValue: e.role ? roleLabel(e.role) : '' })}</span>
      </span>
    );

  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={t('drive.share.title', { name: item ? crumbLabel({ ...item, myAccess: item.myAccess }, t, myId) : '' })} description={manage ? undefined : t('drive.share.readOnly')}>
      {!a ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          {a.node.virtual && <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">{t('drive.share.casesHint')}</p>}
          {isRoot && !a.node.virtual && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{t('drive.share.rootHint')}</p>}

          {manage && (
            <section className="rounded-xl border border-line p-3">
              <div className="mb-3 flex items-center gap-1 rounded-lg bg-surface p-1 text-xs font-semibold">
                {(['user', 'role'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMode(m)} className={clsx('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5', mode === m ? 'bg-card text-ink shadow-sm' : 'text-muted')}>
                    {m === 'user' ? <User className="size-3.5" /> : <Users className="size-3.5" />}
                    {t(m === 'user' ? 'drive.share.person' : 'drive.share.role')}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  {mode === 'user' ? (
                    person ? (
                      <div className="flex items-center justify-between rounded-lg border border-brand-400 bg-brand-50 px-3 py-2 text-sm dark:bg-brand-500/10">
                        <span className="truncate font-medium text-ink">
                          {fullName(person)} <span className="text-xs text-muted">· {person.email}</span>
                        </span>
                        <button type="button" onClick={() => setPerson(null)} className="text-xs font-semibold text-brand-600">
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="relative">
                          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('drive.share.searchPeople')} className="input !pl-9" data-autofocus />
                        </div>
                        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line bg-card">
                          {people.data?.filter((p) => p.id !== myId).length === 0 && <li className="px-3 py-2 text-xs text-muted">{t('drive.share.noPeople')}</li>}
                          {people.data
                            ?.filter((p) => p.id !== myId)
                            .map((p) => (
                              <li key={p.id}>
                                <button type="button" onClick={() => setPerson(p)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface">
                                  <span className="truncate text-ink">{fullName(p)}</span>
                                  <span className="shrink-0 text-[11px] text-muted">{roleLabel(p.role)}</span>
                                </button>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )
                  ) : (
                    <select value={role} onChange={(e) => setRole(e.target.value as 'STAFF' | 'ADMIN')} className="input">
                      <option value="STAFF">{t('drive.share.roleSTAFF')}</option>
                      <option value="ADMIN">{t('drive.share.roleADMIN')}</option>
                    </select>
                  )}
                </div>
                <LevelSelect value={level} onChange={setLevel} max={a.myAccess} />
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={put.isPending || (mode === 'user' && !person)}
                  onClick={() => put.mutate(mode === 'user' ? { userId: person!.id, access: level } : { role, access: level })}
                >
                  {put.isPending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />} {t('drive.share.grant')}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted">{t(`drive.levelHints.${level}`)}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('drive.share.own')}</h3>
            <ul className="divide-y divide-line rounded-xl border border-line">
              <li className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
                    <Crown className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{t('drive.share.superAdmins')}</span>
                    <span className="block truncate text-[11px] text-muted">{t('drive.share.superAdminsHint')}</span>
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">{t('drive.share.always')}</span>
              </li>
              {a.implicit.owner && (
                <li className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {fullName(a.implicit.owner)} · {t('drive.share.owner')}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{t('drive.share.ownerHint')}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{t('drive.levels.MANAGE')}</span>
                </li>
              )}
              {a.implicit.assignedStaff && (
                <li className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {fullName(a.implicit.assignedStaff)} · {t('drive.share.assignedStaff')}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{t('drive.share.assignedHint')}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{t('drive.levels.DOWNLOAD')}</span>
                </li>
              )}
              {own.map((e) => (
                <li key={e.grantId} className="flex items-center justify-between gap-3 px-3 py-2">
                  {principal(e)}
                  <span className="flex shrink-0 items-center gap-1">
                    {manage ? (
                      <>
                        <LevelSelect value={e.access} max={a.myAccess} onChange={(v) => put.mutate(e.userId ? { userId: e.userId, access: v } : { role: e.role!, access: v })} />
                        <button type="button" onClick={() => remove.mutate(e.grantId)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger" aria-label={t('drive.share.remove')} title={t('drive.share.remove')}>
                          <Trash2 className="size-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted">{t(`drive.levels.${e.access}`)}</span>
                    )}
                  </span>
                </li>
              ))}
              {own.length === 0 && !a.implicit.owner && !a.implicit.assignedStaff && <li className="px-3 py-2 text-xs text-muted">{t('drive.share.noEntries')}</li>}
            </ul>
          </section>

          {inherited.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{t('drive.share.inherited')}</h3>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface/50">
                {inherited.map((e) => (
                  <li key={e.grantId} className="flex items-center justify-between gap-3 px-3 py-2">
                    {principal(e)}
                    <span className="shrink-0 text-right text-xs">
                      <span className="block text-ink">{t(`drive.levels.${e.access}`)}</span>
                      {e.from && <span className="block text-[11px] text-muted">{t('drive.share.from', { name: e.from.system ? t(`drive.roots.${e.from.space}`) : e.from.name })}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isRoot && !a.node.virtual && (
            <section className="rounded-xl border border-line p-3">
              <label className={clsx('flex items-start gap-3', manage ? 'cursor-pointer' : 'opacity-70')}>
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand-600"
                  checked={a.node.inheritPermissions}
                  disabled={!manage || inherit.isPending}
                  onChange={(e) => (e.target.checked ? inherit.mutate({ inherit: true }) : setAskInherit(true))}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    {!a.node.inheritPermissions && <Lock className="size-3.5 text-muted" />} {t('drive.share.inherit')}
                  </span>
                  <span className="block text-xs text-muted">{t('drive.share.inheritHint')}</span>
                </span>
              </label>
              {askInherit && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-900">{t('drive.share.inheritOffTitle')}</p>
                  <p className="mt-0.5 text-xs text-amber-800">{t('drive.share.inheritOffBody')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary btn-sm" disabled={inherit.isPending} onClick={() => inherit.mutate({ inherit: false, copyInherited: true })}>
                      {t('drive.share.copyInherited')}
                    </button>
                    <button type="button" className="btn-white btn-sm border border-line" disabled={inherit.isPending} onClick={() => inherit.mutate({ inherit: false, copyInherited: false })}>
                      {t('drive.share.removeInherited')}
                    </button>
                    <button type="button" className="btn-sm px-2 text-xs text-muted" onClick={() => setAskInherit(false)}>
                      {t('drive.dialogs.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};
