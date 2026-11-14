import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, ChevronDown, ChevronRight, ChevronUp, Filter, Flame, Inbox, Search, SlidersHorizontal, User, UserCheck, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import {
  INQUIRY_KINDS,
  INQUIRY_STATUSES,
  fmtDateTime,
  fmtRelative,
  inquiryKindLabel,
  inquiryStatusLabel,
  type InquiryStatus,
} from '@/components/admin/labels';
import type { InquiriesResponse, Inquiry } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, PageHead, StatTile } from '@/components/admin/ui';
import { Skeleton, SkeletonStat } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { LEAD_LEVELS, useLeadScoring, type LeadLevel, type ScoreReason } from '@/components/marketing/api';
import { LeadScoreBadge } from '@/components/marketing/LeadScore';
import { LeadScoringSettingsDrawer } from '@/components/marketing/LeadScoringSettings';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { pagesInquiries } from '@/i18n/pagesInquiries';
import { InquiryDetailBody, InquiryPresence, InquiryStatusCell } from '@/components/admin/split/InquiryDetail'; // inline status, presence
import { InquiryBadges, inquiryItemKey } from '@/components/admin/split/InquiryWork';
import { Drawer } from '@/components/ui/Drawer';
import { IconButton } from '@/components/ui/Button';
import { SavedFilterTabs } from '@/components/casesList/SavedFilterTabs'; // saved filters as tabs (shared with Müraciətlər)
import { useDrawerParam } from '@/components/casesList/api'; // ?open=<id> drawer, browser back closes it
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { useListNav } from '@/components/shortcuts/useListNav';
import { requestInlineEdit } from '@/components/inline/optimistic';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { pagesStaffPower } from '@/i18n/pagesStaffPower'; // saved views, table settings, bulk actions
import { ColumnChooser, SettingsTable, ViewModeToggle, useTableSettings, type ColumnDef } from '@/components/staffPower/tableSettings';
import { useRowSelection } from '@/components/staffPower/selection';
import { InquiriesBulkBar } from '@/components/staffPower/BulkBar';

registerCopy(pagesMarketing);
registerCopy(pagesAdminUx);
registerCopy(pagesStaffPower);
registerCopy(pagesInquiries);
registerCopy(pagesCasesList);

/** Lead scoring fields on every inquiry (server lib/marketing/leadScoring.ts). */
type Scored = Inquiry & { score?: number; scoreLevel?: LeadLevel | null; scoreReasons?: ScoreReason[] | null };
const SORTS = ['hot', 'score', 'newest', 'oldest', 'workers'] as const;
type SortKey = (typeof SORTS)[number];
const PAGE_SIZE = 50;

const KEY = ['admin-inquiries'] as const;
/** Server filters, all kept in the URL (saved views store them; `page` / `open` are transient). */
const FILTER_KEYS = ['q', 'status', 'kind', 'level', 'sort', 'assignee', 'source', 'via', 'from', 'to', 'converted'] as const;
/** Filters behind the "Filtrlər" button (their count shows on it). */
const PANEL_KEYS = ['assignee', 'source', 'via', 'from', 'to', 'converted'] as const;

