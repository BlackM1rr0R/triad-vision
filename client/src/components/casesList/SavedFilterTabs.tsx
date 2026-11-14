import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BookmarkPlus, MoreHorizontal, Pencil, Pin, PinOff, RefreshCw, RotateCcw, Share2, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toastError } from '@/components/admin/labels';
import { PAGE_ROUTE, useSavedViewMutations, useSavedViews, viewKeys, type SavedView, type ViewPage } from '@/components/staffPower/api';
import { SaveViewDialog, useApplyViewColumns, viewHref, viewParamsOf } from '@/components/staffPower/SavedViews';
import { sameParams } from '@/components/staffPower/pure';
import type { TableSettings } from '@/components/staffPower/tableSettings';

registerCopy(pagesCasesList);
registerCopy(pagesStaffPower);

/** View options that do not make a tab "different" (the list / board switch). */
const VIEW_ONLY = new Set(['view']);
const filtersOf = (p: Record<string, string>) => Object.fromEntries(Object.entries(p).filter(([k]) => !VIEW_ONLY.has(k)));

const seededKey = ['staff-saved-views-seeded'] as const;

/**
 * Saved filters of a list page as tabs above the list: "Hamısı", then the user's own saved filters (the server
 * adds a few defaults once: POST /admin/me/saved-views/defaults) and the team's. The tab whose filters equal
 * the URL is active; the active tab's menu renames, overwrites with the current filters, shares, pins to the
 * sidebar or deletes it. Stored per user on the server (routes/admin/staffUi.ts).
 */
