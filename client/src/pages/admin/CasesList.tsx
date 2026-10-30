import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ClipboardPen, Columns2, FileClock, FolderSearch, Hourglass, KanbanSquare, List, Mail, MessageSquare, Phone, ScanEye, Search, UserCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { ALL_STATUSES, actorSideLabel, eventLabel, fmtDate, fmtDateTime, fmtRelative, fullName, statusLabel } from '@/components/admin/labels';
import type { AdminCaseListItem, AdminCasesResponse } from '@/components/admin/types';
import { Chip, EmptyState, ErrorBlock, PageHead } from '@/components/admin/ui';
import { BulkPartnerBar, CasePartnerCell, PartnerFilterSelect } from '@/components/partners/CasesPartnerTools';
import { NextStepChip } from '@/components/caseNext/NextStepChip';
import { CasesListSkeleton } from '@/components/admin/CasesListSkeleton';
import { morphCaseRow } from '@/components/admin/caseMorph';
import { CaseAssigneeCell, CaseStatusCell } from '@/components/inline/CaseInlineCells'; // inline assignee / quick status
import { requestInlineEdit } from '@/components/inline/optimistic';
import { CaseSplitPanel } from '@/components/admin/split/CaseSplitPanel'; // split view: compact case summary
import { useSplitView } from '@/components/admin/split/useSplitView';
import { useListNav } from '@/components/shortcuts/useListNav'; // J / K / Enter / E / '/' / Esc
import { registerCopy } from '@/i18n';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { PROCESSING_STAGES, isProcessingStage, stageLabel } from '@/components/caseProcessing/api'; // team document workflow
import { StageBadge, StageCell } from '@/components/caseProcessing/parts';
import { ProcessingBoard } from '@/components/caseProcessing/ProcessingBoard';
import { BallChip } from '@/components/clientProcess/Ball'; // "Top kimdÉ™dir?" column
import { pagesStaffPower } from '@/i18n/pagesStaffPower'; // saved views, table settings, bulk actions, fast review
import { SavedViewsMenu } from '@/components/staffPower/SavedViews';
import { ColumnChooser, SettingsTable, useTableSettings, type ColumnDef } from '@/components/staffPower/tableSettings';
import { useRowSelection } from '@/components/staffPower/selection';
import { CasesBulkBar } from '@/components/staffPower/BulkBar';

registerCopy(pagesAdminUx);
registerCopy(pagesStaffPower);

const isStatus = (v: string | null): v is CaseStatus => !!v && (ALL_STATUSES as string[]).includes(v);

type SortKey = 'updated' | 'daysInStatus' | 'age';
const SORT_KEYS: SortKey[] = ['updated', 'daysInStatus', 'age'];
const isSort = (v: string | null): v is SortKey => v === 'updated' || v === 'daysInStatus' || v === 'age';

/** Days in the current status, amber from 3 days and red from 7. */
const DaysInStatus = ({ c, className }: { c: AdminCaseListItem; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums',
        c.daysInStatus >= 7 ? 'bg-danger-bg text-danger-fg' : c.daysInStatus >= 3 ? 'bg-warning-bg text-warning-fg' : 'bg-sunken text-muted',
        className,
      )}
      title={t('admin.cases.sinceTitle', { date: fmtDate(c.statusSince) })}
    >
      <Hourglass className="size-3" aria-hidden /> {t('admin.cases.inStatusDays', { count: c.daysInStatus })}
    </span>
  );
};

const RowMeta = ({ c }: { c: AdminCaseListItem }) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
      {c.pendingDocs > 0 && (
        <span className="inline-flex items-center gap-1 rounded-md bg-warning-bg px-1.5 py-0.5 font-semibold text-warning-fg tabular-nums" title={t('admin.cases.pendingDocsTitle')}>
          <FileClock className="size-3" aria-hidden /> {t('admin.cases.docsCount', { count: c.pendingDocs })}
        </span>
      )}
      <span className="inline-flex items-center gap-1 tabular-nums" title={t('admin.common.messages')}>
        <MessageSquare className="size-3" aria-hidden /> {c.messagesCount}
      </span>
      <span className="tabular-nums" title={t('admin.cases.createdTitle', { date: fmtDate(c.createdAt) })}>
        {t('admin.cases.ageDays', { count: c.ageDays })}
      </span>
    </span>
  );
};

