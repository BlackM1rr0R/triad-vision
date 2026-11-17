import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { pagesAudience } from '@/i18n/pagesAudience';
import { pagesToolsHub } from '@/i18n/pagesToolsHub';
import { TOOLS } from '@/components/audience/tools';
import { useFeaturedTools, type HubTool } from './toolMeta';

// Content of the header tools menu (desktop panel and mobile group): its own chunk, loaded on first hover / focus /
// open (ToolsMenu.tsx), so the tool titles (pagesAudience) stay out of the bundle every page loads.

registerCopy(pagesAudience);
registerCopy(pagesToolsHub);

/** "50+" style count of the tools hub (rounded down to ten). */
const roundedCount = () => Math.max(10, Math.floor(TOOLS.length / 10) * 10);

const FeaturedToolLinks = ({ tools, className, linkClass }: { tools: HubTool[]; className?: string; linkClass?: string }) => {
  const { t } = useTranslation();
  return (
    <ul className={className}>
      {tools.map((x) => (
        <li key={x.to}>
          <Link to={x.to} className={clsx('flex items-center gap-2.5 rounded-lg transition hover:bg-sunken focus-visible:bg-sunken', linkClass)}>
            <x.icon className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="truncate">{t(x.titleKey)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
};

/** Desktop dropdown: featured tools (admin order) + "all tools". */
export default function ToolsMenuPanel() {
  const { t } = useTranslation();
  const tools = useFeaturedTools();
  return (
    <div className="grid grid-cols-[1fr_12rem] gap-3 overflow-hidden rounded-2xl border border-line bg-raised p-3 text-ink shadow-[var(--tv-shadow-raised)]">
      <div className="min-w-0">
        <p className="px-2.5 pt-1 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{t('toolsHub.menu.featured')}</p>
        <FeaturedToolLinks tools={tools} className="grid gap-0.5" linkClass="min-h-10 px-2.5 py-2 text-sm font-semibold" />
      </div>
      <Link to="/tools" className="group flex flex-col justify-between rounded-xl bg-highlight-bg p-4 text-ink">
        <span>
          <Wrench className="size-5 text-highlight-fg" aria-hidden />
          <span className="mt-3 block font-display text-base leading-snug font-semibold">{t('toolsHub.menu.all')}</span>
          <span className="mt-2 block text-xs leading-relaxed text-muted">{t('toolsHub.menu.allText', { count: roundedCount() })}</span>
        </span>
        <ArrowRight className="mt-4 size-5 text-highlight-fg transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/** Mobile menu group: "all tools" card + the featured tools. */
export const MobileToolsContent = () => {
  const { t } = useTranslation();
  const tools = useFeaturedTools();
  return (
    <>
      <Link to="/tools" className="mb-1 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 hover:border-line-strong">
        <span className="min-w-0">
          <span className="block font-semibold">{t('toolsHub.menu.all')}</span>
          <span className="mt-0.5 block text-sm text-muted">{t('toolsHub.menu.allText', { count: roundedCount() })}</span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-highlight-fg" aria-hidden />
      </Link>
      <FeaturedToolLinks tools={tools} linkClass="min-h-11 gap-3 rounded-xl px-2 py-2.5 text-[0.95rem] text-ink" />
    </>
  );
};
