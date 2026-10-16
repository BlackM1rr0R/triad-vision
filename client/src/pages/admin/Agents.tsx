import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesAgents } from '@/i18n/pagesAgents';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHead } from '@/components/admin/ui';
import { AgentsTabs } from '@/components/agents/admin/shared';
import { AgentsList } from '@/components/agents/admin/AgentsList';
import { CommissionsPage } from '@/components/agents/admin/CommissionsPage';
import { AgentDetail } from '@/components/agents/admin/AgentDetail';

registerCopy(pagesAgents);

/** Admin: agent / partner programme — /admin/agents (list), /admin/agents/commissions, /admin/agents/:id. */
export default function AdminAgents() {
  const { t } = useTranslation();
  usePageTitle(t('agents.admin.title'));
  return (
    <div>
      <PageHead title={t('agents.admin.title')} subtitle={t('agents.admin.subtitle')} />
      <AgentsTabs />
      <Routes>
        <Route index element={<AgentsList />} />
        <Route path="commissions" element={<CommissionsPage />} />
        <Route path=":id" element={<AgentDetail />} />
        <Route path="*" element={<Navigate to="/admin/agents" replace />} />
      </Routes>
    </div>
  );
}
