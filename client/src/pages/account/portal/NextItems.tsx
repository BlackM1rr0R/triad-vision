import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import type { NextItem } from './useNextUp';

const SHOWN = 4;

/** Compact list of the other open items (each one link). Hidden when there is nothing. */
export function NextItems({ items, short, id = 'next-items' }: { items: NextItem[]; short: (iso: string) => string; id?: string }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <section className="card overflow-hidden" aria-labelledby={`${id}-title`} id={id}>
      <div className="flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <h2 id={`${id}-title`} className="type-card-title">
          {t('pux.items.title')} <span className="font-normal text-muted tabular-nums">({items.length})</span>
        </h2>
        {items.length > SHOWN && (
          <button type="button" className="min-h-11 text-sm font-semibold text-link hover:text-link" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? t('pux.items.less') : `${t('pux.items.all')} (${items.length})`}
          </button>
        )}
      </div>
      <ul className="mt-2 divide-y divide-line">
        {shown.map((it) => (
          <li key={it.key}>
            <Link to={it.to} className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5">
              <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', it.overdue ? 'bg-danger-bg text-danger-fg' : 'chip-soft')}>
                <it.icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold break-words text-ink">{it.title}</span>
                {(it.due || it.overdue) && (
                  <span className={clsx('block text-xs', it.overdue ? 'font-semibold text-danger-fg' : 'text-muted')}>
                    {it.overdue && `${t('pux.next.overdue')}${it.due ? ' · ' : ''}`}
                    {it.due && t('pux.next.item.due', { date: short(it.due) })}
                  </span>
                )}
              </span>
              <span className="hidden text-sm font-semibold text-link group-hover:underline sm:inline">{it.action}</span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
