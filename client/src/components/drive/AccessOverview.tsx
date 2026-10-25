import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { fullName, roleLabel } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { ItemIcon } from './fileIcons';
import type { DriveItem, OverviewItem, OverviewResponse, StaffPerson } from './types';

const SOURCE_TONE: Record<OverviewItem['source'], string> = {
  user: 'bg-success-bg text-success-fg',
  role: 'bg-info-bg text-info-fg',
  inherited: 'bg-sunken text-muted',
  owner: 'bg-accent-bg text-accent-fg',
  super: 'bg-warning-bg text-warning-fg',
};

const asItem = (n: OverviewItem): DriveItem => ({
  ...n,
  virtual: false,
  color: null,
  mimeType: null,
  size: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
  createdBy: null,
  myAccess: n.level,
  previewable: false,
  starred: false,
});

const Branch = ({ node, byParent, depth, open, onOpen }: { node: OverviewItem; byParent: Map<string | null, OverviewItem[]>; depth: number; open: (id: string) => void; onOpen: (id: string) => void }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(depth < 1);
  const kids = byParent.get(node.id) ?? [];
  const label = node.system && !node.parentId ? (node.space === 'PERSONAL' ? node.name : t(`drive.roots.${node.space}`)) : node.name;
  return (
    <li>
      <div className="flex items-center gap-1.5 rounded-lg py-1 pr-2 hover:bg-sunken" style={{ paddingLeft: `${depth * 16}px` }}>
        <button type="button" onClick={() => setExpanded((x) => !x)} className={clsx('grid size-6 place-items-center rounded', kids.length ? '' : 'invisible')} aria-expanded={expanded}>
          <ChevronRight className={clsx('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </button>
        <ItemIcon item={asItem(node)} className="size-5 shrink-0" />
        <button type="button" onClick={() => onOpen(node.id)} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink hover:underline">
          {label}
        </button>
        <span className="shrink-0 text-xs font-semibold text-ink">{t(`drive.levels.${node.level}`)}</span>
        <span className={clsx('hidden shrink-0 rounded px-1.5 py-px text-[10px] font-semibold sm:inline', SOURCE_TONE[node.source])}>{t(`drive.overview.source.${node.source}`)}</span>
      </div>
      {expanded && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Branch key={k.id} node={k} byParent={byParent} depth={depth + 1} open={open} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  );
};

/** Super admin: pick a staff member and see every folder they can open, with the level and where it comes from. */
export const AccessOverview = ({ onOpenFolder }: { onOpenFolder: (id: string) => void }) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const people = useQuery({
    queryKey: ['drive', 'people', ''],
    queryFn: async () => (await api.get<{ people: StaffPerson[] }>('/drive/people')).data.people,
  });
  const ov = useQuery({
    queryKey: ['drive', 'overview', userId],
    queryFn: async () => (await api.get<OverviewResponse>(`/drive/overview/${userId}`)).data,
    enabled: !!userId,
  });
  const filtered = (people.data ?? []).filter((p) => `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase().includes(search.toLowerCase()));

  const { roots, byParent } = useMemo(() => {
    const items = ov.data?.items ?? [];
    const ids = new Set(items.map((i) => i.id));
    const map = new Map<string | null, OverviewItem[]>();
    for (const i of items) {
      const key = i.parentId && ids.has(i.parentId) ? i.parentId : null;
      map.set(key, [...(map.get(key) ?? []), i]);
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.kind === 'FOLDER') - Number(a.kind === 'FOLDER') || a.name.localeCompare(b.name));
    const top = (map.get(null) ?? []).sort((a, b) => Number(b.system) - Number(a.system) || a.space.localeCompare(b.space) || a.name.localeCompare(b.name));
    return { roots: top, byParent: map };
  }, [ov.data]);

  const selected = people.data?.find((p) => p.id === userId);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-1">
      <aside className="flex min-h-0 flex-col border-b border-line md:border-r md:border-b-0">
        <div className="p-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ShieldCheck className="size-5 text-accent-fg" /> {t('drive.overview.title')}
          </h2>
          <p className="mt-1 text-xs text-muted">{t('drive.overview.subtitle')}</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('drive.overview.search')} className="input !py-2 !pl-9" />
          </div>
        </div>
        <ul className="max-h-48 min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:max-h-none">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setUserId(p.id)}
                className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left', userId === p.id ? 'bg-primary text-primary-contrast' : 'hover:bg-sunken')}
              >
                <span className={clsx('grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold', userId === p.id ? 'bg-primary-contrast/20 text-primary-contrast' : 'bg-primary/10 text-link')}>
                  {(p.firstName[0] ?? '') + (p.lastName[0] ?? '')}
                </span>
                <span className="min-w-0">
                  <span className={clsx('block truncate text-sm font-semibold', userId === p.id ? 'text-primary-contrast' : 'text-ink')}>{fullName(p)}</span>
                  <span className={clsx('block truncate text-[11px]', userId === p.id ? 'text-primary-contrast/80' : 'text-muted')}>{roleLabel(p.role)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-h-0 overflow-y-auto p-4 sm:p-6">
        {!userId ? (
          <p className="grid h-full place-items-center text-sm text-muted">{t('drive.overview.choose')}</p>
        ) : ov.isLoading ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : ov.data ? (
          <>
            <div className="mb-4">
              <h3 className="text-lg font-bold text-ink">{selected ? fullName(selected) : ''}</h3>
              <p className="text-xs text-muted">
                {ov.data.cases.rootLevel
                  ? t('drive.overview.cases', { level: t(`drive.levels.${ov.data.cases.rootLevel}`) })
                  : t('drive.overview.casesNone', { count: ov.data.cases.assignedCases })}
              </p>
            </div>
            {ov.data.user.role === 'SUPER_ADMIN' ? (
              <p className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-fg">{t('drive.overview.superAll')}</p>
            ) : roots.length === 0 ? (
              <p className="text-sm text-muted">{t('drive.overview.nothing')}</p>
            ) : (
              <ul className="space-y-0.5">
                {roots.map((r) => (
                  <Branch key={r.id} node={r} byParent={byParent} depth={0} open={() => undefined} onOpen={onOpenFolder} />
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
};
