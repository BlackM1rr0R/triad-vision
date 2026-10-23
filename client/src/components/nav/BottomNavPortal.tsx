import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FolderOpen, House, ListChecks, MessageCircle, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FINAL } from '@/lib/caseStatus';
import type { CaseDetail } from '@/lib/types';
import { useOverview } from '@/components/portal/useOverview';
import { useMyTasks } from '@/components/clientProcess/PortalTasks';
import { useMySignatures } from '@/components/esign/MySignatures';
import { BottomNav, type BottomNavItem } from './BottomNav';

// Pages with their own fixed action bar at the bottom (form submit, signing): no tab bar there.
const OWN_BAR = [/^\/account\/cases\/[^/]+\/(forms|confirm)/, /^\/account\/signatures\/[^/]+/];

type MsgWithRead = CaseDetail['messages'][number] & { readAt?: string | null };

/** Client portal tab bar (phones): Home · Documents · Messages · Tasks · Profile. */
export function BottomNavPortal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { data: overview } = useOverview(!!user);
  const cases = overview?.cases ?? [];
  const primary = cases.find((c) => !FINAL.includes(c.status)) ?? (cases.length === 1 ? cases[0] : null);
  const base = primary ? `/account/cases/${primary.id}` : null;

  // Same query key as the case page: one cache, no extra request while the case page is open.
  const caseQ = useQuery({
    queryKey: ['case', primary?.id ?? ''],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${primary!.id}`)).data.case,
    enabled: !!primary,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unread = (caseQ.data?.messages ?? []).filter((m) => m.author.id !== user?.id && !(m as MsgWithRead).readAt).length;
  const tasks = useMyTasks();
  const { data: signatures } = useMySignatures({ enabled: !!user });
  const todo = (tasks.data?.counts.open ?? 0) + (signatures ?? []).filter((s) => s.myTurn).length;

  const onCase = pathname.startsWith('/account/cases/');
  const tab = params.get('tab');

  const items: BottomNavItem[] = [
    { key: 'home', label: t('pux.nav.home'), icon: House, to: '/account', active: pathname === '/account' || pathname === '/account/' },
    {
      key: 'docs',
      label: t('pux.nav.docs'),
      icon: FolderOpen,
      to: base ? `${base}?tab=docs` : '/account/vault',
      active: (onCase && tab === 'docs') || pathname.startsWith('/account/vault'),
    },
    {
      key: 'messages',
      label: t('pux.nav.messages'),
      icon: MessageCircle,
      to: base ? `${base}?tab=messages` : '/account/notifications',
      active: base ? onCase && tab === 'messages' : pathname.startsWith('/account/notifications'),
      badge: unread || undefined,
    },
    ...(base
      ? [
          {
            key: 'tasks',
            label: t('pux.nav.tasks'),
            icon: ListChecks,
            to: base,
            active: onCase && (!tab || tab === 'overview'),
            badge: todo || undefined,
          },
        ]
      : []),
    {
      key: 'profile',
      label: t('pux.nav.profile'),
      icon: UserRound,
      to: '/account/profile',
      active: pathname.startsWith('/account/profile') || pathname.startsWith('/account/privacy'),
    },
  ];

  return <BottomNav items={items} hidden={OWN_BAR.some((re) => re.test(pathname))} />;
}
