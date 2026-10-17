import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesWorkspace } from '@/i18n/pagesWorkspace';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { AnnouncementsCard } from '@/components/workspace/Announcements';
import { useAnnouncements } from '@/components/workspace/api';

registerCopy(pagesWorkspace);

/**
 * Admin → Announcements: the same team announcements as on the workspace home, managed right inside
 * the admin panel (admins see expired ones too and can create, edit, pin and delete).
 */
export default function AdminAnnouncements() {
  const { t } = useTranslation();
  usePageTitle(t('ws.ann.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const [params] = useSearchParams();
  const q = useAnnouncements(isAdmin);
  const unread = (q.data ?? []).filter((a) => !a.read).length;
  return (
    <div className="mx-auto max-w-4xl">
      <AnnouncementsCard items={q.data} loading={q.isLoading} unread={unread} isAdmin={isAdmin} highlightId={params.get('id')} />
    </div>
  );
}
