import { type ReactNode, type RefObject } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarRange, Search, SlidersHorizontal, UserRound, X } from 'lucide-react';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { ALL_STATUSES, fmtDate, fullName, statusLabel } from '@/components/admin/labels';
import { useStaffOptions } from '@/components/inline/CaseInlineCells';
import { PartnerFilterSelect } from '@/components/partners/CasesPartnerTools';
import { usePartnerOptions } from '@/components/partners/api';
import { PROCESSING_STAGES, isProcessingStage, stageLabel } from '@/components/caseProcessing/api';
import { DATE_PRESETS, MORE_FILTER_KEYS, VISA_TYPES, presetRange, type CaseFilterKey } from './api';
import { FilterPopover, PopCheck, PopField, filterSelectClass } from './Popover';

registerCopy(pagesCasesList);

export type SortKey = 'updated' | 'daysInStatus' | 'age';
export const SORT_KEYS: SortKey[] = ['updated', 'daysInStatus', 'age'];

type Patch = Partial<Record<CaseFilterKey | 'sort' | 'sv', string | null>>;

/**
 * Compact filter bar of the cases list: search, status, owner, date and a "more filters" popover, then the
 * applied filters as removable chips. Everything is read from and written to the URL (`update`).
 */
export const CaseFilterBar = ({
  searchInput,
  onSearchInput,
  searchRef,
  update,
  counts,
  total,
  busy,
  actions,
}: {
  searchInput: string;
  onSearchInput: (v: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  update: (patch: Patch) => void;
  counts: Partial<Record<CaseStatus, number>>;
  total: number | null;
  busy: boolean;
  /** Right side (view switch, review mode, columns). */
  actions?: ReactNode;
}) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: staff } = useStaffOptions();
  const { data: partners } = usePartnerOptions();
  const get = (k: string) => params.get(k) ?? '';

  // Status select: one value for "all", the open / closed scope or a single status.
  const status = get('status');
  const scope = get('scope');
  const statusValue = status ? `s:${status}` : scope ? `scope:${scope}` : '';
  const setStatus = (v: string) => {
    if (v.startsWith('s:')) update({ status: v.slice(2), scope: null });
    else if (v.startsWith('scope:')) update({ scope: v.slice(6), status: null });
    else update({ status: null, scope: null });
  };

  // Owner: the legacy ?mine=1 shows as "me".
  const assignee = get('assignee') || (get('mine') === '1' ? 'me' : '');
  const setAssignee = (v: string) => update({ assignee: v || null, mine: null });

  const dateBy = (get('dateBy') || 'created') as 'created' | 'updated' | 'appointment';
  const from = get('from');
  const to = get('to');
  const range = from && to ? (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`) : from ? `${fmtDate(from)} –` : to ? `– ${fmtDate(to)}` : '';
  const moreCount = MORE_FILTER_KEYS.filter((k) => get(k)).length;

  const sort = (SORT_KEYS as string[]).includes(get('sort')) ? get('sort') : 'updated';

  // Applied filters as chips (each removes its own keys).
  const chips: { id: string; label: string; clear: Patch }[] = [];
  if (get('search')) chips.push({ id: 'search', label: `“${get('search')}”`, clear: { search: null } });
  if (status) chips.push({ id: 'status', label: statusLabel(status as CaseStatus), clear: { status: null } });
  if (scope) chips.push({ id: 'scope', label: scope === 'open' ? t('cl.filters.scopeOpen') : t('cl.filters.scopeClosed'), clear: { scope: null } });
  if (assignee) {
    const s = staff?.find((x) => x.id === assignee);
    chips.push({ id: 'assignee', label: `${t('cl.filters.assignee')}: ${assignee === 'me' ? t('cl.filters.me') : assignee === 'none' ? t('cl.filters.none') : s ? fullName(s) : '…'}`, clear: { assignee: null, mine: null } });
  }
  if (range) chips.push({ id: 'date', label: t('cl.filters.dateChip', { by: t(`cl.filters.dateBy.${dateBy}`), range }), clear: { from: null, to: null, dateBy: null } });
  if (get('visaType')) chips.push({ id: 'visaType', label: t(`cl.visaTypes.${get('visaType')}`, { defaultValue: get('visaType') }), clear: { visaType: null } });
  if (get('partner')) {
    const p = partners?.find((x) => x.id === get('partner'));
    chips.push({ id: 'partner', label: `${t('cl.filters.partner')}: ${get('partner') === 'none' ? t('refPartners.filterNone') : (p?.name ?? '…')}`, clear: { partner: null } });
  }
  if (isProcessingStage(get('processing'))) chips.push({ id: 'processing', label: `${t('cl.filters.processing')}: ${stageLabel(get('processing') as never)}`, clear: { processing: null } });
  if (get('processingAssignee')) chips.push({ id: 'processingAssignee', label: t('cl.filters.processingMine'), clear: { processingAssignee: null } });
  if (get('appointment')) chips.push({ id: 'appointment', label: `${t('cl.filters.appointment')}: ${get('appointment') === 'week' ? t('cl.filters.appointmentWeek') : t('cl.filters.appointmentUpcoming')}`, clear: { appointment: null } });
  if (get('recognition')) chips.push({ id: 'recognition', label: `${t('cl.filters.recognition')}: ${get('recognition') === 'overdue' ? t('cl.filters.recognitionOverdue') : t('cl.filters.recognitionOpen')}`, clear: { recognition: null } });
  if (get('overdue')) chips.push({ id: 'overdue', label: t('cl.filters.overdue'), clear: { overdue: null } });
  if (get('pendingDocs')) chips.push({ id: 'pendingDocs', label: t('cl.filters.pendingDocs'), clear: { pendingDocs: null } });

  const resetAll = () => {
    onSearchInput('');
    const keep = params.get('view');
    setParams(keep ? { view: keep } : {}, { replace: true });
  };

  const allCount = ALL_STATUSES.reduce((a, s) => a + (counts[s] ?? 0), 0);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 lg:w-80 xl:w-96">
          <span className="sr-only">{t('admin.common.search')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            className="input min-h-10 pr-9 pl-9 sm:min-h-9"
            placeholder={t('cl.filters.search')}
            value={searchInput}
            onChange={(e) => onSearchInput(e.target.value)}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-muted sm:block" aria-hidden>
            /
          </kbd>
        </label>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <label className="min-w-0">
            <span className="sr-only">{t('cl.filters.status')}</span>
            <select aria-label={t('cl.filters.status')} className={clsx(filterSelectClass(!!statusValue), 'sm:w-48')} value={statusValue} onChange={(e) => setStatus(e.target.value)}>
              <option value="">
                {t('cl.filters.statusAll')} ({allCount})
              </option>
              <option value="scope:open">{t('cl.filters.scopeOpen')}</option>
              <option value="scope:closed">{t('cl.filters.scopeClosed')}</option>
              <optgroup label={t('cl.filters.statuses')}>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={`s:${s}`}>
                    {statusLabel(s)} ({counts[s] ?? 0})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="relative min-w-0">
            <span className="sr-only">{t('cl.filters.assignee')}</span>
            <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <select aria-label={t('cl.filters.assignee')} className={clsx(filterSelectClass(!!assignee), 'pl-9 sm:w-48')} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t('cl.filters.assigneeAll')}</option>
              <option value="me">{t('cl.filters.me')}</option>
              <option value="none">{t('cl.filters.none')}</option>
              {(staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </label>

          <FilterPopover
            label={range || t('cl.filters.date')}
            icon={<CalendarRange className="size-4 shrink-0 text-muted" aria-hidden />}
            active={!!range}
            title={t('cl.filters.date')}
            footer={(close) => (
              <>
                <button type="button" className="text-xs font-semibold text-muted hover:text-ink disabled:opacity-50" disabled={!range} onClick={() => update({ from: null, to: null, dateBy: null })}>
                  {t('cl.filters.clearDate')}
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={close}>
                  {t('cl.filters.done')}
                </button>
              </>
            )}
          >
            <PopField label={t('cl.filters.date')}>
              <select className="input" value={dateBy} onChange={(e) => update({ dateBy: e.target.value === 'created' ? null : e.target.value })}>
                {(['created', 'updated', 'appointment'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`cl.filters.dateBy.${k}`)}
                  </option>
                ))}
              </select>
            </PopField>
            <div className="flex flex-wrap gap-1.5">
              {DATE_PRESETS.map((p) => {
                const r = presetRange(p);
                const on = from === r.from && to === r.to;
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => update({ from: r.from, to: r.to })}
                    className={clsx('min-h-8 rounded-md border px-2.5 text-xs font-medium transition', on ? 'border-line-strong bg-sunken text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink')}
                  >
                    {t(`cl.filters.presets.${p}`)}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <PopField label={t('cl.filters.from')}>
                <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} />
              </PopField>
              <PopField label={t('cl.filters.to')}>
                <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value || null })} />
              </PopField>
            </div>
          </FilterPopover>

          <FilterPopover
            label={t('cl.filters.more')}
            icon={<SlidersHorizontal className="size-4 shrink-0 text-muted" aria-hidden />}
            active={moreCount > 0}
            badge={moreCount}
            title={t('cl.filters.moreTitle')}
            align="end"
            widthClassName="sm:w-[24rem]"
            tour="sp-docflow-filter"
            footer={(close) => (
              <>
                <button
                  type="button"
                  className="text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
                  disabled={!moreCount}
                  onClick={() => update(Object.fromEntries(MORE_FILTER_KEYS.map((k) => [k, null])) as Patch)}
                >
                  {t('cl.filters.reset')}
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={close}>
                  {t('cl.filters.done')}
                </button>
              </>
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              <PopField label={t('cl.filters.visaType')}>
                <select className="input" value={get('visaType')} onChange={(e) => update({ visaType: e.target.value || null })}>
                  <option value="">{t('cl.filters.visaAll')}</option>
                  {VISA_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {t(`cl.visaTypes.${v}`)}
                    </option>
                  ))}
                </select>
              </PopField>
              <PopField label={t('cl.filters.partner')}>
                <PartnerFilterSelect value={get('partner')} onChange={(v) => update({ partner: v })} />
              </PopField>
              <PopField label={t('cl.filters.appointment')}>
                <select className="input" value={get('appointment')} onChange={(e) => update({ appointment: e.target.value || null })}>
                  <option value="">{t('cl.filters.appointmentAny')}</option>
                  <option value="week">{t('cl.filters.appointmentWeek')}</option>
                  <option value="upcoming">{t('cl.filters.appointmentUpcoming')}</option>
                </select>
              </PopField>
              <PopField label={t('cl.filters.recognition')}>
                <select className="input" value={get('recognition')} onChange={(e) => update({ recognition: e.target.value || null })}>
                  <option value="">{t('cl.filters.recognitionAny')}</option>
                  <option value="overdue">{t('cl.filters.recognitionOverdue')}</option>
                  <option value="open">{t('cl.filters.recognitionOpen')}</option>
                </select>
              </PopField>
              <PopField label={t('cl.filters.processing')}>
                <select className="input" value={isProcessingStage(get('processing')) ? get('processing') : ''} onChange={(e) => update({ processing: e.target.value || null })}>
                  <option value="">{t('cl.filters.processingAll')}</option>
                  {PROCESSING_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {stageLabel(s)}
                    </option>
                  ))}
                </select>
              </PopField>
              <PopField label={t('cl.filters.sort')}>
                <select className="input" value={sort} onChange={(e) => update({ sort: e.target.value === 'updated' ? null : e.target.value })}>
                  {SORT_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {t(`admin.cases.sort.${k}`)}
                    </option>
                  ))}
                </select>
              </PopField>
            </div>
            <div className="space-y-0.5 border-t border-line pt-2">
              <PopCheck label={t('cl.filters.overdue')} checked={!!get('overdue')} onChange={(v) => update({ overdue: v ? '1' : null })} />
              <PopCheck label={t('cl.filters.pendingDocs')} checked={!!get('pendingDocs')} onChange={(v) => update({ pendingDocs: v ? '1' : null })} />
              <PopCheck label={t('cl.filters.processingMine')} checked={get('processingAssignee') === 'me'} onChange={(v) => update({ processingAssignee: v ? 'me' : null })} />
            </div>
          </FilterPopover>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{actions}</div>}
      </div>

      {(chips.length > 0 || total !== null) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('cl.filters.activeAria')}>
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                if (c.id === 'search') onSearchInput('');
                update(c.clear);
              }}
              aria-label={t('cl.filters.remove', { label: c.label })}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-line bg-card py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-ink/85 transition hover:border-line-strong sm:min-h-7"
            >
              <span className="truncate">{c.label}</span>
              <X className="size-3.5 shrink-0 text-muted" aria-hidden />
            </button>
          ))}
          {chips.length > 1 && (
            <button type="button" onClick={resetAll} className="min-h-8 rounded-md px-2 text-xs font-semibold text-link hover:bg-primary/[0.06] sm:min-h-7">
              {t('cl.filters.reset')}
            </button>
          )}
          {total !== null && (
            <span className={clsx('ml-auto text-xs text-muted tabular-nums transition-opacity', busy && 'opacity-60')} aria-live="polite">
              {t('cl.subtitle', { count: total })}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
