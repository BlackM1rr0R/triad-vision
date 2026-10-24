import { useTranslation } from 'react-i18next';
import { BookOpen, Grid3X3, PenSquare } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesTeam } from '@/i18n/pagesTeam';
import { PageHead } from '@/components/admin/ui';
import { Tabs, useTabParam } from '@/components/ui/Tabs';
import { Learn } from '@/components/team/training/Learn';
import { Authoring } from '@/components/team/training/Authoring';
import { ProgressMatrix } from '@/components/team/training/ProgressMatrix';

registerCopy(pagesTeam);

const TABS = ['learn', 'courses', 'progress'] as const;

/** Admin → Təlim: my courses (everyone), course authoring and the progress matrix (ADMIN+). */
export default function AdminTraining() {
  const { t } = useTranslation();
  usePageTitle(t('team.training.pageTitle'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const [tab, setTab] = useTabParam('tab', TABS, 'learn');
  const visible = TABS.filter((k) => k === 'learn' || isAdmin);
  const current = visible.includes(tab) ? tab : 'learn';
  return (
    <div className="space-y-4">
      <PageHead title={t('team.training.pageTitle')} subtitle={t('team.training.pageSubtitle')} />
      {visible.length > 1 && (
        <Tabs
          label={t('team.training.pageTitle')}
          items={visible.map((k) => ({ key: k, label: t(`team.training.tabs.${k}`), icon: k === 'learn' ? BookOpen : k === 'courses' ? PenSquare : Grid3X3 }))}
          value={current}
          onChange={setTab}
        />
      )}
      {current === 'learn' && <Learn />}
      {current === 'courses' && <Authoring />}
      {current === 'progress' && <ProgressMatrix />}
    </div>
  );
}
