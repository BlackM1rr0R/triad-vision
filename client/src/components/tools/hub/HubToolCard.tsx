import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import type { HubTool, ToolTag } from './toolMeta';

/** One tool on /tools: icon, title, one line and its tags. `compact` = the featured row / header menu size. */
export const HubToolCard = ({ tool, tags = [], compact = false, onTag }: { tool: HubTool; tags?: ToolTag[]; compact?: boolean; onTag?: (t: ToolTag) => void }) => {
  const { t } = useTranslation();
  const Icon = tool.icon;
  return (
    <div className={clsx('card card-interactive group relative flex h-full flex-col', compact ? 'p-4' : 'p-5')}>
      <div className="flex items-start gap-3">
        <span className={clsx('chip-sky grid shrink-0 place-items-center rounded-xl', compact ? 'size-10' : 'size-11')}>
          <Icon className={compact ? 'size-5' : 'size-5'} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={clsx('font-display leading-snug font-semibold text-ink', compact ? 'text-[0.95rem]' : 'text-base sm:text-lg')}>
            {/* The whole card is the link (stretched), the tag buttons stay clickable above it. */}
            <Link to={tool.to} className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none">
              {t(tool.titleKey)}
            </Link>
          </h3>
          <p className={clsx('mt-1 text-sm leading-relaxed text-muted', compact ? 'line-clamp-2' : 'line-clamp-3')}>{t(tool.textKey)}</p>
        </div>
      </div>
      {!compact && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
          {tags.map((tag) =>
            onTag ? (
              <button
                key={tag}
                type="button"
                onClick={() => onTag(tag)}
                className="relative z-[1] rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:bg-raised hover:text-ink"
              >
                {t(`toolsHub.tags.${tag}`)}
              </button>
            ) : (
              <span key={tag} className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-muted">
                {t(`toolsHub.tags.${tag}`)}
              </span>
            ),
          )}
          <ArrowRight className="ml-auto size-4 text-link opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
        </div>
      )}
    </div>
  );
};
