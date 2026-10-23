import type { ReactNode, ThHTMLAttributes } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SkeletonRows } from './Skeleton';

export type SortDir = 'asc' | 'desc';
export type SortState = { key: string; dir: SortDir } | null;

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  /** Clickable header that calls onSortChange (sorting itself is the caller's job). */
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  /** Classes on every <td> / the <th>. */
  className?: string;
  headerClassName?: string;
  /** Hidden below md in table mode (secondary columns). */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** Stack mode: this column is the card title (no label). */
  primary?: boolean;
  /** Stack mode: label shown before the value (default: header). */
  mobileLabel?: ReactNode;
};

export type TableProps<T> = {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T, index: number) => string;
  /** Shows skeleton rows (when there are no rows yet). */
  loading?: boolean;
  loadingRows?: number;
  /** Rendered in a full-width row when rows is empty and not loading (pass an <EmptyState compact />). */
  empty?: ReactNode;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  /** Header sticks to the top of the nearest scroll container (default true). */
  stickyHeader?: boolean;
  /** Below sm, rows become label/value cards instead of a scrolling table (default false). */
  stackOnMobile?: boolean;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  /** Accessible caption (visually hidden). */
  caption?: string;
  dense?: boolean;
  className?: string;
};

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;
/** In stack mode the cell is always shown in the phone card, and hidden in table mode until the breakpoint. */
const HIDE_STACKED = { sm: '', md: 'sm:hidden md:table-cell', lg: 'sm:hidden lg:table-cell' } as const;

/** Header cell with sort affordance and aria-sort. Usable in hand-written tables too. */
export const SortableTh = ({
  label,
  sortKey,
  sort,
  onSortChange,
  align = 'left',
  className,
  ...rest
}: { label: ReactNode; sortKey: string; sort: SortState | undefined; onSortChange: (next: SortState) => void; align?: 'left' | 'right' | 'center' } & Omit<ThHTMLAttributes<HTMLTableCellElement>, 'onChange'>) => {
  const { t } = useTranslation();
  const dir = sort?.key === sortKey ? sort.dir : null;
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <th scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} className={clsx(ALIGN[align], className)} {...rest}>
      <button
        type="button"
        onClick={() => onSortChange(dir === 'asc' ? { key: sortKey, dir: 'desc' } : dir === 'desc' ? null : { key: sortKey, dir: 'asc' })}
        className={clsx('inline-flex items-center gap-1 rounded hover:text-ink', align === 'right' && 'flex-row-reverse')}
        title={dir === 'asc' ? t('ui.sortAscending') : dir === 'desc' ? t('ui.sortDescending') : undefined}
      >
        {label}
        <Icon className={clsx('size-3.5 shrink-0', dir ? 'text-brand-600' : 'opacity-40')} aria-hidden />
      </button>
    </th>
  );
};

/**
 * Data table: sticky header, sortable headers, skeleton + empty rows, optional stacked cards on phones.
 *
 *   <Table rows={data?.items} loading={q.isLoading} rowKey={(r) => r.id} empty={<EmptyState compact icon={Inbox} title="No invoices" />}
 *     sort={sort} onSortChange={setSort} stackOnMobile
 *     columns={[
 *       { key: 'no', header: 'No.', cell: (r) => r.number, primary: true, sortable: true },
 *       { key: 'status', header: 'Status', cell: (r) => <StatusPill domain="invoice" status={r.status} label={…} /> },
 *       { key: 'total', header: 'Total', cell: (r) => fmt(r.total), align: 'right' },
 *     ]} />
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingRows = 5,
  empty,
  sort,
  onSortChange,
  stickyHeader = true,
  stackOnMobile = false,
  onRowClick,
  rowClassName,
  caption,
  dense = false,
  className,
}: TableProps<T>) {
  const list = rows ?? [];
  const showSkeleton = loading && list.length === 0;
  const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const stack = stackOnMobile;

  return (
    <div className={clsx('min-w-0 overflow-x-auto', className)}>
      <table className={clsx('w-full text-sm', stack && 'max-sm:block')}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={clsx(stack && 'max-sm:sr-only')}>
          <tr className="border-b border-line text-xs font-semibold text-muted">
            {columns.map((c) => {
              const cls = clsx(cellPad, 'bg-surface/95 whitespace-nowrap', stickyHeader && 'sticky top-0 z-[1]', c.hideBelow && HIDE[c.hideBelow], c.headerClassName);
              return c.sortable && onSortChange ? (
                <SortableTh key={c.key} label={c.header} sortKey={c.key} sort={sort} onSortChange={onSortChange} align={c.align} className={cls} />
              ) : (
                <th key={c.key} scope="col" className={clsx(cls, ALIGN[c.align ?? 'left'])}>
                  {c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className={clsx('divide-y divide-line', stack && 'max-sm:block max-sm:space-y-2 max-sm:divide-y-0')}>
          {showSkeleton && <SkeletonRows rows={loadingRows} cols={columns.length} />}
          {!showSkeleton && list.length === 0 && empty && (
            <tr className={clsx(stack && 'max-sm:block')}>
              <td colSpan={columns.length} className={clsx(stack && 'max-sm:block')}>
                {empty}
              </td>
            </tr>
          )}
          {list.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                'transition-colors',
                onRowClick && 'cursor-pointer hover:bg-surface/70',
                stack && 'max-sm:block max-sm:rounded-xl max-sm:border max-sm:border-line max-sm:bg-card max-sm:p-3',
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={clsx(
                    cellPad,
                    'align-middle',
                    ALIGN[c.align ?? 'left'],
                    c.hideBelow && (stack ? HIDE_STACKED[c.hideBelow] : HIDE[c.hideBelow]),
                    stack && 'max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-3 max-sm:px-0 max-sm:py-1 max-sm:text-left',
                    stack && c.primary && 'max-sm:block max-sm:pb-1.5 max-sm:font-semibold',
                    c.className,
                  )}
                >
                  {stack && !c.primary && (
                    <span className="shrink-0 text-xs font-medium text-muted sm:hidden" aria-hidden>
                      {c.mobileLabel ?? c.header}
                    </span>
                  )}
                  {stack ? <div className={clsx('max-sm:min-w-0', !c.primary && 'max-sm:text-right')}>{c.cell(row, i)}</div> : c.cell(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
