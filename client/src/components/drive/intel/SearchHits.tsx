import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ExternalLink, TextSearch } from 'lucide-react';
import { contentUrl } from '../api';
import { ItemIcon } from '../fileIcons';
import type { SearchItem } from './api';

/**
 * Files found by their text (search results with `contentMatch`): the snippet with the hit highlighted and
 * the "mətnin içində" badge. Shown above the normal result grid.
 */
export const SearchHits = ({ items, onOpenLocation }: { items: SearchItem[]; onOpenLocation?: (folderId: string) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const hits = items.filter((i) => i.contentMatch);
  if (!hits.length) return null;
  return (
    <section className="shrink-0 border-b border-line bg-surface/50" aria-label={t('driveIntel.search.contentHits', { count: hits.length })}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-ink sm:px-4" aria-expanded={open}>
        <TextSearch className="size-4 text-link" aria-hidden />
        {t('driveIntel.search.contentHits', { count: hits.length })}
        <span className="ml-auto text-muted">{open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</span>
      </button>
      {open && (
        <ul className="max-h-64 space-y-1 overflow-y-auto px-2 pb-2 sm:px-3">
          {hits.map((i) => {
            const s = i.contentMatch!.snippet;
            return (
              <li key={i.id} className="flex items-start gap-3 rounded-lg bg-card px-3 py-2 shadow-[var(--tv-shadow-card)] ring-1 ring-line/60">
                <ItemIcon item={i} className="mt-0.5 size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={contentUrl(i.id)} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-semibold text-ink hover:text-link hover:underline">
                      {i.name}
                    </a>
                    <span className="rounded-full bg-primary/[0.06] px-2 py-0.5 text-[10px] font-bold tracking-wide text-link uppercase dark:bg-brand-500/15 dark:text-brand-300">
                      {t('driveIntel.search.badge')}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {s ? (
                      <>
                        {s.before}
                        <mark className="rounded bg-warning-bg px-0.5 font-semibold text-ink dark:bg-amber-500/30">{s.match}</mark>
                        {s.after}
                      </>
                    ) : (
                      t('driveIntel.search.noSnippet')
                    )}
                  </p>
                </div>
                {i.location && onOpenLocation && (
                  <button
                    type="button"
                    onClick={() => onOpenLocation(i.location!.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                    title={t('driveIntel.search.openLocation')}
                    aria-label={t('driveIntel.search.openLocation')}
                  >
                    <ExternalLink className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
