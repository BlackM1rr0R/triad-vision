import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Search, Sparkles, X } from 'lucide-react';
import clsx from 'clsx';
import { PageHero } from '@/components/layout/PageHero';
import { ConsultStrip } from '@/components/audience/AudienceSections';
import { TOOL_GROUPS, TOOLS, type ToolGroup } from '@/components/audience/tools';
import { usePageTitle } from '@/lib/usePageTitle';
import { ProfessionPicker } from '@/components/tools/ProfessionPicker';
import { WidgetsLink } from '@/components/embed/WidgetsLink';
import { registerCopy } from '@/i18n';
import { pagesToolsHub } from '@/i18n/pagesToolsHub';
import { HubToolCard } from '@/components/tools/hub/HubToolCard';
import { TOOL_TAGS, hubTool, matchesFilter, tagsOf, toolHaystack, useFeaturedTools, type ToolTag } from '@/components/tools/hub/toolMeta';

registerCopy(pagesToolsHub);

const IMG = 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=2000&q=70';

/**
 * /tools: every calculator, check, planner and game of the site. Top: the "most useful" row (admin-ordered,
 * Tool analytics → Featured tools), then the profession picker, an instant filter (text + tag chips) and the
 * task-based groups with counts — collapsible on phones (the first one starts open; a filter opens all).
 * The crawlable body of the same groups: server lib/seoBody.ts (TOOL_GROUPS).
 */
