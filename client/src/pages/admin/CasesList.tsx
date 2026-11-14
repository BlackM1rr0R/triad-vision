import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock, FolderOpen, FolderSearch, GraduationCap, Hourglass, KanbanSquare, List, Mail, Phone, ScanEye, UserCheck, UserX, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { Pagination } from '@/components/ui/Pagination';
import { fmtDate, fmtRelative, fullName, actorSideLabel, eventLabel, fmtDateTime } from '@/components/admin/labels';
import type { AdminCasesResponse } from '@/components/admin/types';
import { EmptyState, ErrorBlock, KpiCell, KpiStrip, PageHead } from '@/components/admin/ui';
import { CasePartnerCell } from '@/components/partners/CasesPartnerTools';
import { NextStepChip } from '@/components/caseNext/NextStepChip';
import { CasesListSkeleton } from '@/components/admin/CasesListSkeleton';
import { CASES_LIST_QS_KEY, morphCaseRow } from '@/components/admin/caseMorph';
import { CaseAssigneeCell, CaseStatusCell } from '@/components/inline/CaseInlineCells'; // inline assignee / quick status
import { requestInlineEdit } from '@/components/inline/optimistic';
import { useListNav } from '@/components/shortcuts/useListNav'; // J / K / Enter / E / '/' / Esc
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { StageCell } from '@/components/caseProcessing/parts';
import { ProcessingBoard } from '@/components/caseProcessing/ProcessingBoard';
import { BallChip } from '@/components/clientProcess/Ball';
import { ColumnChooser, SettingsTable, useTableSettings, type ColumnDef } from '@/components/staffPower/tableSettings';
import { useRowSelection } from '@/components/staffPower/selection';
import { CasesBulkBar } from '@/components/staffPower/BulkBar';
import { SUMMARY_TILES, hasAnyFilter, serverParams, useCasesSummary, useDrawerParam, type SummaryTile } from '@/components/casesList/api';
import { CaseFilterBar, SORT_KEYS, type SortKey } from '@/components/casesList/CaseFilterBar';
import { SavedFilterTabs } from '@/components/casesList/SavedFilterTabs';
import { CaseQuickDrawer } from '@/components/casesList/CaseQuickDrawer';
import { ActivityCell, AppointmentCell, CaseCard, DaysInStatus, PartnerBulkControl, RowActions, type CaseRow } from '@/components/casesList/parts';
import { MobileCaseSwipe } from '@/components/staffMobile/MobileCaseSwipe';

registerCopy(pagesAdminUx);
registerCopy(pagesStaffPower);
registerCopy(pagesCasesList);

const isSort = (v: string | null): v is SortKey => !!v && (SORT_KEYS as string[]).includes(v);

const TILE_ICON: Record<SummaryTile, typeof FolderOpen> = {
  open: FolderOpen,
  mine: UserCheck,
  unassigned: UserX,
  stuck: Hourglass,
  embassyWeek: CalendarClock,
  recognitionOverdue: GraduationCap,
};

/**
 * Admin → Müraciətlər. Header with the key counts (each a filter link), saved-filter tabs, a compact filter bar
 * (search, status, owner, date, more filters in a popover), then a fixed-width table from xl and cards below.
 * A row opens the quick-view drawer (?open=<id>, browser back closes it); the full case page stays one click
 * away. Selecting rows shows the bulk bar at the bottom of the screen.
 */