export const SavedFilterTabs = ({ page, settings, className }: { page: ViewPage; settings?: TableSettings; className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { data: all } = useSavedViews();
  const { update, remove } = useSavedViewMutations();
  const views = useMemo(() => (all ?? []).filter((v) => v.page === page), [all, page]);
  useApplyViewColumns(views, settings);
  const [dialog, setDialog] = useState<null | { edit: SavedView | null }>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedView | null>(null);

  // Default tabs: added once per user and page on the server; afterwards they are ordinary saved filters.
  const seeded = useQuery({
    queryKey: seededKey,
    queryFn: async () => (await api.get<{ seeded?: string[] }>('/admin/me/saved-views', { params: { page } })).data.seeded ?? [],
    staleTime: Infinity,
  });
  const seeding = useRef(false);
  useEffect(() => {
    if (!seeded.data || seeded.data.includes(page) || seeding.current) return;
    seeding.current = true;
    void api
      .post('/admin/me/saved-views/defaults', { page })
      .then(() => {
        qc.setQueryData<string[]>(seededKey, (old) => [...new Set([...(old ?? []), page])]);
        return qc.invalidateQueries({ queryKey: viewKeys.all });
      })
      .catch(() => {
        /* no defaults this time; the tabs still work */
      });
  }, [seeded.data, page, qc]);

  const current = filtersOf(viewParamsOf(params));
  const sv = params.get('sv');
  const matching = views.find((v) => sameParams(filtersOf(v.params), current)) ?? null;
  const named = sv ? (views.find((v) => v.id === sv) ?? null) : null;
  // The URL's filters decide; a tab opened by id whose filters were changed since stays marked as "modified".
  const active = matching ?? named;
  const modified = !matching && !!named;
  const isAll = !active && Object.keys(current).length === 0;
  const canEdit = (v: SavedView) => !v.shared || v.mine || hasMinRole(user?.role, 'ADMIN');
  const ordered = [...views.filter((v) => !v.shared), ...views.filter((v) => v.shared)];

  const go = (v: SavedView | null) => {
    if (!v) {
      const keep = params.get('view');
      navigate(keep ? `${PAGE_ROUTE[page].to}?view=${keep}` : PAGE_ROUTE[page].to);
      return;
    }
    if (v.columns && settings) settings.apply(v.columns);
    navigate(viewHref(v));
  };
  const patch = async (v: SavedView, body: Parameters<typeof update.mutateAsync>[0], okKey: string) => {
    try {
      await update.mutateAsync(body);
      toast.success(t(okKey, { name: v.name }));
    } catch (err) {
      toastError(err);
    }
  };
  const restore = async () => {
    try {
      const r = (await api.post<{ added: number }>('/admin/me/saved-views/defaults', { page, restore: true })).data;
      await qc.invalidateQueries({ queryKey: viewKeys.all });
      toast.success(r.added ? t('cl.tabs.restored', { count: r.added }) : t('cl.tabs.restoredNone'));
    } catch (err) {
      toastError(err);
    }
  };

  const tabMenu = (v: SavedView): MenuItem[] => [
    ...(canEdit(v)
      ? ([
          { label: t('cl.tabs.rename'), icon: Pencil, onSelect: () => setDialog({ edit: v }) },
          {
            label: t('cl.tabs.updateFilters'),
            icon: RefreshCw,
            disabled: !modified && sameParams(filtersOf(v.params), current),
            onSelect: () => void patch(v, { id: v.id, params: viewParamsOf(params) }, 'sp.views.updated'),
          },
          { label: v.shared ? t('cl.tabs.unshare') : t('cl.tabs.share'), icon: v.shared ? Users : Share2, onSelect: () => void patch(v, { id: v.id, shared: !v.shared }, v.shared ? 'sp.views.unsharedDone' : 'sp.views.sharedDone') },
        ] as MenuItem[])
      : []),
    { label: v.pinned ? t('cl.tabs.unpin') : t('cl.tabs.pin'), icon: v.pinned ? PinOff : Pin, onSelect: () => void patch(v, { id: v.id, pinned: !v.pinned }, v.pinned ? 'sp.views.unpinned' : 'sp.views.pinnedDone') },
    ...(canEdit(v) ? (['separator', { label: t('cl.tabs.delete'), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(v) }] as MenuItem[]) : []),
  ];

  const tabClass = (on: boolean) =>
    clsx(
      'relative inline-flex min-h-10 shrink-0 items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-focus/50 sm:min-h-9',
      on ? 'font-semibold text-ink after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary' : 'font-medium text-muted hover:text-ink',
    );

  return (
    <div className={clsx('flex items-end gap-1 border-b border-line', className)} data-tour="sp-views">
      <nav aria-label={t('cl.tabs.aria')} className="-mb-px flex min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button type="button" className={tabClass(isAll)} aria-current={isAll ? 'page' : undefined} onClick={() => go(null)}>
          {t('cl.tabs.all')}
        </button>
        {ordered.map((v) => {
          const on = active?.id === v.id;
          return (
            <span key={v.id} className="inline-flex shrink-0 items-center">
              <button
                type="button"
                className={tabClass(on)}
                aria-current={on ? 'page' : undefined}
                onClick={() => go(v)}
                title={v.shared && !v.mine && v.ownerName ? t('cl.tabs.team', { name: v.ownerName }) : undefined}
              >
                {v.shared && <Users className="size-3.5 shrink-0 opacity-70" aria-hidden />}
                <span className="max-w-[14rem] truncate">{v.name}</span>
                {on && modified && <span className="size-1.5 shrink-0 rounded-full bg-warning" title={t('cl.tabs.modified')} aria-label={t('cl.tabs.modified')} role="img" />}
              </button>
              {on && (
                <Menu
                  label={t('cl.tabs.menu', { name: v.name })}
                  trigger={
                    <button type="button" aria-label={t('cl.tabs.menu', { name: v.name })} className="-ml-1.5 grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
                      <MoreHorizontal className="size-4" aria-hidden />
                    </button>
                  }
                  items={tabMenu(v)}
                />
              )}
            </span>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-0.5 pb-1">
        <button
          type="button"
          onClick={() => setDialog({ edit: null })}
          title={t('cl.tabs.addHint')}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-link hover:bg-primary/[0.06] sm:min-h-8"
        >
          <BookmarkPlus className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('cl.tabs.add')}</span>
          <span className="sr-only sm:hidden">{t('cl.tabs.add')}</span>
        </button>
        <Menu
          label={t('cl.tabs.more')}
          trigger={
            <button type="button" aria-label={t('cl.tabs.more')} className="grid size-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink sm:size-8">
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          }
          items={[{ label: t('cl.tabs.restore'), icon: RotateCcw, onSelect: () => void restore() }]}
        />
      </div>

      <SaveViewDialog open={!!dialog} onClose={() => setDialog(null)} page={page} settings={settings} edit={dialog?.edit ?? null} />
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        role="alertdialog"
        title={t('sp.views.deleteTitle', { name: confirmDelete?.name ?? '' })}
        description={confirmDelete?.shared ? t('sp.views.deleteSharedHint') : undefined}
        size="sm"
        busy={remove.isPending}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={async () => {
                const v = confirmDelete;
                if (!v) return;
                try {
                  await remove.mutateAsync(v.id);
                  toast.success(t('sp.views.deleted', { name: v.name }));
                  setConfirmDelete(null);
                  if (active?.id === v.id) go(null);
                } catch (err) {
                  toastError(err);
                }
              }}
            >
              {t('sp.views.deleteConfirm')}
            </Button>
          </>
        }
      />
    </div>
  );
};
