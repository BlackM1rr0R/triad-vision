import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen, LayoutDashboard, ListTodo, Mail, Menu, MessagesSquare } from 'lucide-react';
import { BottomNav, type BottomNavItem } from './BottomNav';

/**
 * Staff workspace tab bar (phones): Home · Drive · Tasks · Mail/Chat · More (opens the rail drawer).
 * Rendered in the flow at the end of the full-height shell, so the app panes end above it.
 */
export function BottomNavWorkspace({ tasks, mail, chat, onMore, moreOpen }: { tasks?: number; mail?: number; chat?: number; onMore: () => void; moreOpen: boolean }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const at = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  // One "inbox" slot: mail by default, chat when only chat has something new (or chat is open).
  const toChat = at('/workspace/chat') || (!mail && !!chat);
  const items: BottomNavItem[] = [
    { key: 'home', label: t('pux.nav.home'), icon: LayoutDashboard, to: '/workspace/home', active: at('/workspace/home') },
    { key: 'docs', label: t('pux.nav.docs'), icon: FolderOpen, to: '/workspace/drive', active: at('/workspace/drive') || at('/workspace/sheet') || at('/workspace/pdf') },
    { key: 'tasks', label: t('pux.nav.tasks'), icon: ListTodo, to: '/workspace/tasks', active: at('/workspace/tasks'), badge: tasks },
    {
      key: 'mail',
      label: toChat ? t('pux.nav.chat') : t('pux.nav.mail'),
      icon: toChat ? MessagesSquare : Mail,
      to: toChat ? '/workspace/chat' : '/workspace/mail',
      active: at('/workspace/mail') || at('/workspace/chat'),
      badge: (mail ?? 0) + (chat ?? 0) || undefined,
    },
    { key: 'more', label: t('pux.nav.more'), icon: Menu, onClick: onMore, expanded: moreOpen, active: moreOpen },
  ];
  return <BottomNav items={items} fixed={false} className="shrink-0" />;
}
