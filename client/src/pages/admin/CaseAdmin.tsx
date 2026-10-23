import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type FocusEvent as ReactFocusEvent } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, FileText, LayoutDashboard, MessagesSquare, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import type { CaseDetail } from '@/lib/types';
import { caseKey, useCaseRefresh, type CaseDetailResponse } from '@/components/admin/case/shared';
import { CASE_SECTION_EVENT, CASE_TABS, SECTION_TAB, scrollWhenReady, type CaseTab } from '@/components/admin/case/sections';
import { CaseTopBar, type GoTo } from '@/components/admin/case/CaseTopBar';
import { CaseSummaryAside } from '@/components/admin/case/CaseSummaryAside';
import { PanelSkeleton, TabSkeleton } from '@/components/admin/case/TabSkeleton';
import type { CaseTabProps } from '@/components/admin/case/tabs/types';
import type { BallInCourt } from '@/components/clientProcess/api';
import { ErrorBlock } from '@/components/admin/ui';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, useTabParam, type TabItem } from '@/components/ui/Tabs';

// Each tab is its own chunk and is only mounted (so only fetches) once it was opened; hovering / focusing a
// tab preloads its chunk (and the first queries of the finance / documents tabs).
type TabModule = { default: ComponentType<CaseTabProps> };
const TAB_LOADERS: Record<CaseTab, () => Promise<TabModule>> = {
  overview: () => import('@/components/admin/case/tabs/OverviewTab'),
  documents: () => import('@/components/admin/case/tabs/DocumentsTab'),
  communication: () => import('@/components/admin/case/tabs/CommunicationTab'),
  finance: () => import('@/components/admin/case/tabs/FinanceTab'),
  history: () => import('@/components/admin/case/tabs/HistoryTab'),
};
const TAB_VIEWS: Record<CaseTab, ComponentType<CaseTabProps>> = {
  overview: lazy(TAB_LOADERS.overview),
  documents: lazy(TAB_LOADERS.documents),
  communication: lazy(TAB_LOADERS.communication),
  finance: lazy(TAB_LOADERS.finance),
  history: lazy(TAB_LOADERS.history),
};
const TAB_ICON = { overview: LayoutDashboard, documents: FileText, communication: MessagesSquare, finance: Wallet, history: Clock } as const;

// Always visible under the header: "ball in court" strip and the "Next step" card (own chunks).
const BallStrip = lazy(() => import('@/components/admin/case/BallStrip'));
const NextStepCard = lazy(() => import('@/components/caseNext/NextStepCard').then((m) => ({ default: m.NextStepCard })));
const PackageWatcher = lazy(() => import('@/components/admin/case/PackageWatcher'));
// Dialogs opened from the header menu / summary column.
const CaseDetailsDialog = lazy(() => import('@/components/admin/case/CaseDetailsDialog'));
const FromTemplateDialog = lazy(() => import('@/components/contracts/FromTemplateDialog').then((m) => ({ default: m.FromTemplateDialog })));

const PageSkeleton = () => (
  <div className="stack-page" aria-busy>
    <div className="-mx-4 -mt-4 border-b border-line bg-card px-4 py-3 sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="mt-2 h-4 w-80 max-w-full" />
    </div>
    <Skeleton className="h-14 w-full" rounded="xl" />
    <PanelSkeleton rows={2} />
    <TabSkeleton panels={2} />
  </div>
);

export default function CaseAdmin() {
  const { id = '' } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: caseKey(id),
    queryFn: async () => (await api.get<CaseDetailResponse>(`/admin/cases/${id}`)).data,
    enabled: !!id,
    refetchOnWindowFocus: true,
  });
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorBlock error={error} onRetry={() => refetch()} />;
  // Keyed by case: switching to another case (family links) starts with fresh tab state.
  return <CasePage key={data.case.id} data={data} />;
}

