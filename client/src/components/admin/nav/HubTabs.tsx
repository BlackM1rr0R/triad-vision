import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { hrefFor, hubByKey, hubTabs, type HubKey } from '@/components/command/navRegistry';
import { useStaffNav } from '@/components/command/navPrefs';
import { hubTabKey, writeJson } from '@/components/command/storage';

/**
 * Tab row of a hub above the current page: the hub's pages as links (each keeps its own URL, so reload,
 * bookmarks and old links work). Same look as the underline <Tabs>, but real links in a labelled <nav>.
 * The open tab is remembered, so the hub entry in the sidebar returns to it.
 */
export const HubTabs = ({ hub, currentId }: { hub: HubKey; currentId: string | undefined }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { modules } = useStaffNav();
  const def = hubByKey(hub);
  const tabs = hubTabs(hub, user?.role, modules);

  useEffect(() => {
    if (currentId && tabs.some((x) => x.id === currentId)) writeJson(hubTabKey(user?.id, hub), currentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, hub, user?.id]);

  if (!def || tabs.length < 2) return null;
  const hubLabel = t(`anav.hubs.${hub}`);
  return (
    <nav aria-label={t('anav.hubTabsAria', { hub: hubLabel })} className="mb-5 min-w-0 border-b border-line">
      <ul className="-mb-px flex min-w-0 items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <li className="flex shrink-0 items-center gap-1.5 pr-2 text-[11px] font-bold tracking-wider whitespace-nowrap text-muted uppercase">
          <def.icon className="size-3.5" aria-hidden />
          {hubLabel}
        </li>
        {tabs.map((tab) => (
          <li key={tab.id} className="flex shrink-0">
            <NavLink
              to={hrefFor(tab, user?.role)}
              end={tab.end}
              className={({ isActive }) =>
                clsx(
                  'inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap transition',
                  isActive || tab.id === currentId ? 'border-brand-600 text-ink' : 'border-transparent text-muted hover:border-line hover:text-ink',
                )
              }
            >
              <tab.icon className="size-4 shrink-0" aria-hidden />
              {t(tab.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
};
