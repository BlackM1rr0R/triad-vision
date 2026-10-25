import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, ChevronDown, Columns2, Flame, Inbox, Search, SlidersHorizontal, User, Users } from 'lucide-react';
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
import { LEAD_LEVELS, useLeadScoring, type LeadLevel, type ScoreReason } from '@/components/marketing/api';
import { LeadScoreBadge } from '@/components/marketing/LeadScore';
import { LeadScoringSettingsDrawer } from '@/components/marketing/LeadScoringSettings';
import { registerCopy } from '@/i18n';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { pagesAdminUx } from '@/i18n/pagesAdminUx';
import { InquiryDetailBody, InquiryPresence, InquirySplitPanel, InquiryStatusCell } from '@/components/admin/split/InquiryDetail'; // inline status, split panel, presence
import { useSplitView } from '@/components/admin/split/useSplitView';
import { useListNav } from '@/components/shortcuts/useListNav';
import { requestInlineEdit } from '@/components/inline/optimistic';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';

registerCopy(pagesMarketing);
registerCopy(pagesAdminUx);

/** Lead scoring fields on every inquiry (server lib/marketing/leadScoring.ts). */
type Scored = Inquiry & { score?: number; scoreLevel?: LeadLevel | null; scoreReasons?: ScoreReason[] | null; source?: string | null };
type SortKey = 'hot' | 'newest' | 'score';
const LEVEL_RANK: Record<LeadLevel, number> = { HOT: 3, WARM: 2, COLD: 1 };
const rank = (i: Scored) => (i.scoreLevel ? LEVEL_RANK[i.scoreLevel] : 0);
const OPEN = new Set(['NEW', 'IN_PROGRESS']);

const KEY = ['admin-inquiries'] as const;

export default function Inquiries() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InquiryStatus | null) ?? null;
  const kind = params.get('kind');
  const level = (params.get('level') as LeadLevel | null) ?? null;
  const sort = (params.get('sort') as SortKey | null) ?? 'hot';
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(() => params.get('open'));
  const [rulesOpen, setRulesOpen] = useState(false);
  const { user } = useAuth();
  const { data: scoring } = useLeadScoring();
  // A HOT-lead notification links here with ?open=<id>: expand that inquiry once.
  useEffect(() => {
    const id = params.get('open');
    if (id) setOpen(id);
  }, [params]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<InquiriesResponse>('/admin/inquiries')).data,
    refetchInterval: 120_000,
  });

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const items = (data?.items ?? []) as Scored[];
  const summary = data?.summary;
  // With a kind filter the chip counts are narrowed locally; otherwise they are the server totals.
  const counts = useMemo(() => {
    if (!kind && summary) return summary.byStatus;
    const out: Partial<Record<InquiryStatus, number>> = {};
    for (const i of items) if (!kind || i.kind === kind) out[i.status] = (out[i.status] ?? 0) + 1;
    return out;
  }, [items, kind, summary]);

  const hotOpen = items.filter((i) => i.scoreLevel === 'HOT' && OPEN.has(i.status)).length;
  const filtered = items.filter((i) => {
    if (status && i.status !== status) return false;
    if (kind && i.kind !== kind) return false;
    if (level && i.scoreLevel !== level) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return [i.contactName, i.companyName, i.email, i.phone, i.message, i.sector].some((f) => f?.toLowerCase().includes(s));
    }
    return true;
  });
  // "Hot first" puts open HOT / WARM leads on top (then by score); closed inquiries keep their date order.
  const sorted = [...filtered].sort((a, b) => {
    const date = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (sort === 'newest') return date;
    if (sort === 'score') return (b.score ?? 0) - (a.score ?? 0) || date;
    const ao = OPEN.has(a.status) ? 1 : 0;
    const bo = OPEN.has(b.status) ? 1 : 0;
    return bo - ao || (bo ? rank(b) - rank(a) || (b.score ?? 0) - (a.score ?? 0) : 0) || date;
  });

  // Split view (list left, inquiry right) and keyboard selection (?selected=<id>): J / K, Enter, E, "/", Esc.
  const split = useSplitView('inquiries');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedItem = sorted.find((i) => i.id === split.selected);
  useListNav({
    ids: sorted.map((i) => i.id),
    selected: split.selected,
    onSelect: split.select,
    onOpen: split.active ? undefined : (id) => setOpen((cur) => (cur === id ? null : id)),
    onEdit: (id) => requestInlineEdit(id),
    onEscape: () => (open && !split.active ? setOpen(null) : split.select(null)),
    searchRef,
    titleKey: 'ux.shortcuts.lists.inquiries',
    extra: split.wide ? [{ id: 'split', keys: ['s'], labelKey: 'ux.shortcuts.keys.split', handler: split.toggle }] : [],
  });

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
            <input ref={searchRef} type="search" className="input pl-9" placeholder={t('admin.inquiries.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
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
          <select aria-label={t('mk.lead.filterLevel')} className="input sm:w-44" value={level ?? ''} onChange={(e) => setParam('level', e.target.value || null)}>
            <option value="">{t('mk.lead.allLevels')}</option>
            {LEAD_LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`mk.lead.levels.${l}`)}
              </option>
            ))}
          </select>
          <select aria-label={t('mk.lead.sort')} className="input sm:w-44" value={sort} onChange={(e) => setParam('sort', e.target.value === 'hot' ? null : e.target.value)}>
            <option value="hot">{t('mk.lead.sortHot')}</option>
            <option value="score">{t('mk.lead.sortScore')}</option>
            <option value="newest">{t('mk.lead.sortNewest')}</option>
          </select>
          <select aria-label={t('admin.inquiries.kindAria')} className="input sm:w-56" value={kind ?? ''} onChange={(e) => setParam('kind', e.target.value || null)}>
            <option value="">{t('admin.inquiries.allKinds')}</option>
            {INQUIRY_KINDS.map((k) => (
              <option key={k} value={k}>
                {inquiryKindLabel(k)}
              </option>
            ))}
          </select>
        </div>
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
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-line bg-card">
          <EmptyState icon={Inbox} title={t('admin.inquiries.notFound')} />
        </div>
      ) : split.active ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] xl:gap-6">
          <ul className="max-h-[calc(100dvh-12rem)] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-card lg:sticky lg:top-20" aria-label={t('admin.nav.inquiries')}>
            {sorted.map((i) => {
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
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
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
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
          {sorted.map((i) => {
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
                    <p className="flex flex-wrap items-center gap-x-2 text-sm">
                      <span className="min-w-0 font-semibold break-words text-ink">{i.companyName || i.contactName}</span>
                      {i.companyName && <span className="text-muted">{i.contactName}</span>}
                      <span className="text-[11px] whitespace-nowrap text-muted">{inquiryKindLabel(i.kind)}</span>
                      <LeadScoreBadge level={i.scoreLevel ?? null} score={i.score ?? 0} reasons={i.scoreReasons ?? null} />
                    </p>
                    <p className={clsx('mt-0.5 text-xs text-muted', !expanded && 'line-clamp-1')}>{i.message}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
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
      )}
    </div>
  );
}
