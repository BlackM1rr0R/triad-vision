import { Suspense, lazy, useMemo, type ComponentType, type LazyExoticComponent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAccess } from '@/i18n/pagesAccess';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHeader, Spinner, TabPanel, Tabs, useTabParam } from '@/components/ui';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesAccess);

/**
 * Access Center (/admin/access): SUPER_ADMIN, and ADMIN users a SUPER_ADMIN granted "manage access"
 * (server: lib/access canManageAccess; every tab's API checks again). Each tab is its own file in this folder,
 * owned by one part of the access-control programme and loaded lazily; a tab whose file does not exist yet
 * shows "coming soon" (import.meta.glob simply has no entry for it, so the build never breaks).
 */

const TABS = [
  { key: 'staff', file: './StaffRolesTab.tsx' },
  { key: 'scope', file: './StaffScopeTab.tsx' },
  { key: 'partners', file: './PartnersTab.tsx' },
  { key: 'login', file: './LoginSecurityTab.tsx' },
  { key: 'employers', file: './EmployersTab.tsx' },
  { key: 'sensitive', file: './SensitiveFieldsTab.tsx' },
  { key: 'audit', file: './AuditTab.tsx' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const TAB_KEYS = TABS.map((t) => t.key) as unknown as readonly TabKey[];

const MODULES = import.meta.glob<{ default: ComponentType }>('./*Tab.tsx');
const loaded = new Map<string, LazyExoticComponent<ComponentType>>();
const tabComponent = (file: string) => {
  const load = MODULES[file];
  if (!load) return null;
  if (!loaded.has(file)) loaded.set(file, lazy(load));
  return loaded.get(file)!;
};

export default function AccessCenter() {
  const { t } = useTranslation();
  usePageTitle(t('accessCenter.title'));
  const [tab, setTab] = useTabParam<TabKey>('tab', TAB_KEYS, 'staff');
  const me = useQuery({
    queryKey: ['access-me'],
    queryFn: async () => (await api.get<{ canManage: boolean; superAdmin: boolean }>('/admin/access/me')).data,
    staleTime: 60_000,
  });
  const items = useMemo(() => TABS.map((x) => ({ key: x.key, label: t(`accessCenter.tabs.${x.key}`) })), [t]);
  const current = TABS.find((x) => x.key === tab) ?? TABS[0];
  const Comp = tabComponent(current.file);

  return (
    <div>
      <PageHeader title={t('accessCenter.title')} subtitle={t('accessCenter.subtitle')} leading={<KeyRound className="size-6 text-primary" aria-hidden />} />
      {me.isLoading ? (
        <div className="grid place-items-center py-16 text-primary">
          <Spinner className="size-6" />
        </div>
      ) : me.isError ? (
        <ErrorState onRetry={() => void me.refetch()} />
      ) : !me.data?.canManage ? (
        <p className="rounded-xl border border-line bg-card px-4 py-8 text-center text-sm text-muted" role="status">
          {t('accessCenter.noAccess')}
        </p>
      ) : (
        <>
          <Tabs label={t('accessCenter.tabsLabel')} idPrefix="access" items={items} value={tab} onChange={setTab} />
          <TabPanel idPrefix="access" tabKey={tab} className="pt-5">
            {Comp ? (
              <Suspense
                fallback={
                  <div className="grid place-items-center py-16 text-primary">
                    <Spinner className="size-6" />
                  </div>
                }
              >
                <Comp />
              </Suspense>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{t('accessCenter.comingSoon')}</p>
            )}
          </TabPanel>
        </>
      )}
    </div>
  );
}
