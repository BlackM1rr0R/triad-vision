import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, Ban, Briefcase, FolderOpen, Hourglass, LayoutList, MessageCircle, MessageSquareWarning, MoreHorizontal, Sparkles, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { CLIENT_ACTION, STAFF_ACTION } from '@/lib/caseStatus';
import { useL10n } from '@/lib/l10n';
import { smoothScrollTo } from '@/lib/smoothScroll';
import type { CaseDetail } from '@/lib/types';
import { Tabs, TabPanel, useTabParam } from '@/components/ui/Tabs';
import { CaseViewSkeleton } from '@/components/portal/PortalSkeletons';
import { Reveal } from '@/components/motion';
import { StatusBadge } from '@/components/portal/StatusBadge';
import { CaseDocuments } from '@/components/portal/CaseDocuments';
import { CaseContract } from '@/components/portal/CaseContract';
import { CaseMessages } from '@/components/portal/CaseMessages';
import { AppointmentCard, CaseTimeline, DecisionCard, OtherFiles } from '@/components/portal/CaseCards';
import { useErrorMessage } from '@/components/portal/useApiError';
import { OVERVIEW_KEY, useHashScroll, useOverview } from '@/components/portal/useOverview';
import { TipsCard } from '@/components/portal/Dashboard';
import DocIntelPanel from '@/components/portal/DocIntelPanel';
import { ForecastStrip } from '@/components/journey/ForecastStrip';
import { JourneyCard } from '@/components/portal/JourneyCard';
import { useNextStep } from '@/components/portal/usePortalNav';
import { useMorphTarget } from '@/lib/viewTransition';
import { celebrateOnce } from '@/components/motion/celebrate';
import { FamilyGroupCard, useRelationLabel } from '@/components/journey/Family';
import { usePageTitle } from '@/lib/usePageTitle';
import { ClientOriginals } from '@/components/originals/ClientOriginals';
import ClientDataTasks from '@/components/clientData/ClientDataTasks';
import { FamilyMembersSection } from '@/components/family/FamilyMembersSection';
import { PortalTasks } from '@/components/clientProcess/PortalTasks'; // "MÉ™nim tapÅŸÄ±rÄ±qlarÄ±m"
import { ClientRecognitionCard } from '@/components/recognition/ClientRecognitionCard'; // Anerkennung status (read-only)
import { PortalOfficeVisits } from '@/components/clientProcess/PortalOfficeVisits'; // "OfisÉ™ gÉ™liÅŸ tÉ™yin et"
import { useFamilyOverview } from '@/components/family/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesPortalUx } from '@/i18n/pagesPortalUx';
import { NextUpCard, StickyBelowHeader } from './portal/NextUpCard';
import { CaseNumbers } from './portal/SecondaryCards';
import { NextItems } from './portal/NextItems';
import { tabOfAnchor, useNextUp, type CaseTab } from './portal/useNextUp';

registerCopy(pagesPortalUx);

const TABS = ['overview', 'docs', 'messages', 'family', 'other'] as const satisfies readonly CaseTab[];

