import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Bookmark, BookmarkPlus, Check, ChevronDown, Pencil, Pin, PinOff, RefreshCw, Share2, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useEscapeLayer } from '@/components/ui/overlay';
import { toastError } from '@/components/admin/labels';
import { PAGE_ROUTE, VIEW_PAGES, useSavedViewMutations, useSavedViews, type SavedView, type ViewPage } from './api';
import type { TableSettings } from './tableSettings';
import { sameParams, viewParams } from './pure';

registerCopy(pagesStaffPower);

export const viewParamsOf = (sp: URLSearchParams) => viewParams(sp.entries());

export const viewHref = (v: Pick<SavedView, 'id' | 'page' | 'params'>) => {
  const sp = new URLSearchParams(v.params);
  sp.set('sv', v.id);
  return `${PAGE_ROUTE[v.page].to}?${sp.toString()}`;
};

/** Applies the columns of the view named in ?sv= once it is known (a sidebar link carries only the URL). */
const useApplyViewColumns = (views: SavedView[] | undefined, settings?: TableSettings) => {
  const [params] = useSearchParams();
  const sv = params.get('sv');
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (!sv || !views || !settings || applied.current === sv) return;
    const v = views.find((x) => x.id === sv);
    if (!v) return;
    applied.current = sv;
    if (v.columns) settings.apply(v.columns);
  }, [sv, views, settings]);
};

const SaveViewDialog = ({ open, onClose, page, settings, edit }: { open: boolean; onClose: () => void; page: ViewPage; settings?: TableSettings; edit?: SavedView | null }) => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { create, update } = useSavedViewMutations();
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [withColumns, setWithColumns] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? '');
    setShared(edit?.shared ?? false);
    setPinned(edit?.pinned ?? true);
  }, [open, edit]);
  const busy = create.isPending || update.isPending;
  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (edit) {
        await update.mutateAsync({ id: edit.id, name: name.trim(), shared, pinned });
        toast.success(t('sp.views.renamed'));
      } else {
        const view = await create.mutateAsync({
          page,
          name: name.trim(),
          params: viewParamsOf(params),
          columns: withColumns && settings ? settings.prefs : null,
          shared,
          pinned,
        });
        toast.success(t('sp.views.saved', { name: view.name }));
        navigate(viewHref(view), { replace: true });
      }
      onClose();
    } catch (err) {
      toastError(err);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={edit ? t('sp.views.editTitle') : t('sp.views.saveTitle')}
      description={edit ? undefined : t('sp.views.saveHint')}
      size="sm"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!name.trim()}>
            {t('sp.views.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">{t('sp.views.name')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t('sp.views.namePlaceholder')} data-autofocus />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>
            <span className="block font-medium text-ink">{t('sp.views.shared')}</span>
            <span className="block text-xs text-muted">{t('sp.views.sharedHint')}</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <span>
            <span className="block font-medium text-ink">{t('sp.views.pinned')}</span>
            <span className="block text-xs text-muted">{t('sp.views.pinnedHint')}</span>
          </span>
        </label>
        {!edit && settings && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={withColumns} onChange={(e) => setWithColumns(e.target.checked)} />
            <span className="block font-medium text-ink">{t('sp.views.withColumns')}</span>
          </label>
        )}
      </div>
    </Modal>
  );
};

/**
 * "Görünüşlər" menu of a list page: open a saved view (filters / sort in the URL + its columns), save the current
 * one, rename, share with the team, pin to the sidebar, update with the current filters, delete.
 */
