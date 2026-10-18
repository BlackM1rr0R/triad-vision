import type { ReactNode } from 'react';
import type { CellStyle, CellValue, Pos, StructOp } from './model';

/** Column of the grid: a plain letter column in sheet mode, a typed, labelled field in table mode. */
export interface ColumnDef {
  /** Header text (table mode); sheet mode shows the column letter. */
  label?: string;
  width: number;
  type?: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  /** Choices of a select column. */
  options?: { value: string; label: string }[];
  readOnly?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Tooltip of the header. */
  title?: string;
}

/**
 * What the grid shows. Indices are DATA rows / columns; the grid maps them to view positions itself
 * (filters, view sorting). Everything is read on demand, so huge sheets stay cheap.
 */
export interface GridSource {
  rowCount: number;
  colCount: number;
  column(c: number): ColumnDef;
  /** Text for the editor and the formula bar (formulas with "="). */
  raw(r: number, c: number): string;
  /** Formatted text shown in the cell. */
  display(r: number, c: number): string;
  /** Typed (computed) value for sorting and the status bar. */
  value(r: number, c: number): CellValue;
  style?(r: number, c: number): CellStyle | undefined;
  readOnly?(r: number, c: number): boolean;
  /** Extra classes (pending edit, error…). */
  cellClass?(r: number, c: number): string | undefined;
  cellTitle?(r: number, c: number): string | undefined;
  /** Custom cell content (e.g. a link); the text is still used for copy / find. */
  renderCell?(r: number, c: number): ReactNode | undefined;
  /** Row header text (default: data row + 1 in sheet mode, view row + 1 in table mode). */
  rowLabel?(r: number, viewIndex: number): string;
  rowClass?(r: number): string | undefined;
  /** Lower-case text of the whole row for the quick filter (default: every displayed cell, on each search). */
  searchText?(r: number): string;
  /** Merged areas (sheet mode, display only): master "r:c" → span, covered "r:c" → master. */
  merges?: { masters: Map<string, { r0: number; c0: number; r1: number; c1: number }>; covered: Map<string, Pos> };
}

export interface CellChange {
  r: number;
  c: number;
  raw: string;
}

export interface GridProps {
  source: GridSource;
  mode: 'sheet' | 'table';
  frozenRows?: number;
  readOnly?: boolean;
  /** Writes typed by the user (editor, paste, clear, checkbox toggles). */
  onCommit(changes: CellChange[]): void;
  onFormat?(cells: Pos[], patch: Partial<CellStyle>): void;
  onStructure?(op: StructOp): void;
  /** Sheet mode: physical sort of the rows below the frozen ones. Table mode sorts the view itself. */
  onSort?(c: number, dir: 'asc' | 'desc'): void;
  onColWidth?(c: number, width: number): void;
  onUndo?(): void;
  onRedo?(): void;
  canUndo?: boolean;
  canRedo?: boolean;
  onSave?(): void;
  onToggleFreeze?(): void;
  /** Called when the user wants more rows / columns (navigation past the end in sheet mode). */
  onGrow?(rows: number, cols: number): void;
  toolbarStart?: ReactNode;
  /** Formatting controls that need the selection (sheet mode). */
  formatBar?: (ctx: { active: Pos | null; style: CellStyle | undefined; cells: () => Pos[] }) => ReactNode;
  toolbarEnd?: ReactNode;
  statusExtra?: ReactNode;
  /** Sheet tabs or anything else under the grid, above the status bar. */
  footer?: ReactNode;
  rowHeight?: number;
  /** Search text from outside (table mode quick search): rows not containing it are hidden. */
  quickFilter?: string;
}