export default function Tools() {
  const { t } = useTranslation();
  usePageTitle(t('siteNav.tools'));
  const featured = useFeaturedTools();
  const filterId = useId();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<ToolTag | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ToolGroup>>(() => new Set(TOOL_GROUPS.slice(1)));

  // A link to a group (/tools#learn) opens it on phones.
  useEffect(() => {
    const g = window.location.hash.slice(1) as ToolGroup;
    if (TOOL_GROUPS.includes(g)) setCollapsed((prev) => new Set([...prev].filter((x) => x !== g)));
  }, []);

  const filtering = !!query.trim() || !!tag;
  const groups = useMemo(
    () =>
      TOOL_GROUPS.map((g) => {
        const groupText = t(`toolsHub.groups.${g}.title`);
        const items = TOOLS.filter((x) => x.group === g).filter((x) => {
          const tags = tagsOf(x.key);
          if (tag && !tags.includes(tag)) return false;
          if (!query.trim()) return true;
          const hay = toolHaystack([t(`toolsPage.items.${x.key}.title`), t(`toolsPage.items.${x.key}.text`), groupText, ...tags.map((k) => t(`toolsHub.tags.${k}`))], x.to);
          return matchesFilter(hay, query);
        });
        return { g, items, total: TOOLS.filter((x) => x.group === g).length };
      }),
    [query, tag, t],
  );
  const shown = groups.reduce((n, x) => n + x.items.length, 0);

  const toggle = (g: ToolGroup) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <>
      <PageHero title={t('toolsPage.title')} subtitle={t('toolsPage.subtitle')} image={IMG}>
        <nav aria-label={t('toolsHub.jump')} className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {TOOL_GROUPS.map((g) => (
              <li key={g}>
                <Link
                  to={{ hash: `#${g}` }}
                  onClick={() => setCollapsed((prev) => new Set([...prev].filter((x) => x !== g)))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold text-ink shadow-[var(--tv-shadow-card)] transition-colors hover:border-line-strong hover:bg-raised"
                >
                  {t(`toolsHub.groups.${g}.title`)}
                  <span className="rounded-full bg-sunken px-2 text-xs text-muted tabular-nums">{TOOLS.filter((x) => x.group === g).length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      {/* Most useful (admin order). */}
      {featured.length > 0 && (
        <section aria-labelledby="featured-tools-title" className="container-x pt-10 sm:pt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="featured-tools-title" className="flex items-center gap-2 font-display text-xl font-semibold text-ink sm:text-2xl">
                <Sparkles className="size-5 text-highlight-fg" aria-hidden /> {t('toolsHub.featured.title')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('toolsHub.featured.text')}</p>
            </div>
          </div>
          <ul className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {featured.map((tool) => (
              <li key={tool.to} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <HubToolCard tool={tool} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* "I am a …": the profession hubs (/for/<slug>). */}
      <section className="container-x pt-8 sm:pt-10">
        <ProfessionPicker />
      </section>

      {/* Instant filter: text + tag chips. */}
      <section aria-label={t('toolsHub.filter.label')} className="mt-8 border-y border-line bg-canvas py-3">
        <div className="container-x flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:w-96">
            <label htmlFor={filterId} className="sr-only">
              {t('toolsHub.filter.label')}
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id={filterId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('toolsHub.filter.placeholder')}
              autoComplete="off"
              enterKeyHint="search"
              maxLength={80}
              className="input h-11 w-full rounded-full pr-10 pl-10"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('toolsHub.filter.clear')}
                className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <div role="group" aria-label={t('toolsHub.filter.tagsLabel')} className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <TagChip active={!tag} onClick={() => setTag(null)} label={t('toolsHub.filter.allTags')} />
            {TOOL_TAGS.map((k) => (
              <TagChip key={k} active={tag === k} onClick={() => setTag(tag === k ? null : k)} label={t(`toolsHub.tags.${k}`)} />
            ))}
          </div>
          <p className="text-sm text-muted tabular-nums lg:ml-auto" aria-live="polite">
            {filtering ? t('toolsHub.filter.shown', { count: shown, total: TOOLS.length }) : t('toolsHub.filter.count', { count: TOOLS.length })}
          </p>
        </div>
      </section>

      {filtering && shown === 0 && (
        <div className="container-x py-14 text-center">
          <p className="font-semibold break-words text-ink">{t('toolsHub.filter.none', { query: query.trim() || t(`toolsHub.tags.${tag}`) })}</p>
          <p className="mt-1 text-sm text-muted">{t('toolsHub.filter.noneHint')}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {query.trim().length >= 2 && (
              <Link to={`/search?q=${encodeURIComponent(query.trim())}`} className="btn-primary btn-sm">
                <Search className="size-4" aria-hidden /> {t('toolsHub.filter.searchSite')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setTag(null);
              }}
              className="btn-secondary btn-sm"
            >
              {t('toolsHub.filter.clear')}
            </button>
          </div>
        </div>
      )}

      {groups.map(({ g, items, total }, gi) => {
        if (!items.length) return null;
        const open = filtering || !collapsed.has(g);
        return (
          <section key={g} id={g} aria-labelledby={`${g}-title`} className={clsx('scroll-mt-40 py-8 sm:py-12', gi % 2 ? 'bg-sunken' : '')}>
            <div className="container-x">
              <div className="max-w-3xl">
                <h2 id={`${g}-title`} className="font-display text-xl font-semibold text-balance text-ink sm:text-3xl">
                  {/* Phones: the heading is the disclosure button; from sm up the group is always open. */}
                  <button
                    type="button"
                    onClick={() => toggle(g)}
                    aria-expanded={open}
                    aria-controls={`${g}-list`}
                    className="flex w-full items-center justify-between gap-3 text-left sm:pointer-events-none"
                  >
                    <span className="flex items-center gap-2.5">
                      {t(`toolsHub.groups.${g}.title`)}
                      <span className="rounded-full bg-card px-2.5 py-0.5 font-sans text-sm font-semibold text-muted tabular-nums ring-1 ring-line">
                        {filtering && items.length !== total ? `${items.length}/${total}` : total}
                      </span>
                    </span>
                    <ChevronDown className={clsx('size-5 shrink-0 text-muted transition-transform sm:hidden', open && 'rotate-180')} aria-hidden />
                  </button>
                </h2>
                <p className={clsx('mt-2 text-[0.95rem] leading-relaxed text-muted', !open && 'max-sm:hidden')}>{t(`toolsHub.groups.${g}.text`)}</p>
              </div>
              <ul id={`${g}-list`} className={clsx('mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4', !open && 'max-sm:hidden')}>
                {items.map((x) => (
                  <li key={x.key}>
                    <HubToolCard tool={hubTool(x)} tags={tagsOf(x.key)} onTag={(k) => setTag(k)} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}

      <section className="pt-8 pb-16 sm:pb-20 lg:pb-28">
        <div className="container-x">
          <WidgetsLink />
          <ConsultStrip title={t('toolsPage.ctaTitle')} text={t('toolsPage.ctaText')} />
        </div>
      </section>
    </>
  );
}

const TagChip = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={clsx(
      'inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors',
      active ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-raised',
    )}
  >
    {label}
  </button>
);