export const SavedViewsMenu = ({ page, settings, className }: { page: ViewPage; settings?: TableSettings; className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: all } = useSavedViews();
  const { update, remove } = useSavedViewMutations();
  const views = useMemo(() => (all ?? []).filter((v) => v.page === page), [all, page]);
  useApplyViewColumns(views, settings);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { edit: SavedView | null }>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedView | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEscapeLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = viewParamsOf(params);
  const sv = params.get('sv');
  const active = views.find((v) => v.id === sv && sameParams(v.params, current)) ?? null;
  const canEdit = (v: SavedView) => !v.shared || v.mine || hasMinRole(user?.role, 'ADMIN');
  const mine = views.filter((v) => !v.shared);
  const team = views.filter((v) => v.shared);

  const openView = (v: SavedView) => {
    setOpen(false);
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

  const Row = ({ v }: { v: SavedView }) => (
    <li className={clsx('group flex items-center gap-1 rounded-md pr-1 text-sm', v.id === active?.id ? 'bg-primary/[0.06]' : 'hover:bg-sunken')}>
      <button type="button" onClick={() => openView(v)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
        {v.id === active?.id ? <Check className="size-3.5 shrink-0 text-link" aria-hidden /> : <Bookmark className="size-3.5 shrink-0 text-muted" aria-hidden />}
        <span className="min-w-0">
          <span className="block truncate text-ink">{v.name}</span>
          {v.shared && !v.mine && v.ownerName && <span className="block truncate text-[11px] text-muted">{t('sp.views.by', { name: v.ownerName })}</span>}
        </span>
      </button>
      <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink" onClick={() => void patch(v, { id: v.id, pinned: !v.pinned }, v.pinned ? 'sp.views.unpinned' : 'sp.views.pinnedDone')} aria-label={t(v.pinned ? 'sp.views.unpin' : 'sp.views.pin', { name: v.name })} title={t(v.pinned ? 'sp.views.unpin' : 'sp.views.pin', { name: v.name })}>
        {v.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
      </button>
      {canEdit(v) && (
        <>
          <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink" onClick={() => void patch(v, { id: v.id, params: current, ...(settings ? { columns: settings.prefs } : {}) }, 'sp.views.updated')} aria-label={t('sp.views.update', { name: v.name })} title={t('sp.views.update', { name: v.name })}>
            <RefreshCw className="size-3.5" aria-hidden />
          </button>
          <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink" onClick={() => void patch(v, { id: v.id, shared: !v.shared }, v.shared ? 'sp.views.unsharedDone' : 'sp.views.sharedDone')} aria-label={t(v.shared ? 'sp.views.unshare' : 'sp.views.share', { name: v.name })} title={t(v.shared ? 'sp.views.unshare' : 'sp.views.share', { name: v.name })}>
            {v.shared ? <Users className="size-3.5" aria-hidden /> : <Share2 className="size-3.5" aria-hidden />}
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded text-muted hover:bg-line/60 hover:text-ink"
            onClick={() => {
              setOpen(false);
              setDialog({ edit: v });
            }}
            aria-label={t('sp.views.rename', { name: v.name })}
            title={t('sp.views.rename', { name: v.name })}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className="grid size-7 place-items-center rounded text-muted hover:bg-danger-bg hover:text-danger-fg"
            onClick={() => {
              setOpen(false);
              setConfirmDelete(v);
            }}
            aria-label={t('sp.views.delete', { name: v.name })}
            title={t('sp.views.delete', { name: v.name })}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </>
      )}
    </li>
  );

  return (
    <div ref={box} className={clsx('relative', className)} data-tour="sp-views">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'inline-flex min-h-10 max-w-[16rem] shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap transition sm:min-h-9',
          active ? 'border-line-strong bg-sunken text-ink' : 'border-line bg-card text-ink/80 hover:border-line-strong',
        )}
      >
        <Bookmark className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{active ? active.name : t('sp.views.button')}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label={t('sp.views.button')} className="absolute right-0 z-50 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-card p-2 shadow-[var(--tv-shadow-overlay)]">
          {views.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted">{t('sp.views.empty')}</p>}
          {mine.length > 0 && (
            <>
              <p className="type-overline px-2 pt-1 pb-1">{t('sp.views.mine')}</p>
              <ul className="space-y-0.5">
                {mine.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </ul>
            </>
          )}
          {team.length > 0 && (
            <>
              <p className="type-overline px-2 pt-2 pb-1">{t('sp.views.team')}</p>
              <ul className="space-y-0.5">
                {team.map((v) => (
                  <Row key={v.id} v={v} />
                ))}
              </ul>
            </>
          )}
          <div className="mt-2 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDialog({ edit: null });
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold text-link hover:bg-primary/[0.06]"
            >
              <BookmarkPlus className="size-4" aria-hidden /> {t('sp.views.saveCurrent')}
            </button>
          </div>
        </div>
      )}
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

/** Pinned views of a list page, as a small sub-list under its sidebar item (no restructuring of the sidebar). */
export const SidebarPinnedViews = ({ navId, onNavigate }: { navId: string; onNavigate?: () => void }) => {
  const location = useLocation();
  const page = VIEW_PAGES.find((p) => PAGE_ROUTE[p].navId === navId);
  const { data } = useSavedViews();
  if (!page) return null;
  const pinned = (data ?? []).filter((v) => v.page === page && v.pinned);
  if (!pinned.length) return null;
  const current = new URLSearchParams(location.search).get('sv');
  return (
    <ul className="mt-0.5 mb-1 ml-[1.15rem] space-y-0.5 border-l border-line pl-2" data-tour="sp-pinned-views">
      {pinned.map((v) => {
        const on = current === v.id && location.pathname === PAGE_ROUTE[page].to;
        return (
          <li key={v.id}>
            <Link
              to={viewHref(v)}
              onClick={onNavigate}
              aria-current={on ? 'page' : undefined}
              className={clsx('flex min-h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors pointer-coarse:min-h-9', on ? 'bg-card font-medium text-ink ring-1 ring-line' : 'text-muted hover:bg-line/60 hover:text-ink')}
            >
              {v.shared ? <Users className="size-3 shrink-0" aria-hidden /> : <Bookmark className="size-3 shrink-0" aria-hidden />}
              <span className="truncate">{v.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
