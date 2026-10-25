import { memo, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import type { TableBlock } from './api';

const MAX_COLS = 20;
const MAX_ROWS = 2000;

/** A cell: a textarea that grows with its content. */
const Cell = ({ value, header, onChange, label }: { value: string; header: boolean; onChange: (v: string) => void; label: string }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={clsx('block w-full resize-none overflow-hidden bg-transparent px-2 py-1.5 text-sm text-ink outline-none focus:bg-primary/[0.04] dark:focus:bg-white/5', header && 'font-semibold')}
    />
  );
};

/** Simple table block: editable cells, header row on/off, rows and columns added or removed at the end. */
export const TableEditor = memo(function TableEditor({ block, onChange, onFocus }: { block: TableBlock; onChange: (id: string, b: TableBlock) => void; onFocus: (id: string) => void }) {
  const { t } = useTranslation();
  const cols = Math.max(1, ...block.rows.map((r) => r.length));
  const rows = block.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
  const header = block.header !== false;
  const set = (rowsNext: string[][], h = header) => onChange(block.id, { ...block, rows: rowsNext, header: h });
  const btn = 'inline-flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 text-xs font-medium text-ink hover:bg-sunken disabled:opacity-40';

  return (
    <div className="group/table" onFocus={() => onFocus(block.id)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className={clsx(header && ri === 0 && 'bg-primary/[0.06] dark:bg-white/5')}>
                {r.map((c, ci) => (
                  <td key={ci} className="min-w-20 border border-line p-0 align-top">
                    <Cell
                      value={c}
                      header={header && ri === 0}
                      label={`${ri + 1}:${ci + 1}`}
                      onChange={(v) => set(rows.map((row, i) => (i === ri ? row.map((x, j) => (j === ci ? v : x)) : row)))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 opacity-70 transition group-focus-within/table:opacity-100 group-hover/table:opacity-100">
        <button type="button" className={btn} disabled={rows.length >= MAX_ROWS} onClick={() => set([...rows, Array(cols).fill('')])}>
          <Plus className="size-3.5" /> {t('docCreate.editor.table.addRow')}
        </button>
        <button type="button" className={btn} disabled={cols >= MAX_COLS} onClick={() => set(rows.map((r) => [...r, '']))}>
          <Plus className="size-3.5" /> {t('docCreate.editor.table.addCol')}
        </button>
        <button type="button" className={btn} disabled={rows.length <= 1} onClick={() => set(rows.slice(0, -1))}>
          <Minus className="size-3.5" /> {t('docCreate.editor.table.delRow')}
        </button>
        <button type="button" className={btn} disabled={cols <= 1} onClick={() => set(rows.map((r) => r.slice(0, -1)))}>
          <Minus className="size-3.5" /> {t('docCreate.editor.table.delCol')}
        </button>
        <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" className="size-3.5 accent-primary" checked={header} onChange={(e) => set(rows, e.target.checked)} />
          {t('docCreate.editor.table.header')}
        </label>
      </div>
    </div>
  );
});