const LastEvent = ({ c }: { c: AdminCaseListItem }) =>
  c.lastEvent ? (
    <span className="block text-xs" title={fmtDateTime(c.lastEvent.createdAt)}>
      <span className="font-medium text-ink/80">{eventLabel(c.lastEvent.type)}</span>
      <span className="block text-[11px] text-muted">
        {actorSideLabel(c.lastEvent.actor?.role)} · {fmtRelative(c.lastEvent.createdAt)}
      </span>
    </span>
  ) : (
    <span className="text-xs text-muted">—</span>
  );

export default function CasesList() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get('status');
  const status = isStatus(statusParam) ? statusParam : null;
  const search = params.get('search') ?? '';
  const mine = params.get('mine') === '1';
  const overdue = params.get('overdue') === '1';
  const sortParam = params.get('sort');
  const sort: SortKey = isSort(sortParam) ? sortParam : 'updated';
  const page = Math.max(1, Number(params.get('page')) || 1);
  // Referral partner filter ('none' = without partner) and the rows picked for a bulk partner change.
  const partner = params.get('partner') ?? '';
  // Team document workflow: stage filter, "sent to me" and the board view (?view=board).
  const processingParam = params.get('processing');
  const processing = isProcessingStage(processingParam) ? processingParam : null;
  const processingAssignee = params.get('processingAssignee') ?? '';
  const board = params.get('view') === 'board';

  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => setSearchInput(search), [search]);

  const update = (patch: Record<string, string | null>) =>
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
    const t = window.setTimeout(() => {
      if (searchInput.trim() !== search) update({ search: searchInput.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-cases', { status, search, mine, page, partner, processing, processingAssignee }],
    queryFn: async () =>
      (
        await api.get<AdminCasesResponse>('/admin/cases', {
          params: {
            status: status ?? undefined,
            search: search || undefined,
            mine: mine ? '1' : undefined,
            page,
            partnerId: partner || undefined,
            processing: processing ?? undefined,
            processingAssignee: processingAssignee || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const counts = data?.counts ?? {};
  const allCount = ALL_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  // Client-side view options on the current page: the overdue chip and the sort order.
  const items = useMemo(() => {
    const list = (data?.items ?? []).filter((c) => !overdue || c.daysInStatus >= 3);
    if (sort === 'daysInStatus') return [...list].sort((a, b) => b.daysInStatus - a.daysInStatus);
    if (sort === 'age') return [...list].sort((a, b) => b.ageDays - a.ageDays);
    return list;
  }, [data, overdue, sort]);
  // Multi-select (checkbox column, Shift + click range, whole page, all matching the filters) for the bulk bars.
  const sel = useRowSelection(
    items.map((c) => c.id),
    JSON.stringify({ status, search, mine, page, partner, processing, processingAssignee, overdue }),
  );
  const picked = sel.picked;
  const bulkFilters = {
    status: status ?? undefined,
    search: search || undefined,
    mine: mine ? '1' : undefined,
    partnerId: partner || undefined,
    processing: processing ?? undefined,
    processingAssignee: processingAssignee || undefined,
  };
  // Column settings of the desktop table (per user: order, visibility, width).
  const columnDefs = useMemo<ColumnDef[]>(
    () => [
      { id: 'number', label: t('admin.cases.th.number'), required: true },
      { id: 'client', label: t('admin.cases.th.client') },
      { id: 'profession', label: t('admin.cases.th.profession') },
      { id: 'status', label: t('admin.cases.th.status') },
      { id: 'processing', label: t('caseProcessing.column') },
      { id: 'nextStep', label: t('caseNext.chip.column'), width: 224 },
      { id: 'ball', label: t('cp.ball.column') },
      { id: 'lastEvent', label: t('admin.cases.th.lastEvent') },
      { id: 'staff', label: t('admin.cases.th.staff'), className: 'whitespace-nowrap text-ink/80' },
      { id: 'partner', label: t('refPartners.field'), className: 'max-w-[10rem]' },
      { id: 'updated', label: t('admin.cases.th.updated'), align: 'right', className: 'text-xs whitespace-nowrap text-muted' },
    ],
    [t],
  );
  const table = useTableSettings('cases', columnDefs);

  // Split view (list left, compact case right; remembered per user) and keyboard selection (?selected=<id>).
  const split = useSplitView('cases');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedRow = items.find((c) => c.id === split.selected);
  useListNav({
    ids: items.map((c) => c.id),
    selected: split.selected,
    onSelect: split.select,
    onOpen: (id) => navigate(`/admin/cases/${id}`),
    onEdit: (id) => requestInlineEdit(id),
    searchRef,
    titleKey: 'ux.shortcuts.lists.cases',
    extra: split.wide ? [{ id: 'split', keys: ['s'], labelKey: 'ux.shortcuts.keys.split', handler: split.toggle }] : [],
  });

  return (
    <div>
      <PageHead
        title={t('admin.nav.cases')}
        subtitle={data ? t('admin.cases.results', { count: data.total }) : undefined}
        actions={isFetching && !isLoading ? <Spinner className="size-4 text-link" /> : undefined}
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <span className="sr-only">{t('admin.common.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              className="input pl-9"
              placeholder={t('admin.cases.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </label>
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => update({ mine: mine ? null : '1' })}
            className={clsx(
              'inline-flex min-h-10 sm:min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition',
              mine ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
            )}
          >
            <UserCheck className="size-4" /> {t('admin.cases.mine')}
          </button>
          <label className="flex min-h-10 sm:min-h-9 shrink-0 items-center gap-2 text-xs text-muted">
            <span className="whitespace-nowrap">{t('admin.cases.sortLabel')}</span>
            <select aria-label={t('admin.cases.sortAria')} className="input min-h-10 sm:min-h-9 w-auto py-2 pr-8 text-sm" value={sort} onChange={(e) => update({ sort: e.target.value === 'updated' ? null : e.target.value })}>
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`admin.cases.sort.${k}`)}
                </option>
              ))}
            </select>
          </label>
          <PartnerFilterSelect value={partner} onChange={(v) => update({ partner: v })} />
          <SavedViewsMenu page="cases" settings={table} />
          {!board && <ColumnChooser settings={table} className="hidden xl:block" />}
          <Link
            to="/admin/review?back=%2Fadmin%2Fcases"
            title={t('sp.review.openHint')}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-card px-3.5 text-sm font-semibold whitespace-nowrap text-ink/80 transition hover:border-line-strong sm:min-h-9"
          >
            <ScanEye className="size-4" aria-hidden /> {t('sp.review.open')}
          </Link>
          <button
            type="button"
            data-tour="sp-docflow-board"
            aria-pressed={board}
            onClick={() => update({ view: board ? null : 'board' })}
            className={clsx(
              'inline-flex min-h-10 sm:min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition',
              board ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
            )}
          >
            {board ? <List className="size-4" aria-hidden /> : <KanbanSquare className="size-4" aria-hidden />} {board ? t('caseProcessing.board.list') : t('caseProcessing.board.toggle')}
          </button>
          <button
            type="button"
            aria-pressed={split.enabled}
            onClick={split.toggle}
            title={t('ux.split.toggleHint')}
            className={clsx(
              'hidden min-h-10 sm:min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition lg:inline-flex',
              split.enabled ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card text-ink/80 hover:border-line-strong',
            )}
          >
            <Columns2 className="size-4" aria-hidden /> {t('ux.split.toggle')}
          </button>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0">
          <Chip active={overdue} onClick={() => update({ overdue: overdue ? null : '1' })}>
            <Hourglass className="size-3" aria-hidden /> {t('admin.cases.overdueChip')}
          </Chip>
          <Chip active={!status} onClick={() => update({ status: null })} count={allCount}>
            {t('admin.common.all')}
          </Chip>
          {ALL_STATUSES.map((s) => (
            <Chip key={s} active={status === s} onClick={() => update({ status: status === s ? null : s })} count={counts[s] ?? 0}>
              {statusLabel(s)}
            </Chip>
          ))}
        </div>
        {!board && (
          <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0" role="group" aria-label={t('caseProcessing.filterLabel')} data-tour="sp-docflow-filter">
            <span className="inline-flex shrink-0 items-center gap-1 pr-1 text-xs font-semibold text-muted">
              <ClipboardPen className="size-3.5" aria-hidden /> {t('caseProcessing.filterLabel')}
            </span>
            {PROCESSING_STAGES.map((s) => (
              <Chip key={s} active={processing === s} onClick={() => update({ processing: processing === s ? null : s })} count={data?.processingCounts?.[s] ?? 0}>
                <span title={t(`caseProcessing.hints.${s}`)}>{stageLabel(s)}</span>
              </Chip>
            ))}
            <Chip active={processingAssignee === 'me'} onClick={() => update({ processingAssignee: processingAssignee === 'me' ? null : 'me' })}>
              <UserCheck className="size-3" aria-hidden /> {t('caseProcessing.board.mine')}
            </Chip>
          </div>
        )}
      </div>

      {board ? (
        <ProcessingBoard partnerId={partner || undefined} search={search || undefined} onShowStage={(s) => update({ view: null, processing: s })} />
      ) : (
      <>

      {isLoading ? (
        <CasesListSkeleton />
      ) : error || !data ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={FolderSearch} title={t('admin.cases.notFound')}>
            {t('admin.cases.notFoundText')}
            {(status || search || mine || overdue || partner || processing || processingAssignee) && (
              <div className="mt-3">
                <button type="button" className="btn-secondary btn-sm" onClick={() => setParams({}, { replace: true })}>
                  <X className="size-3.5" /> {t('admin.cases.resetFilters')}
                </button>
              </div>
            )}
          </EmptyState>
        </div>
      ) : (
        <>
          <CasesBulkBar
            sel={sel}
            filters={bulkFilters}
            total={data.total}
            pageCount={items.length}
            labelOf={(id) => items.find((c) => c.id === id)?.number ?? id}
            invalidate={[['admin-cases'], ['admin-dashboard']]}
          />
          {!sel.allMatching && <BulkPartnerBar ids={picked} onDone={sel.clear} />}
          {split.active ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] xl:gap-6">
              <ul className={clsx('max-h-[calc(100dvh-12rem)] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-card lg:sticky lg:top-20', isFetching && 'opacity-60')} aria-label={t('admin.nav.cases')}>
                {items.map((c) => {
                  const on = c.id === split.selected;
                  return (
                    <li key={c.id} data-row-id={c.id}>
                      <button
                        type="button"
                        aria-current={on || undefined}
                        onClick={() => split.select(c.id)}
                        onDoubleClick={() => navigate(`/admin/cases/${c.id}`)}
                        className={clsx(
                          'block w-full px-4 py-3 text-left transition outline-none focus-visible:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:ring-inset',
                          on ? 'bg-primary/[0.06] shadow-[inset_3px_0_0_var(--color-brand-600)]' : 'hover:bg-sunken',
                        )}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block code-id text-xs font-medium text-link whitespace-nowrap">{c.number}</span>
                            <span className="block truncate text-sm font-semibold text-ink">{fullName(c.client)}</span>
                            <span className="block truncate text-xs text-muted">{c.profession}</span>
                          </span>
                          <StatusBadge status={c.status} />
                        </span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <DaysInStatus c={c} />
                          <span className="truncate text-[11px] text-muted">{c.assignedStaff ? fullName(c.assignedStaff) : t('admin.cases.unassigned')}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {split.selected ? (
                <div className="lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100dvh-6rem)] lg:flex-col">
                  <CaseSplitPanel key={split.selected} id={split.selected} row={selectedRow} onClose={() => split.select(null)} />
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
          ) : (
          <>
          {/* Desktop table (columns follow the user's table settings: order, visibility, width) */}
          <SettingsTable
            settings={table}
            rows={items}
            rowKey={(c) => c.id}
            className="hidden xl:block"
            tableClassName="min-w-[1460px]"
            bodyClassName={clsx('transition-opacity', isFetching && 'opacity-60')}
            caption={t('admin.nav.cases')}
            selection={sel.props}
            selectLabel={t('refPartners.selectRow')}
            selectAllLabel={t('refPartners.selectAll')}
            onRowClick={(c, e) => {
              morphCaseRow(e, c.id);
              navigate(`/admin/cases/${c.id}`);
            }}
            rowProps={(c) => ({ 'aria-current': c.id === split.selected || undefined })}
            rowClassName={(c) => (c.id === split.selected ? 'bg-primary/[0.04] shadow-[inset_3px_0_0_var(--color-brand-600)]' : undefined)}
            cells={{
              number: (c) => (
                <>
                  <Link
                    to={`/admin/cases/${c.id}`}
                    className="code-id text-xs font-medium text-link hover:underline whitespace-nowrap"
                    data-vt-part="title"
                    onClick={(e) => {
                      e.stopPropagation();
                      morphCaseRow(e, c.id);
                    }}
                  >
                    {c.number}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-muted">{fmtDate(c.createdAt)}</p>
                </>
              ),
              client: (c) => (
                <>
                  <p className="font-semibold whitespace-nowrap text-ink">{fullName(c.client)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" aria-hidden />
                      {c.client.email}
                    </span>
                    {c.client.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" aria-hidden />
                        {c.client.phone}
                      </span>
                    )}
                  </p>
                </>
              ),
              profession: (c) => (
                <>
                  <p className="text-ink">{c.profession}</p>
                  <p className="mt-0.5 text-xs text-muted">{c.visaCategory ? `${tr(c.visaCategory.title)} · ${c.visaCategory.visaLabel}` : '—'}</p>
                </>
              ),
              status: (c) => (
                <>
                  <CaseStatusCell c={c} />
                  <div className="mt-1.5 flex flex-col items-start gap-1">
                    <DaysInStatus c={c} />
                    <RowMeta c={c} />
                  </div>
                </>
              ),
              processing: (c) => <StageCell p={c.processing} />,
              nextStep: (c) => <NextStepChip step={c.nextStep} />,
              ball: (c) => <BallChip ball={c.ballInCourt} />,
              lastEvent: (c) => <LastEvent c={c} />,
              staff: (c) => <CaseAssigneeCell c={c} />,
              partner: (c) => <CasePartnerCell c={c} />,
              updated: (c) => <span title={fmtDate(c.updatedAt)}>{fmtRelative(c.updatedAt)}</span>,
            }}
          />

          {/* Cards below xl (table needs ~1080px next to the sidebar) */}
          <ul className={clsx('grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden', isFetching && 'opacity-60')}>
            {items.map((c) => (
              <li key={c.id} data-row-id={c.id} className={clsx(c.id === split.selected && 'rounded-xl ring-2 ring-focus/50')}>
                <Link to={`/admin/cases/${c.id}`} onClick={(e) => morphCaseRow(e, c.id)} className="block h-full rounded-xl border border-line bg-card p-4 transition hover:border-line-strong active:bg-sunken">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="code-id text-xs font-medium text-link whitespace-nowrap" data-vt-part="title">{c.number}</p>
                      <p className="mt-0.5 truncate font-semibold text-ink">{fullName(c.client)}</p>
                      <p className="truncate text-xs text-muted">{c.profession}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <DaysInStatus c={c} />
                    {c.processing?.stage && <StageBadge stage={c.processing.stage} />}
                    <RowMeta c={c} />
                  </div>
                  {c.nextStep && <NextStepChip step={c.nextStep} className="mt-2.5" />}
                  {c.ballInCourt && (
                    <div className="mt-2.5">
                      <BallChip ball={c.ballInCourt} />
                    </div>
                  )}
                  <div className="mt-2.5 border-t border-line pt-2.5">
                    <LastEvent c={c} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="truncate">{c.assignedStaff ? fullName(c.assignedStaff) : t('admin.cases.unassigned')}</span>
                    <CasePartnerCell c={c} empty="" />
                    <span className="shrink-0">{fmtRelative(c.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          </>
          )}

          {pages > 1 && (
            <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label={t('admin.common.pagination')}>
              <p className="text-xs text-muted">{t('admin.common.pageOf', { page, pages })}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}
                >
                  <ChevronLeft className="size-3.5" /> {t('admin.common.prev')}
                </button>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={page >= pages}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  {t('admin.common.next')} <ChevronRight className="size-3.5" />
                </button>
              </div>
            </nav>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