export default function CasesList() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // The case page's back arrow returns to this list with its filters and page (CASES_LIST_QS_KEY), drawer closed.
  const qsNow = useMemo(() => {
    const p = new URLSearchParams(params);
    p.delete('open');
    return p.toString();
  }, [params]);
  useEffect(() => {
    try {
      sessionStorage.setItem(CASES_LIST_QS_KEY, qsNow);
    } catch {
      /* private mode */
    }
  }, [qsNow]);

  const search = params.get('search') ?? '';
  const sortParam = params.get('sort');
  const sort: SortKey = isSort(sortParam) ? sortParam : 'updated';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const board = params.get('view') === 'board';
  const filters = useMemo(() => serverParams(params), [params]);
  const filterKey = JSON.stringify(filters);

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const update = (patch: Record<string, string | null | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        if (!('page' in patch)) next.delete('page');
        return next;
      },
      { replace: true },
    );

  // Debounce search box → URL
  useEffect(() => {
    const h = window.setTimeout(() => {
      if (searchInput.trim() !== search) update({ search: searchInput.trim() || null });
    }, 350);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-cases', { ...filters, page }],
    queryFn: async () => (await api.get<AdminCasesResponse>('/admin/cases', { params: { ...filters, page } })).data,
    placeholderData: keepPreviousData,
  });
  const summary = useCasesSummary();

  const counts = data?.counts ?? {};
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Sort order of the current page (a view option; the server pages by the last change).
  const items = useMemo(() => {
    const list = (data?.items ?? []) as CaseRow[];
    if (sort === 'daysInStatus') return [...list].sort((a, b) => b.daysInStatus - a.daysInStatus);
    if (sort === 'age') return [...list].sort((a, b) => b.ageDays - a.ageDays);
    return list;
  }, [data, sort]);
  const ids = useMemo(() => items.map((c) => c.id), [items]);

  // Multi-select (checkbox column, Shift + click range, whole page, all matching the filters) for the bulk bar.
  const sel = useRowSelection(ids, `${filterKey}|${page}`);

  // Quick-view drawer (?open=<id>) and the keyboard cursor (?selected=<id>).
  const drawer = useDrawerParam('open');
  const [focusReply, setFocusReply] = useState(false);
  const openDrawer = (id: string, reply = false) => {
    setFocusReply(reply);
    drawer.open(id);
  };
  const selected = params.get('selected');
  const setSelected = (id: string | null) => update({ selected: id, page: params.get('page') });
  const drawerIndex = drawer.id ? ids.indexOf(drawer.id) : -1;
  const drawerRow = drawerIndex >= 0 ? items[drawerIndex] : undefined;

  const searchRef = useRef<HTMLInputElement>(null);
  useListNav({
    ids,
    selected,
    onSelect: setSelected,
    onOpen: (id) => openDrawer(id),
    onEdit: (id) => requestInlineEdit(id),
    searchRef,
    titleKey: 'ux.shortcuts.lists.cases',
    extra: [{ id: 'full', keys: ['o'], labelKey: 'cl.row.openFull', handler: () => selected && navigate(`/admin/cases/${selected}`) }],
    enabled: !drawer.id,
  });

  // Desktop table columns (per-user order / visibility / width; "cases.v2" = the tidy default set).
  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { id: 'case', label: t('cl.col.case'), required: true, width: 264 },
      { id: 'status', label: t('cl.col.status'), width: 184 },
      { id: 'nextStep', label: t('caseNext.chip.column'), width: 216 },
      { id: 'staff', label: t('cl.col.staff'), width: 156 },
      { id: 'activity', label: t('cl.col.activity'), width: 112 },
      { id: 'appointment', label: t('cl.col.appointment'), width: 124 },
      { id: 'updated', label: t('cl.col.updated'), width: 104, align: 'right', className: 'text-xs whitespace-nowrap text-muted' },
      { id: 'visa', label: t('cl.col.visa'), width: 180, defaultHidden: true },
      { id: 'contact', label: t('cl.col.contact'), width: 220, defaultHidden: true },
      { id: 'processing', label: t('caseProcessing.column'), width: 160, defaultHidden: true },
      { id: 'ball', label: t('cp.ball.column'), width: 160, defaultHidden: true },
      { id: 'lastEvent', label: t('admin.cases.th.lastEvent'), width: 200, defaultHidden: true },
      { id: 'partner', label: t('refPartners.field'), width: 150, defaultHidden: true },
      { id: 'created', label: t('cl.col.created'), width: 112, defaultHidden: true, className: 'text-xs whitespace-nowrap text-muted' },
      { id: 'actions', label: t('cl.col.actions'), header: <span className="sr-only">{t('cl.col.actions')}</span>, required: true, width: 112, align: 'right' },
    ],
    [t],
  );
  const table = useTableSettings('cases.v2', columnDefs);
  const tableWidth = table.columns.reduce((a, c) => a + (table.widthOf(c.id) ?? 140), 40);

  const tiles = summary.data?.tiles;
  const tileHref = (p: Record<string, string>) => `/admin/cases?${new URLSearchParams(p).toString()}`;
  const tileTone = (k: SummaryTile, n: number) => (n === 0 ? undefined : k === 'recognitionOverdue' || k === 'stuck' ? ('danger' as const) : k === 'unassigned' ? ('warning' as const) : undefined);

  const viewSwitch = (
    <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label={t('caseProcessing.board.toggle')} data-tour="sp-docflow-board">
      {[
        { on: !board, icon: List, label: t('caseProcessing.board.list'), view: null },
        { on: board, icon: KanbanSquare, label: t('caseProcessing.board.toggle'), view: 'board' },
      ].map((b) => (
        <button
          key={b.label}
          type="button"
          aria-pressed={b.on}
          onClick={() => update({ view: b.view, open: null })}
          className={clsx('inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition sm:min-h-8', b.on ? 'bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-ink')}
        >
          <b.icon className="size-3.5" aria-hidden /> {b.label}
        </button>
      ))}
    </div>
  );

  const anyFilter = hasAnyFilter(params);

  return (
    <div>
      <PageHead
        title={t('admin.nav.cases')}
        subtitle={t('cl.headSubtitle')}
        actions={isFetching && !isLoading ? <Spinner className="size-4 text-link" /> : undefined}
      />

      {/* Key counts: each tile is the list filtered exactly as counted */}
      <section aria-label={t('cl.tiles.aria')} className="mb-5">
        <KpiStrip cols={6}>
          {SUMMARY_TILES.map((k) => {
            const tile = tiles?.[k];
            return (
              <KpiCell
                key={k}
                label={t(`cl.tiles.${k}`)}
                icon={TILE_ICON[k]}
                value={tile ? tile.count : <span className="inline-block h-7 w-10 animate-pulse rounded bg-sunken align-middle" aria-hidden />}
                hint={t(`cl.tiles.${k}Hint`)}
                tone={tile ? tileTone(k, tile.count) : undefined}
                to={tile ? tileHref(tile.params) : undefined}
              />
            );
          })}
        </KpiStrip>
      </section>

      <SavedFilterTabs page="cases" settings={table} className="mb-3" />

      <div className="mb-4">
        <CaseFilterBar
          searchInput={searchInput}
          onSearchInput={setSearchInput}
          searchRef={searchRef}
          update={update}
          counts={counts}
          total={board ? null : (data?.total ?? null)}
          busy={isFetching}
          actions={
            <>
              {viewSwitch}
              <Link
                to="/admin/review?back=%2Fadmin%2Fcases"
                title={t('sp.review.openHint')}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold whitespace-nowrap text-ink/80 transition hover:border-line-strong sm:min-h-9"
              >
                <ScanEye className="size-3.5" aria-hidden /> {t('sp.review.open')}
              </Link>
              {!board && <ColumnChooser settings={table} className="hidden xl:block" />}
            </>
          }
        />
      </div>

      {board ? (
        <ProcessingBoard partnerId={params.get('partner') || undefined} search={search || undefined} onShowStage={(s) => update({ view: null, processing: s })} />
      ) : isLoading ? (
        <CasesListSkeleton />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FolderSearch} title={t('admin.cases.notFound')}>
            {t('admin.cases.notFoundText')}
            {anyFilter && (
              <div className="mt-3">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setSearchInput('');
                    setParams({}, { replace: true });
                  }}
                >
                  <X className="size-3.5" /> {t('admin.cases.resetFilters')}
                </button>
              </div>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Desktop table: fixed column widths (resizable / reorderable per user), hover actions on the right */}
          <SettingsTable
            settings={table}
            rows={items}
            rowKey={(c) => c.id}
            className="hidden xl:block"
            tableClassName="table-fixed"
            bodyClassName={clsx('transition-opacity', isFetching && 'opacity-60')}
            caption={t('admin.nav.cases')}
            selection={sel.props}
            selectLabel={t('refPartners.selectRow')}
            selectAllLabel={t('cl.row.selectAll')}
            onRowClick={(c) => openDrawer(c.id)}
            tableStyle={{ minWidth: tableWidth }}
            rowProps={(c) => ({ 'aria-current': c.id === drawer.id || undefined })}
            rowClassName={(c) =>
              clsx(
                'group',
                c.id === drawer.id ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_var(--color-brand-600)]' : c.id === selected && 'bg-primary/[0.03] shadow-[inset_3px_0_0_var(--color-line-strong)]',
              )
            }
            cells={{
              case: (c) => (
                <div className="min-w-0">
                  <p className="flex items-baseline gap-2">
                    <Link
                      to={`/admin/cases/${c.id}`}
                      className="code-id text-xs font-medium whitespace-nowrap text-link hover:underline"
                      data-vt-part="title"
                      onClick={(e) => {
                        e.stopPropagation();
                        morphCaseRow(e, c.id);
                      }}
                    >
                      {c.number}
                    </Link>
                    <span className="truncate text-[11px] text-subtle" title={fmtDate(c.createdAt)}>
                      {fmtDate(c.createdAt)}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate font-semibold text-ink" title={fullName(c.client)}>
                    {fullName(c.client)}
                  </p>
                  <p className="truncate text-xs text-muted" title={c.profession}>
                    {c.profession}
                  </p>
                </div>
              ),
              status: (c) => (
                <div className="flex flex-col items-start gap-1.5">
                  <CaseStatusCell c={c} />
                  <DaysInStatus c={c} />
                </div>
              ),
              nextStep: (c) => <NextStepChip step={c.nextStep} />,
              staff: (c) => <CaseAssigneeCell c={c} />,
              activity: (c) => <ActivityCell c={c} />,
              appointment: (c) => <AppointmentCell at={c.appointmentAt} />,
              updated: (c) => <span title={fmtDateTime(c.updatedAt)}>{fmtRelative(c.updatedAt)}</span>,
              visa: (c) => <span className="line-clamp-2 text-xs text-ink/80">{c.visaCategory ? `${c.visaCategory.visaLabel} · ${tr(c.visaCategory.title)}` : '—'}</span>,
              contact: (c) => (
                <span className="flex min-w-0 flex-col gap-0.5 text-xs text-muted">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <Mail className="size-3 shrink-0" aria-hidden /> <span className="truncate">{c.client.email}</span>
                  </span>
                  {c.client.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3 shrink-0" aria-hidden /> {c.client.phone}
                    </span>
                  )}
                </span>
              ),
              processing: (c) => <StageCell p={c.processing} />,
              ball: (c) => <BallChip ball={c.ballInCourt} />,
              lastEvent: (c) =>
                c.lastEvent ? (
                  <span className="block text-xs" title={fmtDateTime(c.lastEvent.createdAt)}>
                    <span className="font-medium text-ink/80">{eventLabel(c.lastEvent.type)}</span>
                    <span className="block text-[11px] text-muted">
                      {actorSideLabel(c.lastEvent.actor?.role)} · {fmtRelative(c.lastEvent.createdAt)}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted">—</span>
                ),
              partner: (c) => <CasePartnerCell c={c} />,
              created: (c) => <span title={fmtDateTime(c.createdAt)}>{fmtDate(c.createdAt)}</span>,
              actions: (c) => <RowActions c={c} onPreview={() => openDrawer(c.id)} onMessage={() => openDrawer(c.id, true)} />,
            }}
          />

          {/* Cards below xl: one column on phones, two from md */}
          <div className="xl:hidden">
            {items.length > 1 && (
              <label className="mb-2 inline-flex min-h-9 items-center gap-2 px-1 text-xs text-muted">
                <input type="checkbox" className="size-4 accent-primary" checked={sel.allOnPage} onChange={(e) => sel.props.togglePage(e.target.checked)} />
                {t('cl.row.selectAll')}
              </label>
            )}
            <ul className={clsx('grid grid-cols-1 gap-3 md:grid-cols-2', isFetching && 'opacity-60')} aria-label={t('admin.nav.cases')}>
              {items.map((c) => (
                <li key={c.id} data-row-id={c.id}>
                  {/* phones: swipe right = reply (drawer composer), left = status sheet */}
                  <MobileCaseSwipe c={c} onReply={() => openDrawer(c.id, true)}>
                    <CaseCard
                      c={c}
                      selected={sel.props.isSelected(c.id)}
                      current={c.id === selected || c.id === drawer.id}
                      onToggle={(on, shift) => sel.props.toggle(c.id, on, shift)}
                      onOpen={() => openDrawer(c.id)}
                    />
                  </MobileCaseSwipe>
                </li>
              ))}
            </ul>
          </div>

          {pages > 1 && <Pagination className="mt-5" page={page} pages={pages} total={data.total} pageSize={data.pageSize} onChange={(p) => update({ page: p > 1 ? String(p) : null })} />}

          <CasesBulkBar
            sel={sel}
            filters={filters}
            total={data.total}
            pageCount={items.length}
            labelOf={(id) => items.find((c) => c.id === id)?.number ?? id}
            invalidate={[['admin-cases'], ['admin-dashboard']]}
            placement="bottom"
            extraActions={!sel.allMatching ? <PartnerBulkControl ids={sel.picked} onDone={sel.clear} /> : undefined}
          />
        </>
      )}

      <CaseQuickDrawer
        id={drawer.id}
        row={drawerRow}
        onClose={drawer.close}
        autoFocusReply={focusReply}
        onPrev={drawerIndex > 0 ? () => openDrawer(ids[drawerIndex - 1]) : undefined}
        onNext={drawerIndex >= 0 && drawerIndex < ids.length - 1 ? () => openDrawer(ids[drawerIndex + 1]) : undefined}
      />
    </div>
  );
}
