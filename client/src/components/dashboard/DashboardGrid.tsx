import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, RotateCcw } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { WIDGET_SIZES, type LayoutItem, type WidgetSize } from './layout';
import type { WidgetContext, WidgetDef } from './widgets';

registerCopy(pagesAdminUx);

/** Column span per size: 1 column on phones, 2 (of 6) on tablets, 12 columns from xl. */
const SPAN: Record<WidgetSize, string> = {
  S: 'md:col-span-3 xl:col-span-4',
  M: 'md:col-span-3 xl:col-span-6',
  L: 'md:col-span-6 xl:col-span-12',
};

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/**
 * Responsive widget grid with an opt-in edit mode: drag a widget onto another to reorder (HTML5 drag and drop;
 * keyboard: the ↑ / ↓ buttons), S / M / L size, hide, and a picker to bring hidden widgets back. While editing,
 * widget content is inert, so Tab only walks the edit controls. Changes are saved at once (useDashboardLayout).
 */
export const DashboardGrid = ({
  items,
  defs,
  ctx,
  editing,
  onChange,
  onReset,
  isCustom,
}: {
  items: LayoutItem[];
  defs: WidgetDef[];
  ctx: WidgetContext;
  editing: boolean;
  onChange: (next: LayoutItem[]) => void;
  onReset: () => void;
  isCustom: boolean;
}) => {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const byId = new Map(defs.map((d) => [d.id, d]));
  const [draft, setDraft] = useState<LayoutItem[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const lastOver = useRef<{ id: string; at: number } | null>(null);
  const list = draft ?? items;
  const visible = list.filter((i) => !i.hidden && byId.has(i.id));
  const hidden = list.filter((i) => i.hidden && byId.has(i.id));
  const title = (id: string) => t(byId.get(id)?.titleKey ?? id);

  useEffect(() => {
    if (!editing) {
      setDraft(null);
      setPickerOpen(false);
    }
  }, [editing]);

  const commit = (next: LayoutItem[]) => {
    setDraft(null);
    onChange(next);
  };

  const shift = (id: string, delta: number) => {
    // Move among the visible widgets; hidden ones keep their slots.
    const vis = visible.map((i) => i.id);
    const pos = vis.indexOf(id);
    const target = vis[pos + delta];
    if (!target) return;
    const from = list.findIndex((i) => i.id === id);
    const to = list.findIndex((i) => i.id === target);
    commit(move(list, from, to));
    setAnnounce(t('ux.dashboard.moved', { title: title(id), pos: pos + delta + 1 }));
    // Keep focus on the same button after the move.
    window.setTimeout(() => document.getElementById(`dw-${delta < 0 ? 'up' : 'down'}-${id}`)?.focus(), 0);
  };
  const setSize = (id: string, size: WidgetSize) => commit(list.map((i) => (i.id === id ? { ...i, size } : i)));
  const setHidden = (id: string, h: boolean) => commit(list.map((i) => (i.id === id ? { ...i, hidden: h || undefined } : i)));

  // ─── Drag and drop ──────────────────────────────────────────────────
  const onDragStart = (e: DragEvent, id: string) => {
    setDragId(id);
    setDraft(list);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const onDragOver = (e: DragEvent, overId: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId === dragId) return;
    const now = Date.now();
    // The layout animation moves widgets under the pointer: ignore the same target for a moment (no flicker).
    if (lastOver.current && lastOver.current.id === overId && now - lastOver.current.at < 400) return;
    lastOver.current = { id: overId, at: now };
    setDraft((cur) => {
      const base = cur ?? list;
      const from = base.findIndex((i) => i.id === dragId);
      const to = base.findIndex((i) => i.id === overId);
      return from < 0 || to < 0 ? base : move(base, from, to);
    });
  };
  const onDragEnd = () => {
    const id = dragId;
    setDragId(null);
    lastOver.current = null;
    if (draft && id) {
      const pos = draft.filter((i) => !i.hidden).findIndex((i) => i.id === id);
      setAnnounce(t('ux.dashboard.moved', { title: title(id), pos: pos + 1 }));
      commit(draft);
    }
  };

  return (
    <div>
      {editing && (
        <div className="mb-4 rounded-xl border border-dashed border-brand-400/70 bg-brand-50/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-ink/80">{t('ux.dashboard.editHint')}</p>
            <button type="button" className="btn-secondary btn-sm" aria-expanded={pickerOpen} aria-controls="dash-picker" onClick={() => setPickerOpen((v) => !v)}>
              <Plus className="size-3.5" aria-hidden /> {t('ux.dashboard.add')}
              {hidden.length > 0 && <span className="badge bg-brand-100 text-brand-700 tabular-nums">{hidden.length}</span>}
            </button>
            {isCustom && (
              <button type="button" className="btn-ghost btn-sm" onClick={onReset}>
                <RotateCcw className="size-3.5" aria-hidden /> {t('ux.dashboard.reset')}
              </button>
            )}
          </div>
          {pickerOpen && (
            <div id="dash-picker" className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ux.dashboard.pickerTitle')}</p>
              {hidden.length === 0 ? (
                <p className="text-xs text-muted">{t('ux.dashboard.pickerEmpty')}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {hidden.map((i) => {
                    const d = byId.get(i.id)!;
                    return (
                      <li key={i.id}>
                        <button type="button" onClick={() => setHidden(i.id, false)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:border-brand-400">
                          <d.icon className="size-3.5 text-muted" aria-hidden />
                          {t(d.titleKey)}
                          <span className="inline-flex items-center gap-1 text-brand-700">
                            <Eye className="size-3.5" aria-hidden /> {t('ux.dashboard.show')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-6 md:grid-cols-6 lg:gap-8 xl:grid-cols-12" aria-label={editing ? t('ux.dashboard.pickerTitle') : undefined}>
        {visible.map((item, idx) => {
          const def = byId.get(item.id)!;
          return (
            <motion.li
              key={item.id}
              layout={reduce ? false : 'position'}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              className={clsx('@container min-w-0', SPAN[item.size])}
            >
              <div
                className={clsx('h-full', editing && 'relative rounded-2xl outline-2 outline-offset-4 outline-dashed', editing && (dragId === item.id ? 'opacity-50 outline-brand-500' : 'outline-brand-300/70'))}
                draggable={editing || undefined}
                onDragStart={editing ? (e) => onDragStart(e, item.id) : undefined}
                onDragOver={editing ? (e) => onDragOver(e, item.id) : undefined}
                onDrop={editing ? (e) => e.preventDefault() : undefined}
                onDragEnd={editing ? onDragEnd : undefined}
              >
                {editing && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-card px-2 py-1.5 shadow-sm">
                    <span className="grid size-8 cursor-grab place-items-center rounded-md text-muted active:cursor-grabbing" title={t('ux.dashboard.drag', { title: t(def.titleKey) })} aria-hidden>
                      <GripVertical className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-900">{t(def.titleKey)}</span>
                    <span role="radiogroup" aria-label={`${t('ux.dashboard.size')}: ${t(def.titleKey)}`} className="inline-flex rounded-md border border-line p-0.5">
                      {WIDGET_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={item.size === s}
                          title={t(`ux.dashboard.sizes.${s}`)}
                          aria-label={t(`ux.dashboard.sizes.${s}`)}
                          onClick={() => setSize(item.id, s)}
                          className={clsx('min-h-7 min-w-7 rounded px-1.5 text-[11px] font-bold transition', item.size === s ? 'bg-navy-900 text-white' : 'text-muted hover:text-navy-900')}
                        >
                          {s}
                        </button>
                      ))}
                    </span>
                    <button id={`dw-up-${item.id}`} type="button" className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-surface hover:text-navy-900 disabled:opacity-30" disabled={idx === 0} onClick={() => shift(item.id, -1)} aria-label={t('ux.dashboard.moveUp', { title: t(def.titleKey) })}>
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button id={`dw-down-${item.id}`} type="button" className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-surface hover:text-navy-900 disabled:opacity-30" disabled={idx === visible.length - 1} onClick={() => shift(item.id, 1)} aria-label={t('ux.dashboard.moveDown', { title: t(def.titleKey) })}>
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button type="button" className="grid size-8 place-items-center rounded-md text-muted transition hover:bg-red-50 hover:text-danger" onClick={() => setHidden(item.id, true)} aria-label={t('ux.dashboard.hide', { title: t(def.titleKey) })}>
                      <EyeOff className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
                <div inert={editing} className={clsx(editing && 'pointer-events-none select-none')}>
                  {def.render(ctx, item.size)}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
};
