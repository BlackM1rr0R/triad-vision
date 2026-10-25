import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Sheet } from './model';
import { ContextMenu } from './Popups';

/** Excel-like sheet tabs: switch, add, rename (double-click), delete, reorder (drag or menu). */
export function SheetTabs({
  sheets,
  active,
  readOnly,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onMove,
  isValidName,
}: {
  sheets: Sheet[];
  active: number;
  readOnly?: boolean;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRename: (key: string, name: string) => void;
  onDelete: (key: string) => void;
  onMove: (key: string, to: number) => void;
  isValidName: (name: string, exceptKey: string) => boolean;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<{ key: string; value: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; i: number } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const finishRename = (commit: boolean) => {
    if (renaming && commit && isValidName(renaming.value, renaming.key)) onRename(renaming.key, renaming.value);
    setRenaming(null);
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-t border-line bg-sunken px-2 py-1" role="tablist" aria-label={t('sheet.tabs.label')}>
      {!readOnly && (
        <button type="button" onClick={onAdd} title={t('sheet.tabs.add')} aria-label={t('sheet.tabs.add')} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-card hover:text-ink">
          <Plus size={16} />
        </button>
      )}
      {sheets.map((s, i) =>
        renaming?.key === s.key ? (
          <input
            key={s.key}
            autoFocus
            value={renaming.value}
            maxLength={31}
            onChange={(e) => setRenaming({ key: s.key, value: e.target.value })}
            onBlur={() => finishRename(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishRename(true);
              if (e.key === 'Escape') finishRename(false);
            }}
            className={clsx('h-7 w-36 rounded-md border bg-card px-2 text-sm text-ink outline-none', isValidName(renaming.value, s.key) ? 'border-primary' : 'border-danger')}
          />
        ) : (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={i === active}
            draggable={!readOnly}
            onDragStart={(e) => {
              setDragKey(s.key);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (dragKey && dragKey !== s.key) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragKey) onMove(dragKey, i);
              setDragKey(null);
            }}
            onDragEnd={() => setDragKey(null)}
            onClick={() => onSelect(i)}
            onDoubleClick={() => !readOnly && setRenaming({ key: s.key, value: s.name })}
            onContextMenu={(e) => {
              e.preventDefault();
              onSelect(i);
              if (!readOnly) setMenu({ x: e.clientX, y: e.clientY, i });
            }}
            className={clsx(
              'h-7 shrink-0 rounded-md px-3 text-sm whitespace-nowrap transition',
              i === active ? 'bg-card font-semibold text-link shadow-[var(--tv-shadow-card)] ring-1 ring-line' : 'text-muted hover:bg-card/70 hover:text-ink',
              dragKey === s.key && 'opacity-50',
            )}
          >
            {s.name}
          </button>
        ),
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('sheet.tabs.rename'), icon: <Pencil size={14} />, onClick: () => setRenaming({ key: sheets[menu.i].key, value: sheets[menu.i].name }) },
            { label: t('sheet.tabs.moveLeft'), icon: <ChevronLeft size={14} />, disabled: menu.i === 0, onClick: () => onMove(sheets[menu.i].key, menu.i - 1) },
            { label: t('sheet.tabs.moveRight'), icon: <ChevronRight size={14} />, disabled: menu.i === sheets.length - 1, onClick: () => onMove(sheets[menu.i].key, menu.i + 1) },
            { separator: true },
            {
              label: t('sheet.tabs.delete'),
              icon: <Trash2 size={14} />,
              danger: true,
              disabled: sheets.length <= 1,
              onClick: () => {
                // TODO(ui): ConfirmDialog
                if (window.confirm(t('sheet.tabs.confirmDelete', { name: sheets[menu.i].name }))) onDelete(sheets[menu.i].key);
              },
            },
          ]}
        />
      )}
    </div>
  );
}
