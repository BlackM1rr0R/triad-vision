import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronRight, ExternalLink, Search, Star, X } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesPortalStage } from '@/i18n/pagesPortalStage';
import { usePortalNav } from '@/components/portal/usePortalNav';
import { TOOL_ICON, groupLabel, stageLabel, toolLabel, toolText } from '@/components/portal/portalToolMeta';
import { PORTAL_TOOLS, TOOL_GROUPS, matchesQuery, toolPath, toolsOfGroup, type PortalToolKey, type ToolLinkContext } from '@/lib/portalTools';

registerCopy(pagesPortalStage);

const ToolCard = ({ k, to, featured, badge }: { k: PortalToolKey; to: string; featured: boolean; badge: number }) => {
  const { t } = useTranslation();
  const Icon = TOOL_ICON[k];
  const pub = !!PORTAL_TOOLS[k].publicPage;
  return (
    <li className="min-w-0">
      <Link
        to={to}
        className="group flex h-full min-h-16 items-center gap-3 rounded-2xl border border-line bg-card p-3 transition-colors hover:border-primary/40 hover:bg-sunken focus-visible:ring-2 focus-visible:ring-primary sm:p-4"
      >
        <span className={clsx('grid size-10 shrink-0 place-items-center rounded-xl', featured ? 'bg-highlight-bg text-ink' : 'chip-soft')}>
          <Icon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-semibold break-words text-ink">{toolLabel(t, k)}</span>
            {badge > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white">
                <span aria-hidden>{badge > 99 ? '99+' : badge}</span>
                <span className="sr-only">{t('pux.nav.badge', { count: badge })}</span>
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{toolText(t, k)}</span>
          {(featured || pub) && (
            <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {featured && (
                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                  <Star className="size-3" aria-hidden />
                  {t('pstage.all.featured')}
                </span>
              )}
              {pub && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <ExternalLink className="size-3" aria-hidden />
                  {t('pstage.all.public')}
                </span>
              )}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Link>
    </li>
  );
};

/**
 * /account/all — "All tools" (Bütün imkanlar): every portal tool, grouped and searchable. The stage menu
 * features only a few (server: lib/account/portalStage.ts); nothing else is removed, it lives here.
 */
export default function AllTools() {
  const { t } = useTranslation();
  usePageTitle(t('pstage.all.title'));
  const nav = usePortalNav();
  const [q, setQ] = useState('');
  const ctx: ToolLinkContext = { caseId: nav.caseId, caseCount: nav.caseCount, approvedCaseId: nav.approvedCaseId };

  const text = (k: PortalToolKey) => `${toolLabel(t, k)} ${toolText(t, k)} ${groupLabel(t, PORTAL_TOOLS[k].group)} ${PORTAL_TOOLS[k].words ?? ''} ${k}`;
  const query = q.trim();
  // ~40 items: filtering on every keystroke is cheap.
  const groups = TOOL_GROUPS.map((g) => ({
    g,
    items: toolsOfGroup(g)
      .map((k) => ({ k, to: toolPath(k, ctx) }))
      .filter((x): x is { k: PortalToolKey; to: string } => !!x.to && (!query || matchesQuery(text(x.k), query))),
  })).filter((x) => x.items.length > 0);
  const found = groups.reduce((n, x) => n + x.items.length, 0);
  const featured = nav.featured.map((k) => ({ k, to: toolPath(k, ctx) })).filter((x): x is { k: PortalToolKey; to: string } => !!x.to);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="type-page-title">{t('pstage.all.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('pstage.all.intro')}</p>
        {nav.portalStage && (
          <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="size-1.5 rounded-full bg-highlight" aria-hidden />
            {stageLabel(t, nav.portalStage)}
          </p>
        )}
      </div>

      <div role="search" className="relative max-w-xl">
        <label htmlFor="all-tools-search" className="sr-only">
          {t('pstage.all.searchLabel')}
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="all-tools-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('pstage.all.search')}
          className="input min-h-12 w-full pr-11 pl-10"
          autoComplete="off"
          aria-describedby="all-tools-count"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            aria-label={t('pstage.all.clear')}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
        <p id="all-tools-count" className="sr-only" aria-live="polite">
          {query ? t('pstage.all.results', { count: found }) : ''}
        </p>
      </div>

      {!query && featured.length > 0 && (
        <section aria-labelledby="all-featured">
          <h3 id="all-featured" className="type-overline text-muted">
            {t('pstage.all.featured')}
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featured.map(({ k, to }) => (
              <ToolCard key={k} k={k} to={to} featured badge={nav.toolBadges(k)} />
            ))}
          </ul>
        </section>
      )}

      {groups.map(({ g, items }) => (
        <section key={g} aria-labelledby={`all-group-${g}`}>
          <h3 id={`all-group-${g}`} className="type-overline text-muted">
            {groupLabel(t, g)}
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map(({ k, to }) => (
              <ToolCard key={k} k={k} to={to} featured={nav.featured.includes(k)} badge={nav.toolBadges(k)} />
            ))}
          </ul>
        </section>
      ))}

      {query && found === 0 && <p className="card p-6 text-center text-muted">{t('pstage.all.empty')}</p>}
    </div>
  );
}
