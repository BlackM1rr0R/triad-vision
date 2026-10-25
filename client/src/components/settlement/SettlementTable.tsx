import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Link2, Link2Off, Lock, RotateCcw, Unlock } from 'lucide-react';
import type { Column } from './columns';
import { STAGES, type CellValue, type Currency, type Partner, type Row, type Share, type Stage } from './types';
import { STAGE_CHIP, STAGE_DOT, currencyIn, fmtMoney, parseUnits, tintStyle, unitsText } from './money';

/**
 * Lightweight virtualised, Excel-like table of the settlement ledger. Rows are memoised: typing in a cell only
 * re-renders that cell's editor; committing re-renders the one row whose draft changed.
 */

export type ViewRow = Row & { _draft?: Record<string, CellValue> };

export interface TableActions {
  /** Field-level changes of one row (kept as drafts until saved). */
  change: (id: string, changes: { field: string; value: CellValue }[]) => void;
  togglePaid: (id: string, key: string, paid: boolean) => void;
  toggleSelect: (id: string, range: boolean) => void;
  toggleAll: () => void;
  openLink: (row: Row) => void;
  recalc: (id: string) => void;
}

interface Ctx {
  cols: Column[];
  partners: Map<string, Partner>;
  partnerList: Partner[];
  actions: React.MutableRefObject<TableActions>;
  startEdit: (r: number, c: number, initial?: string) => void;
  activate: (r: number, c: number) => void;
  commit: (r: number, c: number, raw: string | null, move: Move) => void;
  cancel: () => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}

type Move = 'down' | 'right' | 'left' | 'up' | null;

const ROW_H = 34;
const HEADER_H = 46;

const fmtDate = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : '');

/** Typed "dd.mm.yyyy", "dd.mm.yy" or ISO → "YYYY-MM-DD"; '' → null; invalid → undefined. */
const parseDate = (s: string): string | null | undefined => {
  const t = s.trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!m) return undefined;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
};

const draftOf = (row: ViewRow, key: string) => (row._draft && key in row._draft ? { has: true, value: row._draft[key] } : { has: false, value: undefined });

/** Text an editor starts with. */
const editText = (row: ViewRow, col: Column): string => {
  const d = draftOf(row, col.key);
  switch (col.kind) {
    case 'text':
      return String((d.has ? d.value : (row as unknown as Record<string, unknown>)[col.key]) ?? '');
    case 'date':
      return String((d.has ? d.value : (row as unknown as Record<string, unknown>)[col.key]) ?? '');
    case 'money':
    case 'partnerShare': {
      const v = (row as unknown as Record<string, number | null>)[col.key];
      return unitsText(v);
    }
    case 'share': {
      if (d.has) return d.value == null ? '' : String(d.value);
      const s = row.shares[col.beneficiaryId!];
      if (!s) return '';
      if (s.text) return s.text;
      return s.manual ? unitsText(s.cents) : '';
    }
    default:
      return '';
  }
};

// ─── Cells ─────────────────────────────────────────────────────────────

const Editor = ({ initial, kind, onCommit, onCancel }: { initial: string; kind: 'text' | 'date' | 'number'; onCommit: (v: string, move: Move) => void; onCancel: () => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    if (kind !== 'date') el.setSelectionRange(el.value.length, el.value.length);
  }, [kind]);
  const finish = (move: Move) => {
    if (done.current) return;
    done.current = true;
    onCommit(ref.current?.value ?? '', move);
  };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      type={kind === 'date' ? 'date' : 'text'}
      inputMode={kind === 'number' ? 'decimal' : undefined}
      className="absolute inset-0 z-10 w-full min-w-0 border-2 border-primary bg-field px-2 text-sm text-ink outline-none"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.shiftKey ? 'up' : 'down');
        } else if (e.key === 'Tab') {
          e.preventDefault();
          finish(e.shiftKey ? 'left' : 'right');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={() => finish(null)}
    />
  );
};