const CurrentStepPanel = ({ data }: { data: CaseDetail }) => {
  const { t } = useTranslation();
  const clientTurn = CLIENT_ACTION.includes(data.status);
  const staffTurn = STAFF_ACTION.includes(data.status);

  return (
    <motion.section
      key={data.status}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        'card relative overflow-hidden p-5 sm:p-6',
        clientTurn && 'border-brand-400/40 ring-4 ring-brand-500/10',
      )}
      aria-labelledby="current-step-title"
    >
      <span
        className={clsx(
          'absolute inset-y-0 left-0 w-1.5',
          clientTurn ? 'bg-gradient-to-b from-brand-400 to-brand-700' : data.status === 'APPROVED' ? 'bg-success' : data.status === 'REJECTED' ? 'bg-danger' : data.status === 'CANCELLED' ? 'bg-slate-300' : 'bg-sky-400',
        )}
        aria-hidden
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <span
          className={clsx(
            'grid size-12 shrink-0 place-items-center rounded-xl',
            clientTurn ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : data.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' : 'bg-sky-100 text-sky-700',
          )}
        >
          {clientTurn ? <Sparkles className="size-6" aria-hidden /> : data.status === 'CANCELLED' ? <Ban className="size-6" aria-hidden /> : <Hourglass className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">{t('portal.currentStep')}</span>
            {clientTurn && (
              <span className="badge bg-amber-100 text-amber-800">
                <span className="size-2 rounded-full bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]" aria-hidden />
                {t('portal.actionRequired')}
              </span>
            )}
            {staffTurn && <span className="badge bg-sky-100 text-sky-800">{t('portal.waiting')}</span>}
          </div>
          <h2 id="current-step-title" className="mt-2 text-xl font-extrabold break-words text-navy-900 sm:text-[1.7rem]">
            {t(`portal.status.${data.status}`)}
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted">{t(`portal.statusHelp.${data.status}`)}</p>
          {staffTurn && <p className="mt-2 text-sm font-medium text-sky-700">{t('portal.waitingUs')}</p>}

          {data.status === 'CANCELLED' && data.cancelReason && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm whitespace-pre-line text-slate-700">{data.cancelReason}</p>
          )}

          {data.staffNote && (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">{t('portal.staffNote')}</p>
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-line text-amber-950">{data.staffNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
};

type MsgWithRead = CaseDetail['messages'][number] & { readAt?: string | null };

/** The header slides in, except when it is the end of a morph from the portal home (it is already in place). */
const HeaderReveal = ({ still, children }: { still: boolean; children: ReactNode }) => (still ? <>{children}</> : <Reveal y={16}>{children}</Reveal>);

export default function CaseView() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const relationLabel = useRelationLabel();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam('tab', TABS, 'overview');
  const tabsRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['case', id],
    queryFn: async () => (await api.get<{ case: CaseDetail }>(`/cases/${id}`)).data.case,
    refetchInterval: 30_000,
    enabled: !!id,
  });
  usePageTitle(data ? `${t('portal.caseNo')} ${data.number}` : t('portal.title'));
  const next = useNextUp(id);
  // Journey map: the portal's next-step data is about one case (the primary one), shown only on that case.
  const nextStep = useNextStep(user?.role === 'CLIENT');
  // The portal home's next-step card morphs into this heading (View Transitions; off with reduced motion).
  const morph = useMorphTarget('portal-next', 'step');
  const { data: overview } = useOverview();
  const familyQ = useFamilyOverview(id);
  const family = data as (CaseDetail & { parentCaseId?: string | null; relation?: string | null }) | undefined;
  // "Ailə" tab: member cases, and main applicants who already have members. Otherwise the "add a
  // family member" section stays reachable under "Digər".
  const familyTab = !!family?.parentCaseId || (!!familyQ.data && familyQ.data.main.id === id && familyQ.data.members.length > 0);

  const refresh = useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['case', id] }),
        qc.invalidateQueries({ queryKey: ['cases'] }),
        qc.invalidateQueries({ queryKey: ['notifications'] }),
        qc.invalidateQueries({ queryKey: OVERVIEW_KEY }),
      ]),
    [qc, id],
  );

  // Old links point at anchors (#docs-initial, #messages, #contract, …): open the tab that holds them and
  // keep the hash, so useHashScroll scrolls there once it is rendered.
  const { hash, search, pathname } = location;
  useEffect(() => {
    let want = tabOfAnchor(hash);
    if (want === 'family' && !familyTab) want = 'other';
    if (!want || want === tab) return;
    const p = new URLSearchParams(search);
    if (want === 'overview') p.delete('tab');
    else p.set('tab', want);
    const qs = p.toString();
    navigate({ pathname, search: qs ? `?${qs}` : '', hash }, { replace: true });
    // only when the hash (or the family tab) changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, familyTab]);
  useHashScroll(!!data);
  // Every navigation scrolls to the top (layout/Effects), so after switching to the anchor's tab scroll
  // to the anchor once more.
  const ready = !!data;
  useEffect(() => {
    if (!ready || !hash || tabOfAnchor(hash) !== tab) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) smoothScrollTo(el, { offset: -160 });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [ready, hash, tab]);
  // Switching tabs further down the page: keep the tab bar in view instead of jumping to the page top.
  const selectTab = (key: CaseTab) => {
    const below = (tabsRef.current?.getBoundingClientRect().top ?? 0) < 0;
    setTab(key);
    if (below) window.setTimeout(() => tabsRef.current && smoothScrollTo(tabsRef.current, { immediate: true, offset: -150 }), 30);
  };

  // Visa approved: one confetti burst the first time the client sees it on this device (no-op for reduced motion).
  const approvedId = data?.status === 'APPROVED' ? data.id : null;
  useEffect(() => {
    if (!approvedId) return;
    const timer = window.setTimeout(() => celebrateOnce(`visa-approved:${approvedId}`, { count: 110 }), 450);
    return () => window.clearTimeout(timer);
  }, [approvedId]);

  if (isLoading) return <CaseViewSkeleton />;
  if (error || !data || !family) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{error ? errorMessage(error) : t('common.error')}</p>
        <Link to="/account" className="btn-primary mt-6">
          <ArrowLeft className="size-4" aria-hidden />
          {t('portal.myCases')}
        </Link>
      </div>
    );
  }

  const contractFirst = data.status === 'CONTRACT_SENT' || data.status === 'CONTRACT_SIGNED';
  const embassyFirst = data.status === 'EMBASSY_DOCUMENTS' || data.status === 'EMBASSY_REVIEW';
  const contract = data.contract ? <CaseContract key="contract" data={data} onChanged={refresh} /> : null;
  const initialDocs = <CaseDocuments key="initial" data={data} stage="INITIAL" onChanged={refresh} />;
  const embassyDocs = <CaseDocuments key="embassy" data={data} stage="EMBASSY" onChanged={refresh} />;
  // Document intelligence (OCR / checks) sits right under the documents being worked on.
  const docIntel = <DocIntelPanel key="doc-intel" caseId={data.id} />;
  const mainBlocks = contractFirst
    ? [contract, initialDocs, docIntel, embassyDocs]
    : embassyFirst
      ? [embassyDocs, docIntel, contract, initialDocs]
      : data.status === 'DOCUMENTS_PENDING' || data.status === 'DOCUMENTS_REVIEW'
        ? [initialDocs, docIntel, contract, embassyDocs]
        : [embassyDocs, docIntel, contract, initialDocs];
  const relation = relationLabel(family.relation);
  const unread = data.messages.filter((m) => m.author.id !== user?.id && !(m as MsgWithRead).readAt).length;
  const activeCase = overview?.activeCase?.id === data.id ? overview.activeCase : null;
  const closed = ['APPROVED', 'REJECTED', 'CANCELLED'].includes(data.status);
  const current: CaseTab = tab === 'family' && !familyTab ? 'overview' : tab;

  const tabs = [
    { key: 'overview' as const, label: t('pux.caseTabs.overview'), icon: LayoutList, count: next.allItems.length || undefined },
    { key: 'docs' as const, label: t('pux.caseTabs.docs'), icon: FolderOpen },
    { key: 'messages' as const, label: t('pux.caseTabs.messages'), icon: MessageCircle, count: unread || undefined },
    ...(familyTab ? [{ key: 'family' as const, label: t('pux.caseTabs.family'), icon: Users }] : []),
    { key: 'other' as const, label: t('pux.caseTabs.other'), icon: MoreHorizontal },
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Header */}
      <HeaderReveal still={morph.arrived}>
        <div className="min-w-0">
          <Link to="/account" className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
            <ArrowLeft className="size-4" aria-hidden />
            {t('portal.myCases')}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="type-page-title break-words" {...morph.part('title')}>
              <span className="text-muted">{t('portal.caseNo')}</span> {data.number}
            </h1>
            <StatusBadge status={data.status} className="text-sm" />
            {relation && <span className="badge bg-accent-bg text-accent-fg">{relation}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Briefcase className="size-4 shrink-0" aria-hidden />
              <span className="font-medium text-ink">{data.profession}</span>
            </span>
            {data.visaCategory && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="badge shrink-0 whitespace-nowrap bg-navy-900 text-white">{data.visaCategory.visaLabel}</span>
                {tr(data.visaCategory.title)}
              </span>
            )}
            {data.assignedStaff && (
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="size-4" aria-hidden />
                {t('portal.manager')}:{' '}
                <span className="font-medium text-ink">
                  {data.assignedStaff.firstName} {data.assignedStaff.lastName}
                </span>
              </span>
            )}
          </div>
        </div>
      </HeaderReveal>

      {/* "What's next" stays on screen while scrolling through any tab. */}
      <StickyBelowHeader>
        <NextUpCard next={next} variant="compact" tour="case-next" />
      </StickyBelowHeader>

      <div ref={tabsRef}>
        <Tabs label={t('pux.caseTabs.label')} idPrefix="case" value={current} onChange={selectTab} items={tabs} />
      </div>

      <TabPanel idPrefix="case" tabKey={current} className="space-y-6">
        {current === 'overview' && (
          <>
            <CurrentStepPanel data={data} />
            {/* Every other open item (the portal home shows only the top three). */}
            <NextItems items={next.items} short={next.short} />
            <ClientDataTasks caseId={data.id} />
            <DecisionCard data={data} />
            <AppointmentCard data={data} />
            <PortalTasks caseId={data.id} onChanged={refresh} />
            {/* Recognition of the qualification (read-only; nothing when the case has none). */}
            <ClientRecognitionCard caseId={data.id} />
            {/* Home city → German city with the six milestones (primary case only). */}
            {nextStep.data?.case?.id === data.id && <JourneyCard next={nextStep.data} />}
            {/* One timeline: steps with their dates. */}
            <div id="forecast" className="scroll-mt-40">
              <ForecastStrip caseId={data.id} />
            </div>
          </>
        )}

        {current === 'docs' && (
          <>
            {mainBlocks}
            <OtherFiles data={data} />
            <div id="originals" className="scroll-mt-40 empty:hidden">
              <ClientOriginals caseId={data.id} />
            </div>
          </>
        )}

        {current === 'messages' && (
          <div className="mx-auto max-w-3xl">
            <CaseMessages data={data} onChanged={refresh} />
          </div>
        )}

        {current === 'family' && (
          <>
            {/* Main applicant: "Ailə üzvləri" with each member's checklist and uploads. */}
            {!family.parentCaseId && <FamilyMembersSection caseId={data.id} />}
            {family.parentCaseId && <FamilyGroupCard caseId={data.id} parentCaseId={family.parentCaseId} />}
          </>
        )}

        {current === 'other' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
            <div className="space-y-6">
              {!familyTab && !family.parentCaseId && <FamilyMembersSection caseId={data.id} />}
              <PortalOfficeVisits caseId={data.id} closed={closed} />
              {activeCase && <CaseNumbers c={activeCase} />}
              <TipsCard status={data.status} />
            </div>
            <aside className="space-y-6">
              <div id="timeline" className="scroll-mt-40">
                <CaseTimeline data={data} />
              </div>
              <p className="type-caption">{t('pux.caseTabs.dates', { created: date(data.createdAt), updated: date(data.updatedAt) })}</p>
            </aside>
          </div>
        )}
      </TabPanel>
    </div>
  );
}