/** Unanswered client messages: the client wrote after the team's last message. */
const unansweredCount = (c: CaseDetail, lastStaffAt: string | null) => {
  const since = lastStaffAt ? new Date(lastStaffAt).getTime() : 0;
  return c.messages.filter((m) => m.author.role === 'CLIENT' && new Date(m.createdAt).getTime() > since).length;
};

function CasePage({ data }: { data: CaseDetailResponse }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const c = data.case;
  const stats = data.stats;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const refresh = useCaseRefresh(c.id);

  const [tab, setTab] = useTabParam('tab', CASE_TABS, 'overview');
  // Tabs stay mounted (hidden) after their first visit, so drafts and open forms survive a tab switch.
  const [mounted, setMounted] = useState<ReadonlySet<CaseTab>>(() => new Set([tab]));
  const mount = useCallback((k: CaseTab) => setMounted((m) => (m.has(k) ? m : new Set(m).add(k))), []);
  useEffect(() => mount(tab), [tab, mount]);

  const [editing, setEditing] = useState(false);
  const [template, setTemplate] = useState(false);

  // ─── Sections: switch to the tab that holds them, then scroll ─────────
  const cancelScroll = useRef<(() => void) | null>(null);
  const goTo: GoTo = useCallback(
    (section, opts) => {
      const target = SECTION_TAB[section];
      if (target) {
        mount(target);
        setTab(target);
      }
      cancelScroll.current?.();
      cancelScroll.current = scrollWhenReady(section, opts);
    },
    [mount, setTab],
  );
  useEffect(() => () => cancelScroll.current?.(), []);

  // Deep links: /admin/cases/:id#case-data (notifications, my-work, other pages).
  const { hash } = useLocation();
  useEffect(() => {
    if (hash.length > 1) goTo(decodeURIComponent(hash.slice(1)));
  }, [hash, goTo]);

  // ?thread=… opens the three-party thread, which lives in the messages panel.
  const [params] = useSearchParams();
  const thread = params.get('thread');
  useEffect(() => {
    if (thread) {
      mount('communication');
      setTab('communication');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread]);

  // "Next step" scroll actions (components/caseNext scrollToSection) and other in-page section requests.
  useEffect(() => {
    const on = (e: Event) => {
      const section = (e as CustomEvent<unknown>).detail;
      if (typeof section !== 'string') return;
      e.preventDefault();
      goTo(section);
    };
    window.addEventListener(CASE_SECTION_EVENT, on);
    return () => window.removeEventListener(CASE_SECTION_EVENT, on);
  }, [goTo]);

  // The messages panel refreshes the case on new messages; while it is not mounted, do it here (counts, next step).
  const commMounted = mounted.has('communication');
  useRealtime('message.new', (p: { caseId?: string }) => {
    if (p.caseId === c.id && !commMounted) void refresh();
  });

  // The embassy package drawer sits in the Sənədlər tab: opening it from elsewhere mounts that tab (hidden).
  const mountDocuments = useCallback(() => mount('documents'), [mount]);
  const openPackage = () => {
    mount('documents');
    void import('@/components/caseNext/api').then((m) => m.openPackage(c.id));
  };

  // ─── Prefetch on hover / focus ─────────────────────────────────────────
  const prefetched = useRef(new Set<CaseTab>());
  const prefetch = useCallback(
    (k: CaseTab) => {
      if (prefetched.current.has(k)) return;
      prefetched.current.add(k);
      void TAB_LOADERS[k]();
      const staleTime = 30_000;
      if (k === 'finance') {
        void qc.prefetchQuery({ queryKey: ['time', 'case', c.id], queryFn: async () => (await api.get(`/admin/time/cases/${c.id}`)).data, staleTime });
        if (isAdmin) void qc.prefetchQuery({ queryKey: ['case-profit', c.id], queryFn: async () => (await api.get(`/admin/profitability/cases/${c.id}`)).data, staleTime });
      }
      if (k === 'documents')
        void qc.prefetchQuery({
          queryKey: ['esign', 'list', 'ctx', c.id, ''],
          queryFn: async () => (await api.get<{ items: unknown[] }>('/admin/signatures', { params: { caseId: c.id, pageSize: 20 } })).data.items,
          staleTime,
        });
    },
    [qc, c.id, isAdmin],
  );
  const onTabHover = (e: ReactPointerEvent<HTMLDivElement> | ReactFocusEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[role="tab"]');
    const key = el?.id.replace('case-tab-', '') as CaseTab | undefined;
    if (key && (CASE_TABS as readonly string[]).includes(key)) prefetch(key);
  };

  // Tab bar sticks under the case header on desktop: its offset follows the header height.
  const shellRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = document.getElementById('case-topbar');
    const shell = shellRef.current;
    if (!bar || !shell || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => shell.style.setProperty('--case-header-h', `${bar.offsetHeight}px`));
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // ─── Tabs ──────────────────────────────────────────────────────────────
  const pendingDocs = stats.documents.pending;
  const unanswered = stats.messages.awaitingStaffReply ? unansweredCount(c, stats.messages.lastStaffAt) : 0;
  const items: TabItem<CaseTab>[] = CASE_TABS.map((k) => ({
    key: k,
    label: t(`caseLayout.tabs.${k}`),
    icon: TAB_ICON[k],
    count: k === 'documents' && pendingDocs > 0 ? pendingDocs : k === 'communication' && unanswered > 0 ? unanswered : undefined,
    title: k === 'documents' && pendingDocs > 0 ? t('caseLayout.tabHint.documents', { count: pendingDocs }) : k === 'communication' && unanswered > 0 ? t('caseLayout.tabHint.communication', { count: unanswered }) : undefined,
  }));
  const ball = (c as CaseDetail & { ballInCourt?: BallInCourt | null }).ballInCourt;
  const tabProps: CaseTabProps = { c, stats, isAdmin, goTo };

  return (
    <div ref={shellRef} className="stack-page" style={{ ['--case-header-h' as string]: '88px' }}>
      <CaseTopBar c={c} stats={stats} goTo={goTo} onEdit={() => setEditing(true)} onTemplate={() => setTemplate(true)} onPackage={openPackage} />

      {/* The two things to look at first, on every tab. */}
      <div className="flex flex-col gap-3">
        <Suspense fallback={ball ? <Skeleton className="h-14 w-full" rounded="xl" /> : null}>
          <BallStrip ball={ball} onDetails={() => goTo('case-ball-details')} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton rows={1} />}>
          <NextStepCard c={c} />
        </Suspense>
        <Suspense fallback={null}>
          <PackageWatcher caseId={c.id} onOpen={mountDocuments} />
        </Suspense>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div
            id="case-tabbar"
            className="z-20 -mx-4 mb-5 bg-surface px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-[calc(4rem+var(--case-header-h))] lg:mx-0 lg:px-0"
            onPointerOver={onTabHover}
            onFocus={onTabHover}
          >
            <Tabs label={t('caseLayout.tabsLabel')} idPrefix="case" items={items} value={tab} onChange={setTab} />
          </div>
          {CASE_TABS.filter((k) => mounted.has(k)).map((k) => {
            const View = TAB_VIEWS[k];
            return (
              <div key={k} hidden={k !== tab}>
                <TabPanel idPrefix="case" tabKey={k}>
                  <Suspense fallback={<TabSkeleton />}>
                    <View {...tabProps} />
                  </Suspense>
                </TabPanel>
              </div>
            );
          })}
        </div>
        <aside aria-label={t('caseLayout.aside.facts')} className="min-w-0">
          <CaseSummaryAside c={c} stats={stats} onEdit={() => setEditing(true)} onTemplate={() => setTemplate(true)} />
        </aside>
      </div>

      {editing && (
        <Suspense fallback={null}>
          <CaseDetailsDialog c={c} open onClose={() => setEditing(false)} />
        </Suspense>
      )}
      {template && (
        <Suspense fallback={null}>
          <FromTemplateDialog open onClose={() => setTemplate(false)} caseId={c.id} caseNumber={c.number} />
        </Suspense>
      )}
    </div>
  );
}
