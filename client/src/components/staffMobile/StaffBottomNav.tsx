import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderKanban, Menu, MessagesSquare, ScanEye, Sun } from 'lucide-react';
import { BottomNav, type BottomNavItem } from '@/components/nav/BottomNav';
import { useMyWork } from '@/components/today/api';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { useIsPhone } from './useIsPhone';

registerCopy(pagesStaffMobile);

/**
 * Staff tab bar on phones (< 768 px, components/nav/BottomNav): My day · Cases · Messages · Review · More (the
 * sidebar drawer of AdminLayout). Badges come from the "my work" query the sidebar badge already loads (cached,
 * no extra request): unanswered client messages and uploads waiting for review in the viewer's cases.
 */
export function StaffBottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const phone = useIsPhone();
  const { data } = useMyWork('mine', phone);
  if (!phone) return null;
  const at = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  const kinds = data?.counts.byKind ?? {};
  const items: BottomNavItem[] = [
    { key: 'staff-myday', label: t('smob.nav.myDay'), icon: Sun, to: '/admin/my-day', active: at('/admin/my-day') || at('/admin/today') },
    { key: 'staff-cases', label: t('smob.nav.cases'), icon: FolderKanban, to: '/admin/cases', active: at('/admin/cases') },
    { key: 'staff-messages', label: t('smob.nav.messages'), icon: MessagesSquare, to: '/admin/inbox', active: at('/admin/inbox'), badge: kinds.client_message || undefined },
    { key: 'staff-review', label: t('smob.nav.review'), icon: ScanEye, to: '/admin/review', active: at('/admin/review'), badge: kinds.doc_review || undefined },
    { key: 'staff-more', label: t('smob.nav.more'), icon: Menu, onClick: onMore, expanded: moreOpen, active: moreOpen },
  ];
  return <BottomNav items={items} />;
}