const SelectEditor = ({ value, options, onCommit, onCancel }: { value: string; options: { value: string; label: string }[]; onCommit: (v: string, move: Move) => void; onCancel: () => void }) => {
  const ref = useRef<HTMLSelectElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    try {
      (ref.current as HTMLSelectElement & { showPicker?: () => void })?.showPicker?.();
    } catch {
      /* not allowed without a user gesture in some browsers */
    }
  }, []);
  return (
    <select
      ref={ref}
      defaultValue={value}
      className="absolute inset-0 z-10 w-full min-w-0 border-2 border-primary bg-field px-1 text-sm text-ink outline-none"
      onChange={(e) => {
        done.current = true;
        onCommit(e.target.value, null);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          done.current = true;
          onCancel();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          done.current = true;
          onCommit((e.target as HTMLSelectElement).value, e.key === 'Tab' ? (e.shiftKey ? 'left' : 'right') : 'down');
        }
      }}
      onBlur={() => {
        if (!done.current) onCancel();
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

const PaidToggle = ({ paid, onToggle, title }: { paid: boolean; onToggle: () => void; title: string }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    aria-pressed={paid}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    className={clsx(
      'grid size-4 shrink-0 place-items-center rounded border transition',
      paid ? 'border-success bg-success text-white' : 'border-line bg-field text-transparent hover:border-success',
    )}
  >
    <Check className="size-3" strokeWidth={3} />
  </button>
);

const ShareView = ({ share, draft, onToggle, t }: { share: Share | null; draft: { has: boolean; value: CellValue | undefined }; onToggle: (paid: boolean) => void; t: Ctx['t'] }) => {
  if (draft.has) return <span className="truncate italic text-muted">{draft.value == null || draft.value === '' ? '…' : String(draft.value)}</span>;
  if (!share) return null;
  if (share.text)
    return (
      <span title={t('settlement.rawotHint')} className="rounded bg-muted/15 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
        {share.text}
      </span>
    );
  return (
    <span className="flex min-w-0 items-center justify-end gap-1.5">
      {share.manual && <span title={t('settlement.manual')} className="size-1.5 shrink-0 rounded-full bg-primary" />}
      <span className={clsx('truncate tabular-nums', share.status === 'PAID' && 'text-success-fg')}>{fmtMoney(share.cents, share.currency)}</span>
      {share.cents !== 0 && <PaidToggle paid={share.status === 'PAID'} title={t(share.status === 'PAID' ? 'settlement.markUnpaid' : 'settlement.markPaid')} onToggle={() => onToggle(share.status !== 'PAID')} />}
    </span>
  );
};

interface RowProps {
  row: ViewRow;
  index: number;
  start: number;
  width: number;
  selected: boolean;
  activeCol: number;
  editing: boolean;
  editInitial: string | undefined;
  ctx: Ctx;
}

const TableRow = memo(function TableRow({ row, index, start, width, selected, activeCol, editing, editInitial, ctx }: RowProps) {
  const { cols, t } = ctx;
  const tint = tintStyle(row.stage);
  return (
    <div role="row" aria-rowindex={index + 2} className="absolute left-0 flex border-b border-line/70 text-sm text-ink" style={{ top: 0, transform: `translateY(${start}px)`, height: ROW_H, width, ...tint }}>
      {cols.map((col, ci) => {
        const active = ci === activeCol;
        const d = draftOf(row, col.key);
        const style: CSSProperties = { width: col.width, minWidth: col.width };
        if (col.stickyLeft != null) Object.assign(style, { position: 'sticky', left: col.stickyLeft, zIndex: 2 }, tint);
        const cellClass = clsx(
          'relative flex h-full items-center border-r border-line/60 px-2',
          col.align === 'right' && 'justify-end text-right',
          col.align === 'center' && 'justify-center text-center',
          d.has && 'bg-warning/25',
          active && 'outline-2 -outline-offset-2 outline-focus',
          selected && col.key === '_select' && 'bg-primary/10',
        );
        let content: React.ReactNode = null;
        const rec = row as unknown as Record<string, unknown>;
        if (editing && active) {
          const commit = (v: string, move: Move) => ctx.commit(index, ci, v, move);
          if (col.kind === 'partner')
            content = <SelectEditor value={row.partnerId ?? ''} options={[{ value: '', label: '—' }, ...ctx.partnerList.filter((p) => p.active || p.id === row.partnerId).map((p) => ({ value: p.id, label: p.name }))]} onCommit={commit} onCancel={ctx.cancel} />;
          else if (col.kind === 'currency') content = <SelectEditor value={String(rec[col.key] ?? 'AZN')} options={['AZN', 'EUR'].map((c) => ({ value: c, label: c }))} onCommit={commit} onCancel={ctx.cancel} />;
          else if (col.kind === 'stage') content = <SelectEditor value={row.stage} options={STAGES.map((s) => ({ value: s, label: t(`settlement.stage.${s}`) }))} onCommit={commit} onCancel={ctx.cancel} />;
          else content = <Editor initial={editInitial ?? editText(row, col)} kind={col.kind === 'date' ? 'date' : col.kind === 'text' ? 'text' : 'number'} onCommit={commit} onCancel={ctx.cancel} />;
        } else {
          switch (col.kind) {
            case 'check':
              content = (
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  checked={selected}
                  aria-label={t('settlement.cols.select')}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => ctx.actions.current.toggleSelect(row.id, (e.nativeEvent as MouseEvent).shiftKey)}
                />
              );
              break;
            case 'partner':
              content = <span className="truncate">{row.partnerId ? (ctx.partners.get(row.partnerId)?.name ?? '?') : ''}</span>;
              break;
            case 'text':
              content = <span className={clsx('truncate', col.key === 'clientName' && 'font-semibold')} title={String(rec[col.key] ?? '')}>{String(rec[col.key] ?? '')}</span>;
              break;
            case 'date':
              content = <span className="tabular-nums">{fmtDate((rec[col.key] as string | null) ?? null)}</span>;
              break;
            case 'stage':
              content = (
                <span className="flex min-w-0 items-center gap-1">
                  <span className={clsx('inline-flex min-w-0 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold', STAGE_CHIP[row.stage])}>
                    <span className={clsx('size-1.5 shrink-0 rounded-full', STAGE_DOT[row.stage])} />
                    {t(`settlement.stage.${row.stage}`)}
                  </span>
                  {row.caseId && (
                    <button
                      type="button"
                      title={t(row.stageAuto ? 'settlement.stageAuto' : 'settlement.stageManual')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        ctx.actions.current.change(row.id, [{ field: 'stageAuto', value: !row.stageAuto }]);
                      }}
                      className="shrink-0 text-muted hover:text-link"
                    >
                      {row.stageAuto ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                    </button>
                  )}
                </span>
              );
              break;
            case 'money': {
              const cur = (rec[col.currencyField ?? 'currency'] as Currency) ?? 'AZN';
              content = <span className="truncate tabular-nums">{fmtMoney(rec[col.key] as number | null, cur)}</span>;
              break;
            }
            case 'currency':
              content = <span className="text-xs font-semibold text-muted">{String(rec[col.key] ?? '')}</span>;
              break;
            case 'bool':
              content = (
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  checked={!!rec[col.key]}
                  aria-label={col.label}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => ctx.actions.current.change(row.id, [{ field: col.key, value: e.target.checked }])}
                />
              );
              break;
            case 'partnerShare':
              content = (
                <span className="flex min-w-0 items-center justify-end gap-1.5">
                  <span className={clsx('truncate tabular-nums', row.partnerPaid && 'text-success-fg')}>{fmtMoney(row.partnerShareCents, row.partnerShareCurrency)}</span>
                  {!!row.partnerShareCents && !!row.partnerId && !row._draft?.partnerShareCents && (
                    <PaidToggle paid={row.partnerPaid} title={t('settlement.partnerPaid')} onToggle={() => ctx.actions.current.togglePaid(row.id, '_partner', !row.partnerPaid)} />
                  )}
                </span>
              );
              break;
            case 'share':
              content = <ShareView share={row.shares[col.beneficiaryId!] ?? null} draft={d} t={t} onToggle={(paid) => ctx.actions.current.togglePaid(row.id, col.beneficiaryId!, paid)} />;
              break;
            case 'actions':
              content = (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title={row.case ? t('settlement.link.linkedTo', { number: row.case.number }) : t('settlement.link.icon')}
                    aria-label={t('settlement.link.icon')}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.actions.current.openLink(row);
                    }}
                    className={clsx('rounded p-0.5 hover:bg-primary/10', row.caseId ? 'text-link' : 'text-muted')}
                  >
                    {row.caseId ? <Link2 className="size-4" /> : <Link2Off className="size-4" />}
                  </button>
                  <button
                    type="button"
                    title={t('settlement.toolbar.recalc')}
                    aria-label={t('settlement.toolbar.recalc')}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.actions.current.recalc(row.id);
                    }}
                    className="rounded p-0.5 text-muted hover:bg-primary/10 hover:text-link"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </span>
              );
              break;
          }
        }
        return (
          <div
            key={col.key}
            role="gridcell"
            className={cellClass}
            style={style}
            onMouseDown={() => ctx.activate(index, ci)}
            onDoubleClick={() => col.editable && ctx.startEdit(index, ci)}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
});

// ─── Table ─────────────────────────────────────────────────────────────

export interface SettlementTableProps {
  rows: ViewRow[];
  cols: Column[];
  partners: Partner[];
  selected: Set<string>;
  allSelected: boolean;
  totals: Record<string, string>;
  actions: TableActions;
  emptyText: string;
}

/** Converts what was typed into a cell into field changes (null = invalid, nothing to save). */
const toChanges = (row: ViewRow, col: Column, raw: string): { field: string; value: CellValue }[] | null => {
  switch (col.kind) {
    case 'text':
      return [{ field: col.key, value: raw.trim() || null }];
    case 'date': {
      const v = parseDate(raw);
      return v === undefined ? null : [{ field: col.key, value: v }];
    }
    case 'partner':
      return [{ field: 'partnerId', value: raw || null }];
    case 'currency':
      return raw === 'AZN' || raw === 'EUR' ? [{ field: col.key, value: raw }] : null;
    case 'stage':
      return (STAGES as string[]).includes(raw) ? [{ field: 'stage', value: raw as Stage }] : null;
    case 'money':
    case 'partnerShare': {
      const cents = parseUnits(raw);
      if (Number.isNaN(cents)) return null;
      const out: { field: string; value: CellValue }[] = [{ field: col.key, value: cents }];
      const cur = currencyIn(raw);
      const rec = row as unknown as Record<string, unknown>;
      if (cur && col.currencyField && col.key !== 'paidCents' && col.key !== 'expensesCents' && rec[col.currencyField] !== cur) out.push({ field: col.currencyField, value: cur });
      return out;
    }
    case 'share': {
      const t = raw.trim();
      if (!t) return [{ field: col.key, value: null }];
      if (t.toLowerCase() === 'rawot') return [{ field: col.key, value: 'rawot' }];
      const cents = parseUnits(t);
      if (cents == null || Number.isNaN(cents)) return null;
      const cur = currencyIn(t) ?? row.shares[col.beneficiaryId!]?.currency ?? row.currency;
      return [{ field: col.key, value: `${cents / 100} ${cur}` }];
    }
    default:
      return null;
  }
};

export const SettlementTable = ({ rows, cols, partners, selected, allSelected, totals, actions, emptyText }: SettlementTableProps) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState<{ initial?: string } | null>(null);
  const editingRef = useRef(false);
  editingRef.current = !!editing;
  const activeRef = useRef(active);
  activeRef.current = active;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const width = useMemo(() => cols.reduce((a, c) => a + c.width, 0), [cols]);
  const partnerMap = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
    scrollMargin: HEADER_H,
  });

  /** Back to the grid for keyboard navigation — unless the user moved focus elsewhere (search box, dialog…). */
  const focusGrid = () =>
    requestAnimationFrame(() => {
      const ae = document.activeElement;
      if (!ae || ae === document.body || scrollRef.current?.contains(ae)) scrollRef.current?.focus({ preventScroll: true });
    });

  const reveal = useCallback(
    (r: number, c: number) => {
      virtualizer.scrollToIndex(r, { align: 'auto' });
      const el = scrollRef.current;
      if (!el) return;
      let left = 0;
      for (let i = 0; i < c; i++) left += cols[i]!.width;
      const stickyW = cols.filter((x) => x.stickyLeft != null).reduce((a, x) => a + x.width, 0);
      const w = cols[c]?.width ?? 0;
      if (cols[c]?.stickyLeft != null) return;
      if (left - stickyW < el.scrollLeft) el.scrollLeft = left - stickyW;
      else if (left + w > el.scrollLeft + el.clientWidth) el.scrollLeft = left + w - el.clientWidth;
    },
    [cols, virtualizer],
  );

  const move = useCallback(
    (from: { r: number; c: number }, dir: Move) => {
      if (!dir) return from;
      const maxR = rowsRef.current.length - 1;
      let { r, c } = from;
      if (dir === 'down') r = Math.min(maxR, r + 1);
      if (dir === 'up') r = Math.max(0, r - 1);
      if (dir === 'right') c = Math.min(cols.length - 1, c + 1);
      if (dir === 'left') c = Math.max(0, c - 1);
      const next = { r, c };
      setActive(next);
      reveal(r, c);
      return next;
    },
    [cols.length, reveal],
  );

  const ctx = useMemo<Ctx>(
    () => ({
      cols,
      partners: partnerMap,
      partnerList: partners,
      actions: actionsRef,
      t: (k, o) => String(t(k, o as never)),
      activate: (r, c) => {
        const a = activeRef.current;
        if (editingRef.current && a && a.r === r && a.c === c) return; // click inside the open editor
        // Another cell clicked while editing: blur first so the editor commits what was typed.
        if (editingRef.current) (document.activeElement as HTMLElement | null)?.blur?.();
        setActive((x) => (x && x.r === r && x.c === c ? x : { r, c }));
        setEditing(null);
        focusGrid();
      },
      startEdit: (r, c, initial) => {
        const col = cols[c];
        if (!col?.editable || col.kind === 'bool' || col.kind === 'check' || col.kind === 'actions') return;
        setActive({ r, c });
        setEditing({ initial });
      },
      cancel: () => {
        setEditing(null);
        focusGrid();
      },
      commit: (r, c, raw, dir) => {
        const row = rowsRef.current[r];
        const col = cols[c];
        setEditing(null);
        if (row && col && raw != null) {
          const rec = row as unknown as Record<string, unknown>;
          const before = col.kind === 'partner' ? (row.partnerId ?? '') : col.kind === 'currency' || col.kind === 'stage' ? String(rec[col.key] ?? '') : editText(row, col);
          const changed = raw !== before;
          if (changed) {
            const ch = toChanges(row, col, raw);
            if (ch) actionsRef.current.change(row.id, ch);
          }
        }
        if (dir) move({ r, c }, dir);
        focusGrid();
      },
    }),
    [cols, partnerMap, partners, t, move],
  );

  // Keep the active cell inside the table when rows / columns change.
  useEffect(() => {
    setActive((a) => (a && (a.r >= rows.length || a.c >= cols.length) ? null : a));
  }, [rows.length, cols.length]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editing || !active) return;
    const row = rows[active.r];
    const col = cols[active.c];
    if (!row || !col) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      move(active, k === 'ArrowDown' ? 'down' : k === 'ArrowUp' ? 'up' : k === 'ArrowLeft' ? 'left' : 'right');
    } else if (k === 'Tab') {
      e.preventDefault();
      move(active, e.shiftKey ? 'left' : 'right');
    } else if (k === 'Enter' || k === 'F2') {
      e.preventDefault();
      if (col.kind === 'bool') actions.change(row.id, [{ field: col.key, value: !(row as unknown as Record<string, unknown>)[col.key] }]);
      else if (col.kind === 'check') actions.toggleSelect(row.id, false);
      else if (col.editable && col.kind !== 'actions') setEditing({});
    } else if (k === ' ' && (col.kind === 'bool' || col.kind === 'check')) {
      e.preventDefault();
      if (col.kind === 'check') actions.toggleSelect(row.id, e.shiftKey);
      else actions.change(row.id, [{ field: col.key, value: !(row as unknown as Record<string, unknown>)[col.key] }]);
    } else if ((k === 'Delete' || k === 'Backspace') && col.editable && ['text', 'date', 'money', 'partnerShare', 'share', 'partner'].includes(col.kind)) {
      e.preventDefault();
      if (col.key === 'clientName') return;
      const ch = col.kind === 'partner' ? [{ field: 'partnerId', value: null }] : col.key === 'paidCents' ? [{ field: col.key, value: 0 }] : [{ field: col.key, value: null }];
      actions.change(row.id, ch);
    } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && col.editable && ['text', 'money', 'partnerShare', 'share', 'date'].includes(col.kind)) {
      e.preventDefault();
      setEditing({ initial: col.kind === 'date' ? undefined : k });
    }
  };

  const items = virtualizer.getVirtualItems();
  const stickyHeader = (col: Column): CSSProperties => (col.stickyLeft != null ? { position: 'sticky', left: col.stickyLeft, zIndex: 3, backgroundColor: 'var(--color-surface)' } : {});

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-rowcount={rows.length + 1}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="relative h-full min-h-0 w-full overflow-auto overscroll-contain rounded-xl border border-line bg-card outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
    >
      {/* Header */}
      <div role="row" className="sticky top-0 z-20 flex border-b border-line bg-sunken text-xs font-semibold text-muted" style={{ width, height: HEADER_H }}>
        {cols.map((col) => (
          <div
            key={col.key}
            role="columnheader"
            className={clsx('flex flex-col justify-center border-r border-line/70 px-2 leading-tight', col.align === 'right' && 'items-end text-right', col.align === 'center' && 'items-center text-center')}
            style={{ width: col.width, minWidth: col.width, ...stickyHeader(col) }}
            title={col.group ? `${col.group} · ${col.label}` : col.label}
          >
            {col.kind === 'check' ? (
              <input type="checkbox" className="size-4 cursor-pointer accent-primary" checked={allSelected} aria-label={t('settlement.cols.select')} onChange={() => actions.toggleAll()} />
            ) : (
              <>
                {col.group && <span className="truncate text-[10px] font-medium tracking-wide text-muted uppercase">{col.group}</span>}
                <span className="truncate text-ink/80">{col.label}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="relative" style={{ height: virtualizer.getTotalSize(), width }}>
        {items.map((it) => {
          const row = rows[it.index]!;
          const isActiveRow = active?.r === it.index;
          return (
            <TableRow
              key={row.id}
              row={row}
              index={it.index}
              start={it.start - HEADER_H}
              width={width}
              selected={selected.has(row.id)}
              activeCol={isActiveRow ? active!.c : -1}
              editing={isActiveRow && !!editing}
              editInitial={isActiveRow ? editing?.initial : undefined}
              ctx={ctx}
            />
          );
        })}
        {!rows.length && <div className="sticky left-0 grid h-32 place-items-center text-sm text-muted" style={{ width: scrollRef.current?.clientWidth ?? '100%' }}>{emptyText}</div>}
      </div>

      {/* Totals */}
      <div role="row" className="sticky bottom-0 z-20 flex border-t-2 border-line bg-sunken text-xs font-bold text-ink" style={{ width, height: ROW_H }}>
        {cols.map((col) => (
          <div
            key={col.key}
            className={clsx('flex items-center overflow-hidden border-r border-line/70 px-2 whitespace-nowrap tabular-nums', col.align === 'right' && 'justify-end', col.align === 'center' && 'justify-center')}
            style={{ width: col.width, minWidth: col.width, ...stickyHeader(col) }}
            title={totals[col.key]}
          >
            <span className="truncate">{totals[col.key] ?? ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
