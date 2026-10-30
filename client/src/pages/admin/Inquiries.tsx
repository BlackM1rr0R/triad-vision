import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, ChevronDown, Columns2, Filter, Flame, Inbox, Search, SlidersHorizontal, User, UserCheck, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import {
  INQUIRY_KINDS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_TONE,
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
import { InquiryDetailBody, InquiryPresence, InquirySplitPanel, InquiryStatusCell } from '@/components/admin/split/InquiryDetail'; // inline status, split panel, presence
import { InquiryBadges, inquiryItemKey } from '@/components/admin/split/InquiryWork';
import { useSplitView } from '@/components/admin/split/useSplitView';
import { useListNav } from '@/components/shortcuts/useListNav';
import { requestInlineEdit } from '@/components/inline/optimistic';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { pagesStaffPower } from '@/i18n/pagesStaffPower'; // saved views, table settings, bulk actions
import { SavedViewsMenu } from '@/components/staffPower/SavedViews';
import { ColumnChooser, SettingsTable, ViewModeToggle, useTableSettings, type ColumnDef } from '@/components/staffPower/tableSettings';
import { useRowSelection } from '@/components/staffPower/selection';
import { InquiriesBulkBar } from '@/components/staffPower/BulkBar';

registerCopy(pagesMarketing);
registerCopy(pagesAdminUx);
registerCopy(pagesStaffPower);
registerCopy(pagesInquiries);

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
  const [open, setOpen] = useState<string | null>(() => params.get('open'));
  const [rulesOpen, setRulesOpen] = useState(false);
  const panelCount = PANEL_KEYS.filter((k) => k !== 'assignee' && params.get(k)).length;
  const [filtersOpen, setFiltersOpen] = useState(panelCount > 0);
  const { user } = useAuth();
  const { data: scoring } = useLeadScoring();
  // A notification links here with ?open=<id>: expand that inquiry once (fetched even when it is not on this page).
  useEffect(() => {
    const id = params.get('open');
    if (id) setOpen(id);
  }, [params]);

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

  const pageItems = (data?.items ?? []) as Scored[];
  // The lead named in ?open= is shown on top when it is not on the current page.
  const openMissing = !!open && !!data && !pageItems.some((i) => i.id === open);
  const { data: openItem } = useQuery({
    queryKey: inquiryItemKey(open ?? ''),
    queryFn: async () => (await api.get<{ item: Scored }>(`/admin/inquiries/${open}`)).data.item,
    enabled: openMissing,
  });
  const items = openMissing && openItem ? [openItem, ...pageItems] : pageItems;
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

  // Split view (list left, inquiry right) and keyboard selection (?selected=<id>): J / K, Enter, E, "/", Esc.
  const split = useSplitView('inquiries');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedItem = items.find((i) => i.id === split.selected);
  useListNav({
    ids: items.map((i) => i.id),
    selected: split.selected,
    onSelect: split.select,
    onOpen: split.active ? undefined : (id) => setOpen((cur) => (cur === id ? null : id)),
    onEdit: (id) => requestInlineEdit(id),
    onEscape: () => (open && !split.active ? setOpen(null) : split.select(null)),
    searchRef,
    titleKey: 'ux.shortcuts.lists.inquiries',
    extra: split.wide ? [{ id: 'split', keys: ['s'], labelKey: 'ux.shortcuts.keys.split', handler: split.toggle }] : [],
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
  const bulkBar = <InquiriesBulkBar sel={sel} total={items.length} pageCount={items.length} labelOf={labelOf} invalidate={[KEY, ['admin-dashboard'], ['my-work']]} />;

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

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={searchRef} type="search" className="input pl-9" placeholder={t('admin.inquiries.searchPlaceholder')} value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </label>
          <button
            type="button"
            aria-pressed={split.enabled}
            onClick={split.toggle}
            title={t('ux.split.toggleHint')}
            className={clsx(
              'hidden min-h-10 sm:min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap transition lg:inline-flex',
              split.enabled ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
            )}
          >
            <Columns2 className="size-4" aria-hidden /> {t('ux.split.toggle')}
          </button>
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
            <SavedViewsMenu page="inquiries" settings={table} />
            {!split.active && <ViewModeToggle settings={table} />}
            {tableMode && !split.active && <ColumnChooser settings={table} />}
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
      ) : split.active ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] xl:gap-6">
          <div>
            <ul className="max-h-[calc(100dvh-12rem)] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-card lg:sticky lg:top-20" aria-label={t('admin.nav.inquiries')}>
              {items.map((i) => {
                const on = i.id === split.selected;
                return (
                  <li key={i.id} data-row-id={i.id}>
                    <button
                      type="button"
                      aria-current={on || undefined}
                      onClick={() => split.select(i.id)}
                      className={clsx(
                        'block w-full px-4 py-3 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset',
                        on ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_var(--color-brand-600)]' : i.status === 'NEW' ? 'bg-primary/[0.04] hover:bg-sunken' : 'hover:bg-sunken',
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">{i.companyName || i.contactName}</span>
                        <span className={clsx('badge shrink-0', INQUIRY_STATUS_TONE[i.status])}>{inquiryStatusLabel(i.status)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{i.message}</span>
                      <span className="mt-1 block text-[11px] text-muted">
                        {inquiryKindLabel(i.kind)} · {fmtRelative(i.createdAt)}
                        {i.assignedStaff && <> · {i.assignedStaff.name}</>}
                        {i.agent && <> · {t('inq.badge.agent', { name: i.agent.name })}</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {pager}
          </div>
          {selectedItem ? (
            <div className="lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col">
              <InquirySplitPanel key={selectedItem.id} i={selectedItem} onClose={() => split.select(null)} />
            </div>
          ) : (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line bg-card p-8 text-center">
              <div>
                <Columns2 className="mx-auto size-8 text-subtle" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-ink">{t('ux.split.empty')}</p>
                <p className="mt-1 text-xs text-muted">{t('ux.split.emptyHint')}</p>
              </div>
            </div>
          )}
        </div>
      ) : tableMode ? (
        <>
          {bulkBar}
          <SettingsTable
            settings={table}
            rows={items}
            rowKey={(i) => i.id}
            caption={t('admin.nav.inquiries')}
            selection={sel.props}
            selectLabel={t('sp.select.row')}
            selectAllLabel={t('sp.select.page')}
            tableClassName="min-w-[1080px]"
            onRowClick={(i) => split.select(i.id)}
            rowClassName={(i) => clsx(i.status === 'NEW' && 'bg-primary/[0.04]', i.id === split.selected && 'shadow-[inset_3px_0_0_var(--color-brand-600)]')}
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
        </>
      ) : (
        <>
          {bulkBar}
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
            {items.map((i) => {
              const expanded = open === i.id;
              return (
                <li key={i.id} data-row-id={i.id} className={clsx(i.status === 'NEW' && 'bg-primary/[0.04]', i.id === split.selected && 'shadow-[inset_3px_0_0_var(--color-brand-600)]')}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : i.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen(expanded ? null : i.id);
                      }
                    }}
                    className="flex cursor-pointer items-start gap-3 px-4 py-3.5 transition hover:bg-sunken sm:px-5"
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
                      className={clsx(
                        'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                        i.kind === 'company' ? 'bg-accent-bg text-accent-fg' : 'bg-primary/10 text-link',
                      )}
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
                      <p className={clsx('mt-0.5 text-xs text-muted', !expanded && 'line-clamp-1')}>{i.message}</p>
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
                      <ChevronDown className={clsx('hidden size-4 text-muted transition-transform sm:block', expanded && 'rotate-180')} aria-hidden />
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {expanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-line bg-surface/50 px-4 py-4 sm:pr-5 sm:pl-16">
                          <InquiryPresence id={i.id} className="mb-3 justify-end" />
                          <InquiryDetailBody i={i} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
          {pager}
        </>
      )}
    </div>
  );
}
