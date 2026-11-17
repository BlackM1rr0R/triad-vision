import { useEffect, useId, useState, type DragEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesToolsHub } from '@/i18n/pagesToolsHub';
import { Panel } from '@/components/admin/ui';
import { FEATURED_QUERY_KEY, toolByPath } from './toolMeta';

registerCopy(pagesToolsHub);

/** GET / PUT /api/admin/tool-analytics/featured (server lib/featuredTools.ts). */
interface FeaturedAdmin {
  paths: string[];
  custom: boolean;
  available: string[];
  defaults: string[];
}

const MAX = 8;

/**
 * Admin: the "most useful" tools of /tools and the header tools menu, in order. Drag rows (or use the arrow
 * buttons) to reorder, add from the list of tool pages, "suggest from analytics" takes the most viewed tools of
 * the period shown on the page. Saving needs ADMIN (staff see it read-only).
 */
export const FeaturedToolsEditor = ({ topSlugs }: { topSlugs: string[] }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const addId = useId();
  const { data } = useQuery({
    queryKey: ['admin-tools-featured'],
    queryFn: async () => (await api.get<FeaturedAdmin>('/admin/tool-analytics/featured')).data,
  });
  const [list, setList] = useState<string[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  useEffect(() => {
    if (data) setList(data.paths);
  }, [data]);

  const save = useMutation({
    mutationFn: async (paths: string[]) => (await api.put<FeaturedAdmin>('/admin/tool-analytics/featured', { paths })).data,
    onSuccess: (res) => {
      qc.setQueryData(['admin-tools-featured'], res);
      void qc.invalidateQueries({ queryKey: FEATURED_QUERY_KEY });
      setList(res.paths);
      toast.success(t('toolsHub.admin.saved'));
    },
    onError: () => toast.error(t('common.error', { defaultValue: 'Error' })),
  });

  const label = (p: string) => {
    const tool = toolByPath(p);
    return tool ? t(tool.titleKey) : p;
  };
  const known = (data?.available ?? []).filter((p) => toolByPath(p));
  const addable = known.filter((p) => !list.includes(p)).sort((a, b) => label(a).localeCompare(label(b)));
  const dirty = !!data && list.join('|') !== data.paths.join('|');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setList(next);
  };

  const suggestion = topSlugs.map((s) => `/${s}`).filter((p) => known.includes(p)).slice(0, 6);

  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault();
    if (dragging !== null) move(dragging, to);
    setDragging(null);
  };

  return (
    <Panel
      title={t('toolsHub.admin.title')}
      actions={
        data && (
          <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', data.custom ? 'bg-highlight-bg text-ink' : 'bg-sunken text-muted')}>
            {data.custom ? t('toolsHub.admin.custom') : t('toolsHub.admin.default')}
          </span>
        )
      }
    >
      <p className="text-sm text-muted">{t('toolsHub.admin.text')}</p>
      {!canEdit && <p className="mt-2 text-xs text-muted">{t('toolsHub.admin.forbidden')}</p>}

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-muted">{t('toolsHub.admin.empty')}</p>
      ) : (
        <ol className="mt-4 grid gap-1.5">
          {list.map((p, i) => (
            <li
              key={p}
              draggable={canEdit}
              onDragStart={() => setDragging(i)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => canEdit && e.preventDefault()}
              onDrop={(e) => onDrop(e, i)}
              className={clsx('flex items-center gap-2 rounded-xl border border-line bg-card px-2 py-1.5', dragging === i && 'opacity-50', canEdit && 'cursor-grab')}
            >
              {canEdit && <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />}
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{label(p)}</span>
                <span className="block truncate text-[11px] text-muted">{p}</span>
              </span>
              {canEdit && (
                <span className="flex shrink-0 items-center">
                  <IconButton label={t('toolsHub.admin.up')} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton label={t('toolsHub.admin.down')} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton label={t('toolsHub.admin.remove')} onClick={() => setList(list.filter((x) => x !== p))}>
                    <X className="size-4" aria-hidden />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label htmlFor={addId} className="sr-only">
            {t('toolsHub.admin.add')}
          </label>
          <select
            id={addId}
            className="input h-9 w-64 max-w-full"
            value=""
            disabled={list.length >= MAX || !addable.length}
            onChange={(e) => e.target.value && setList([...list, e.target.value])}
          >
            <option value="">{list.length >= MAX ? t('toolsHub.admin.max', { count: MAX }) : t('toolsHub.admin.add')}</option>
            {addable.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken disabled:opacity-50"
            disabled={!suggestion.length}
            title={t('toolsHub.admin.suggestHint', { count: suggestion.length })}
            onClick={() => setList(suggestion)}
          >
            <Sparkles className="size-4" aria-hidden /> {t('toolsHub.admin.suggest')}
          </button>
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-sunken disabled:opacity-50"
            disabled={save.isPending || !data}
            onClick={() => save.mutate([])}
          >
            <RotateCcw className="size-4" aria-hidden /> {t('toolsHub.admin.reset')}
          </button>
          <button type="button" className="btn-primary btn-sm ml-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate(list)}>
            <Save className="size-4" aria-hidden /> {t('toolsHub.admin.save')}
          </button>
        </div>
      )}
    </Panel>
  );
};

const IconButton = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-30">
    {children}
  </button>
);
