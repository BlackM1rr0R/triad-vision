import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { EmptyState } from '@/components/ui/EmptyState';
import { hrefFor, hubByKey, hubTabs } from '@/components/command/navRegistry';
import { useStaffNav } from '@/components/command/navPrefs';
import { hubTabKey, readJson } from '@/components/command/storage';

/**
 * /admin/hub/:hubId — a hub's entry point: opens `?tab=<page id>`, else the tab used last, else the first tab
 * the user may open. The pages keep their own routes (the hub tab row is drawn by AdminLayout above them).
 */
export default function AdminHub() {
  const { t } = useTranslation();
  const { hubId } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { modules } = useStaffNav();
  const hub = hubByKey(hubId);
  const tabs = hub ? hubTabs(hub.key, user?.role, modules) : [];
  if (!hub || !tabs.length) {
    return (
      <section className="rounded-2xl border border-line bg-card">
        <EmptyState icon={LayoutGrid} size="lg" title={hub ? t(`anav.hubs.${hub.key}`) : undefined} text={t('anav.hubEmpty')} />
      </section>
    );
  }
  const wanted = params.get('tab') ?? readJson<string | null>(hubTabKey(user?.id, hub.key), null, (v): v is string => typeof v === 'string');
  const target = tabs.find((x) => x.id === wanted) ?? tabs[0];
  return <Navigate to={hrefFor(target, user?.role)} replace />;
}
