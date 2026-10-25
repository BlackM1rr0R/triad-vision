import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ToggleRight } from 'lucide-react';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { adminNavCopy } from '@/i18n/adminNav';
import { LoadingBlock, PageHead, Panel, Switch } from '@/components/admin/ui';
import { MODULE_KEYS, moduleItems, moduleOn } from '@/components/command/navRegistry';
import { useStaffNav } from '@/components/command/navPrefs';
import { useSaveModules } from '@/components/admin/nav/useSaveModules';

registerCopy(adminNavCopy);

/** System → Modules: switch optional features off for everyone (menu, hub tabs, Ctrl+K, dashboard widgets). */
export default function SystemModules() {
  const { t } = useTranslation();
  usePageTitle(t('anav.modulesPage.title'));
  const { modules, loaded } = useStaffNav();
  const save = useSaveModules();

  return (
    <div className="stack-page">
      <PageHead title={t('anav.modulesPage.title')} subtitle={t('anav.modulesPage.intro')} />
      {!loaded ? (
        <LoadingBlock />
      ) : (
        <Panel title={t('anav.modulesPage.title')} icon={ToggleRight} bodyClassName="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {MODULE_KEYS.map((key) => {
              const on = moduleOn(modules, key);
              const title = t(`anav.modules.${key}.title`);
              const pages = moduleItems(key);
              return (
                <li key={key} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {title}
                      <span className={clsx('badge', on ? 'bg-success-bg text-success-fg' : 'bg-neutral-bg text-neutral-fg')}>{on ? t('anav.modulesPage.on') : t('anav.modulesPage.off')}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-muted">{t(`anav.modules.${key}.desc`)}</p>
                    {pages.length > 0 && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold">{t('anav.modulesPage.pages')}:</span>
                        {pages.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1 rounded-md bg-sunken px-1.5 py-0.5">
                            <p.icon className="size-3" aria-hidden /> {t(p.labelKey)}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="pt-0.5">
                    <Switch checked={on} disabled={save.isPending} onChange={(v) => save.mutate({ [key]: v })} label={t('anav.modulesPage.toggle', { module: title })} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