export default function Inquiries() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InquiryStatus | null) ?? null;
  const kind = params.get('kind');
  const level = params.get('level');
  const sort = (SORTS as readonly string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as SortKey) : 'hot';
  const assignee = params.get('assignee');
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  // Quick-view drawer (?open=<id>: a notification links here with it; pushing it lets the back button close it).
  const drawer = useDrawerParam('open');
  const open = drawer.id;
  const [rulesOpen, setRulesOpen] = useState(false);
  const panelCount = PANEL_KEYS.filter((k) => k !== 'assignee' && params.get(k)).length;
  const [filtersOpen, setFiltersOpen] = useState(panelCount > 0);
  const { user } = useAuth();
  const { data: scoring } = useLeadScoring();
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page'); // every filter change starts on page 1
    setParams(next, { replace: true });
  };

  // Search: debounced into ?q= (a saved view keeps it too).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const v = qInput.trim();
      if ((params.get('q') ?? '') !== v) setParam('q', v || null);
    }, 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  useEffect(() => {
    const v = params.get('q') ?? '';
    if (v !== qInput.trim()) setQInput(v); // a saved view / back button changed it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('q')]);

  const apiParams = useMemo(() => {
    const out: Record<string, string> = { page: String(page), pageSize: String(PAGE_SIZE) };
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    return out;
  }, [params, page]);
  const filterKey = JSON.stringify({ ...apiParams, page: undefined });

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [...KEY, apiParams],
    queryFn: async () => (await api.get<InquiriesResponse>('/admin/inquiries', { params: apiParams })).data,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
  });

  const items = (data?.items ?? []) as Scored[];
  // The lead named in ?open= is fetched on its own when it is not on the current page.
  const openMissing = !!open && !!data && !items.some((i) => i.id === open);
  const { data: openItem } = useQuery({
    queryKey: inquiryItemKey(open ?? ''),
    queryFn: async () => (await api.get<{ item: Scored }>(`/admin/inquiries/${open}`)).data.item,
    enabled: openMissing,
  });
  const openIndex = open ? items.findIndex((i) => i.id === open) : -1;
  const drawerItem = openIndex >= 0 ? items[openIndex] : openMissing ? openItem : undefined;
  const summary = data?.summary;
  const facets = data?.facets;
  const total = data?.total ?? 0;
  const counts = summary?.byStatus ?? {};
  const hotOpen = summary?.hotOpen ?? 0;

  // Multi-select for the bulk bar (checkboxes, Shift + click range, whole page) and the per-user table settings.
  const sel = useRowSelection(
    items.map((i) => i.id),
    `${filterKey}|${page}`,
  );
  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { id: 'contact', label: t('sp.inq.contact'), required: true },
      { id: 'kind', label: t('sp.inq.kind') },
      { id: 'score', label: t('sp.inq.score') },
      { id: 'status', label: t('sp.inq.status') },
      { id: 'assignee', label: t('inq.col.assignee') },
      { id: 'origin', label: t('inq.col.origin'), defaultHidden: true },
      { id: 'email', label: t('sp.inq.email') },
      { id: 'phone', label: t('sp.inq.phone'), defaultHidden: true },
      { id: 'sector', label: t('sp.inq.sector'), defaultHidden: true },
      { id: 'workers', label: t('sp.inq.workers'), align: 'right' },
      { id: 'message', label: t('sp.inq.message'), width: 320 },
      { id: 'created', label: t('sp.inq.created'), align: 'right', className: 'text-xs whitespace-nowrap text-muted' },
    ],
    [t],
  );
  const table = useTableSettings('inquiries', columnDefs);
  const tableMode = table.mode === 'table';

  // Keyboard cursor (?selected=<id>): J / K move, Enter opens the drawer, E edits inline, "/" searches, Esc clears.
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = params.get('selected');
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('selected', id);
    else next.delete('selected');
    setParams(next, { replace: true });
  };
  useListNav({
    ids: items.map((i) => i.id),
    selected,
    onSelect: select,
    onOpen: (id) => drawer.open(id),
    onEdit: (id) => requestInlineEdit(id),
    searchRef,
    titleKey: 'ux.shortcuts.lists.inquiries',
    enabled: !open,
  });

  const sourceLabel = (key: string) => (t(`inq.sources.${key}`, { defaultValue: key }) as string);
  const originOf = (i: Scored) => (i.agent ? t('inq.badge.agent', { name: i.agent.name }) : i.partner ? t('inq.badge.partner', { name: i.partner.name }) : i.source || sourceLabel('web'));
  const labelOf = (id: string) => {
    const i = items.find((x) => x.id === id);
    return i ? i.companyName || i.contactName : id;
  };
  const anyFilter = FILTER_KEYS.some((k) => k !== 'sort' && params.get(k));
  const resetFilters = () => {
    const next = new URLSearchParams(params);
    for (const k of FILTER_KEYS) if (k !== 'sort') next.delete(k);
    next.delete('page');
    next.delete('sv');
    setQInput('');
    setParams(next, { replace: true });
  };

  const pager = total > PAGE_SIZE && <Pagination className="mt-4" page={data?.page ?? page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onChange={(p) => setParam('page', p > 1 ? String(p) : null)} />;
  const bulkBar = <InquiriesBulkBar sel={sel} total={items.length} pageCount={items.length} labelOf={labelOf} invalidate={[KEY, ['admin-dashboard'], ['my-work']]} placement="bottom" />;
  const rowTone = (i: Scored) => clsx(i.status === 'NEW' && 'bg-primary/[0.04]', i.id === open ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_var(--color-brand-600)]' : i.id === selected && 'shadow-[inset_3px_0_0_var(--color-line-strong)]');

  return (
    <div>
      <PageHead
        title={t('admin.nav.inquiries')}
        subtitle={t('admin.inquiries.subtitle')}
        actions={
          <button type="button" className="btn-secondary btn-sm" onClick={() => setRulesOpen(true)}>
            <SlidersHorizontal className="size-4" aria-hidden /> {t('mk.lead.settings.open')}
          </button>
        }
      />
      <LeadScoringSettingsDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} canEdit={hasMinRole(user?.role, 'ADMIN')} />

      {isLoading && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5" role="status" aria-label={t('admin.common.loading')}>
          {Array.from({ length: 5 }, (_, n) => (
            <SkeletonStat key={n} />
          ))}
        </div>
      )}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          <StatTile label={t('admin.inquiries.new7d')} value={summary.new7d} icon={Inbox} />
          <StatTile label={t('mk.lead.hotTile')} value={hotOpen} icon={Flame} tone={hotOpen > 0 ? 'warn' : undefined} hint={t('mk.lead.hotTileHint', { n: scoring?.settings.thresholds.hot ?? 60 })} />
          <StatTile
            label={t('admin.inquiries.oldestOpen')}
            value={summary.oldestOpenDays === null ? '—' : t('admin.common.days', { count: summary.oldestOpenDays })}
            tone={summary.oldestOpenDays !== null && summary.oldestOpenDays >= 3 ? 'warn' : undefined}
            hint={summary.oldestOpenDays === null ? t('admin.inquiries.noNew') : t('admin.inquiries.awaitingReply')}
          />
          <StatTile label={t('admin.inquiries.companyContact')} value={`${summary.byKind.company ?? 0} / ${summary.byKind.contact ?? 0}`} hint={t('admin.inquiries.companyContactHint')} icon={Building2} />
          <StatTile label={t('admin.inquiries.workersRequested')} value={summary.workersRequested} hint={t('admin.inquiries.workersHint')} icon={Users} />
        </div>
      )}

      <SavedFilterTabs page="inquiries" settings={table} className="mb-3" />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={searchRef} type="search" className="input pl-9" placeholder={t('admin.inquiries.searchPlaceholder')} value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </label>
          <select aria-label={t('mk.lead.filterLevel')} className="input sm:w-40" value={level ?? ''} onChange={(e) => setParam('level', e.target.value || null)}>
            <option value="">{t('mk.lead.allLevels')}</option>
            {LEAD_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`mk.lead.levels.${l}`)}
              </option>
            ))}
            <option value="NONE">{t('inq.filters.levelNone')}</option>
          </select>
          <select aria-label={t('mk.lead.sort')} className="input sm:w-48" value={sort} onChange={(e) => setParam('sort', e.target.value === 'hot' ? null : e.target.value)}>
            <option value="hot">{t('mk.lead.sortHot')}</option>
            <option value="score">{t('mk.lead.sortScore')}</option>
            <option value="newest">{t('mk.lead.sortNewest')}</option>
            <option value="oldest">{t('inq.sort.oldest')}</option>
            <option value="workers">{t('inq.sort.workers')}</option>
          </select>
          <select aria-label={t('admin.inquiries.kindAria')} className="input sm:w-52" value={kind ?? ''} onChange={(e) => setParam('kind', e.target.value || null)}>
            <option value="">{t('admin.inquiries.allKinds')}</option>
            {INQUIRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {inquiryKindLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((v) => !v)}
              className={clsx('btn-secondary btn-sm', panelCount > 0 && 'border-line-strong')}
            >
              <Filter className="size-3.5" aria-hidden /> {t('inq.filters.more')}
              {panelCount > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-[11px] text-link">{panelCount}</span>}
            </button>
            <Chip active={assignee === 'me'} onClick={() => setParam('assignee', assignee === 'me' ? null : 'me')} count={summary?.mine ?? 0}>
              {t('inq.filters.mine')}
            </Chip>
            <Chip active={assignee === 'none'} onClick={() => setParam('assignee', assignee === 'none' ? null : 'none')} count={summary?.unassigned ?? 0}>
              {t('inq.filters.unassigned')}
            </Chip>
            {anyFilter && (
              <button type="button" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-line/60 hover:text-ink" onClick={resetFilters}>
                <X className="size-3.5" aria-hidden /> {t('inq.filters.reset')}
              </button>
            )}
            {data && (
              <span className={clsx('text-xs text-muted', isFetching && 'opacity-60')} aria-live="polite">
                {t('inq.found', { count: total })}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewModeToggle settings={table} />
            {tableMode && <ColumnChooser settings={table} />}
          </div>
        </div>
        {filtersOpen && (
          <div className="grid gap-2 rounded-xl border border-line bg-card p-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.assignee')}</span>
              <select className="input" value={assignee ?? ''} onChange={(e) => setParam('assignee', e.target.value || null)}>
                <option value="">{t('inq.filters.allAssignees')}</option>
                <option value="me">{t('inq.filters.mine')}</option>
                <option value="none">{t('inq.filters.unassigned')}</option>
                {(facets?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.source')}</span>
              <select className="input" value={params.get('source') ?? ''} onChange={(e) => setParam('source', e.target.value || null)}>
                <option value="">{t('inq.filters.allSources')}</option>
                {(facets?.sources ?? [])
                  .filter((s) => s.key !== 'other')
                  .map((s) => (
                    <option key={s.key} value={s.key}>
                      {sourceLabel(s.key)} ({s.count})
                    </option>
                  ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.via')}</span>
              <select className="input" value={params.get('via') ?? ''} onChange={(e) => setParam('via', e.target.value || null)}>
                <option value="">{t('inq.filters.allVia')}</option>
                <optgroup label={t('inq.filters.agents')}>
                  <option value="agent">{t('inq.filters.anyAgent')}</option>
                  {(facets?.agents ?? []).map((a) => (
                    <option key={a.id} value={`agent:${a.id}`}>
                      {a.name} · {a.code} ({a.count})
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('inq.filters.partners')}>
                  <option value="partner">{t('inq.filters.anyPartner')}</option>
                  {(facets?.partners ?? []).map((p) => (
                    <option key={p.id} value={`partner:${p.id}`}>
                      {p.name} ({p.count})
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.from')}</span>
              <input type="date" className="input" value={params.get('from') ?? ''} max={params.get('to') ?? undefined} onChange={(e) => setParam('from', e.target.value || null)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.to')}</span>
              <input type="date" className="input" value={params.get('to') ?? ''} min={params.get('from') ?? undefined} onChange={(e) => setParam('to', e.target.value || null)} />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold text-muted">{t('inq.filters.converted')}</span>
              <select className="input" value={params.get('converted') ?? ''} onChange={(e) => setParam('converted', e.target.value || null)}>
                <option value="">{t('inq.filters.allConverted')}</option>
                <option value="yes">{t('inq.filters.convertedYes')}</option>
                <option value="no">{t('inq.filters.convertedNo')}</option>
              </select>
            </label>
          </div>
        )}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Chip active={!status} onClick={() => setParam('status', null)} count={Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)}>
            {t('admin.common.all')}
          </Chip>
          {INQUIRY_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => setParam('status', status === s ? null : s)} count={counts[s] ?? 0}>
              {inquiryStatusLabel(s)}
            </Chip>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card" aria-hidden>
          {Array.from({ length: 6 }, (_, n) => (
            <li key={n} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
              <Skeleton className="mt-0.5 size-8 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-5 w-20 shrink-0" rounded="full" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Inbox} title={t('admin.inquiries.notFound')}>
            {anyFilter && (
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={resetFilters}>
                {t('inq.filters.reset')}
              </button>
            )}
          </EmptyState>
        </div>
      ) : tableMode ? (
        <>
          <SettingsTable
            settings={table}
            rows={items}
            rowKey={(i) => i.id}
            caption={t('admin.nav.inquiries')}
            selection={sel.props}
            selectLabel={t('sp.select.row')}
            selectAllLabel={t('sp.select.page')}
            tableClassName="min-w-[1080px]"
            onRowClick={(i) => drawer.open(i.id)}
            rowProps={(i) => ({ 'aria-current': i.id === open || undefined })}
            rowClassName={(i) => rowTone(i)}
            cells={{
              contact: (i) => (
                <>
                  <p className="font-semibold break-words text-ink">{i.companyName || i.contactName}</p>
                  {i.companyName && <p className="text-xs text-muted">{i.contactName}</p>}
                  <InquiryBadges i={i} className="mt-1" />
                </>
              ),
              kind: (i) => <span className="text-xs whitespace-nowrap text-muted">{inquiryKindLabel(i.kind)}</span>,
              score: (i) => <LeadScoreBadge level={i.scoreLevel ?? null} score={i.score ?? 0} reasons={i.scoreReasons ?? null} />,
              status: (i) => <InquiryStatusCell item={i} />,
              assignee: (i) => <span className={clsx('text-xs whitespace-nowrap', !i.assignedStaff && 'text-muted')}>{i.assignedStaff?.name ?? '—'}</span>,
              origin: (i) => <span className="text-xs">{originOf(i)}</span>,
              email: (i) => <a href={`mailto:${i.email}`} onClick={(e) => e.stopPropagation()} className="text-xs break-all text-link hover:underline">{i.email}</a>,
              phone: (i) => <span className="text-xs whitespace-nowrap">{i.phone ?? '—'}</span>,
              sector: (i) => <span className="text-xs">{i.sector ?? '—'}</span>,
              workers: (i) => <span className="tabular-nums">{i.workersNeeded ?? '—'}</span>,
              message: (i) => <p className="line-clamp-2 text-xs text-muted">{i.message}</p>,
              created: (i) => <span title={fmtDateTime(i.createdAt)}>{fmtRelative(i.createdAt)}</span>,
            }}
          />
          {pager}
          {bulkBar}
        </>
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
            {items.length > 1 && (
              <li className="flex items-center gap-3 bg-surface/70 px-4 py-2 text-xs text-muted sm:px-5" data-tour="sp-select-all">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  aria-label={t('sp.select.page')}
                  checked={sel.allOnPage}
                  onChange={(e) => sel.props.togglePage(e.target.checked)}
                />
                <span>{t('sp.select.page')}</span>
              </li>
            )}
            {items.map((i) => (
              <li key={i.id} data-row-id={i.id} className={rowTone(i)}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  aria-current={i.id === open || undefined}
                  onClick={() => drawer.open(i.id)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      drawer.open(i.id);
                    }
                  }}
                  className="group flex cursor-pointer items-start gap-3 px-4 py-3.5 transition outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset sm:px-5"
                >
                  <input
                    type="checkbox"
                    className="mt-2 size-4 shrink-0 cursor-pointer accent-primary"
                    aria-label={`${t('sp.select.row')}: ${i.companyName || i.contactName}`}
                    checked={sel.props.isSelected(i.id)}
                    onKeyDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      sel.props.toggle(i.id, e.currentTarget.checked, e.shiftKey);
                    }}
                    onChange={() => {
                      /* handled in onClick (needs shiftKey) */
                    }}
                  />
                  <span
                    className={clsx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', i.kind === 'company' ? 'bg-accent-bg text-accent-fg' : 'bg-primary/10 text-link')}
                    aria-hidden
                  >
                    {i.kind === 'company' ? <Building2 className="size-4" /> : <User className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 font-semibold break-words text-ink">{i.companyName || i.contactName}</span>
                      {i.companyName && <span className="text-muted">{i.contactName}</span>}
                      <span className="text-[11px] whitespace-nowrap text-muted">{inquiryKindLabel(i.kind)}</span>
                      <LeadScoreBadge level={i.scoreLevel ?? null} score={i.score ?? 0} reasons={i.scoreReasons ?? null} />
                      <InquiryBadges i={i} />
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{i.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    {i.assignedStaff && (
                      <span className="hidden items-center gap-1 text-[11px] whitespace-nowrap text-muted md:inline-flex" title={t('inq.owner.label')}>
                        <UserCheck className="size-3" aria-hidden /> {i.assignedStaff.name}
                      </span>
                    )}
                    <span className="text-[11px] whitespace-nowrap text-muted" title={fmtDateTime(i.createdAt)}>
                      {fmtRelative(i.createdAt)}
                    </span>
                    <InquiryStatusCell item={i} />
                    <ChevronRight className="hidden size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-muted sm:block" aria-hidden />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {pager}
          {bulkBar}
        </>
      )}

      <Drawer
        open={!!open}
        onClose={drawer.close}
        width="lg"
        title={drawerItem ? drawerItem.companyName || drawerItem.contactName : '…'}
        description={
          drawerItem
            ? [inquiryKindLabel(drawerItem.kind), fmtDateTime(drawerItem.createdAt), drawerItem.assignedStaff ? t('inq.owner.assigned', { name: drawerItem.assignedStaff.name }) : null].filter(Boolean).join(' · ')
            : undefined
        }
        headerActions={
          <>
            {open && <InquiryPresence id={open} className="mr-1 hidden sm:flex" />}
            {openIndex > 0 && <IconButton icon={ChevronUp} label={t('cl.drawer.prev')} size="sm" onClick={() => drawer.open(items[openIndex - 1].id)} />}
            {openIndex >= 0 && openIndex < items.length - 1 && <IconButton icon={ChevronDown} label={t('cl.drawer.next')} size="sm" onClick={() => drawer.open(items[openIndex + 1].id)} />}
          </>
        }
        bodyClassName="bg-surface/40"
      >
        {drawerItem ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <InquiryStatusCell item={drawerItem} />
              <LeadScoreBadge level={drawerItem.scoreLevel ?? null} score={drawerItem.score ?? 0} reasons={drawerItem.scoreReasons ?? null} />
            </div>
            <InquiryDetailBody i={drawerItem} />
          </div>
        ) : (
          <div className="space-y-3" aria-busy>
            <Skeleton className="h-16 w-full" rounded="xl" />
            <Skeleton className="h-32 w-full" rounded="xl" />
          </div>
        )}
      </Drawer>
    </div>
  );
}
