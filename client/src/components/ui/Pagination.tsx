import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type PaginationProps = {
  /** 1-based current page. */
  page: number;
  /** Total number of pages (≥ 1). */
  pages: number;
  onChange: (page: number) => void;
  /** Optional "21–40 of 312" summary (needs total + pageSize). */
  total?: number;
  pageSize?: number;
  /** Page buttons on each side of the current one (default 1). */
  siblings?: number;
  className?: string;
};

/** Page numbers to show: first, last, the current ± siblings, and gaps (null). */
export const pageWindow = (page: number, pages: number, siblings = 1): (number | null)[] => {
  const out: (number | null)[] = [];
  const from = Math.max(2, page - siblings);
  const to = Math.min(pages - 1, page + siblings);
  out.push(1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pages - 1) out.push(null);
  if (pages > 1) out.push(pages);
  return out;
};

/**
 * Page navigation for lists (the caller fetches the page). Phones show only previous / "3 / 12" / next.
 *
 *   <Pagination page={page} pages={data.pages} total={data.total} pageSize={50} onChange={setPage} />
 */
export const Pagination = ({ page, pages, onChange, total, pageSize, siblings = 1, className }: PaginationProps) => {
  const { t } = useTranslation();
  if (pages <= 1 && total === undefined) return null;
  const btn =
    'inline-grid min-w-9 place-items-center rounded-[var(--tv-radius-control)] px-2 h-9 text-sm font-medium tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40';
  const from = total !== undefined && pageSize ? Math.min(total, (page - 1) * pageSize + 1) : null;
  const to = total !== undefined && pageSize ? Math.min(total, page * pageSize) : null;
  return (
    <nav aria-label={t('ui.pagination')} className={clsx('flex flex-wrap items-center justify-between gap-3', className)}>
      {from !== null && to !== null && total !== undefined ? (
        <p className="text-xs text-muted tabular-nums">{t('ui.range', { from, to, total })}</p>
      ) : (
        <span />
      )}
      {pages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <button type="button" className={clsx(btn, 'text-muted hover:bg-sunken hover:text-ink')} onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label={t('ui.previous')}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
          </li>
          <li className="px-2 text-sm text-muted tabular-nums sm:hidden" aria-current="page">
            {page} / {pages}
          </li>
          {pageWindow(page, pages, siblings).map((p, i) =>
            p === null ? (
              <li key={`gap${i}`} className="hidden px-1 text-muted sm:block" aria-hidden>
                …
              </li>
            ) : (
              <li key={p} className="hidden sm:block">
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={t('ui.page', { page: p })}
                  className={clsx(btn, p === page ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
                >
                  {p}
                </button>
              </li>
            ),
          )}
          <li>
            <button type="button" className={clsx(btn, 'text-muted hover:bg-sunken hover:text-ink')} onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label={t('ui.next')}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
};
