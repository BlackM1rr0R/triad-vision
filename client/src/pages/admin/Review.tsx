import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, CircleDashed, ExternalLink, Keyboard, PartyPopper, SkipForward, Undo2, UserX, X, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesStaffPower } from '@/i18n/pagesStaffPower';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate, fmtRelative, fullName } from '@/components/admin/labels';
import { useShortcuts } from '@/components/shortcuts/registry';
import { openShortcutSheet } from '@/components/shortcuts/ShortcutLayer';
import { hasOpenOverlay } from '@/components/ui/overlay';
import { delayedCommit, UNDO_MS } from '@/lib/undo';
import type { ReviewMark } from '@/components/review/marks';
import { useReviewQueue, type ChecklistState, type ReviewFilters, type ReviewItem } from '@/components/staffPower/api';
import { decide, initialQueue, remaining, sessionCounts, skip, step, syncQueue, undoDecision, type Decision, type QueueState } from '@/components/staffPower/pure';
import { DocViewer, clampZoom, type ViewState } from '@/components/staffPower/review/DocViewer';
import { RejectDialog, suggestedReasons } from '@/components/staffPower/review/RejectDialog';

registerCopy(pagesStaffPower);
registerCopy(pagesUploadAi);

type Pending = { id: string; caseId: string; decision: Decision; at: number; handle: { undo: () => boolean; flush: () => void } };

const CHECK_ICON: Record<ChecklistState, { icon: typeof Check; cls: string }> = {
  ACCEPTED: { icon: CheckCircle2, cls: 'text-success-fg' },
  PENDING: { icon: CircleDashed, cls: 'text-warning-fg' },
  REJECTED: { icon: XCircle, cls: 'text-danger-fg' },
  MISSING: { icon: Circle, cls: 'text-subtle' },
};

/** Upload AI findings of the current document: name mismatch, quality, expiry, recognised type. */
const Findings = ({ item }: { item: ReviewItem }) => {
  const { t, i18n } = useTranslation();
  const ins = item.insight;
  const flags = ins?.flags ?? [];
  const expiry = ins?.expiryDate ?? item.expiresAt;
  const expired = flags.includes('EXPIRED') || (!!expiry && new Date(expiry).getTime() < Date.now());
  const soon = !expired && (flags.includes('EXPIRES_SOON') || (!!expiry && new Date(expiry).getTime() < Date.now() + 180 * 86_400_000));
  const rows: { tone: 'danger' | 'warning' | 'ok' | 'muted'; icon: typeof Check; text: string }[] = [];
  if (!ins) rows.push({ tone: 'muted', icon: CircleDashed, text: t('sp.review.noAi') });
  else if (ins.status === 'PENDING') rows.push({ tone: 'muted', icon: CircleDashed, text: t('sp.review.aiPending') });
  if (flags.includes('NAME_MISMATCH'))
    rows.push({ tone: 'danger', icon: UserX, text: ins?.proposals.holder ? t('sp.review.nameMismatchFor', ins.proposals.holder) : t('sp.review.nameMismatch') });
  if (flags.includes('WRONG_REQUIREMENT')) rows.push({ tone: 'warning', icon: AlertTriangle, text: t('sp.review.wrongRequirement') });
  if (ins?.qualityLevel === 'BAD' || ins?.qualityLevel === 'WARN') {
    const reasons = (ins.quality?.reasons ?? []).map((r) => (i18n.exists(`uploadAi.quality.reasons.${r.code}`) ? t(`uploadAi.quality.reasons.${r.code}`, r.params ?? {}) : r.code));
    rows.push({ tone: ins.qualityLevel === 'BAD' ? 'danger' : 'warning', icon: AlertTriangle, text: `${t(ins.qualityLevel === 'BAD' ? 'sp.review.qualityBad' : 'sp.review.qualityWarn')}${reasons.length ? `: ${reasons.join(', ')}` : ''}` });
  } else if (ins?.qualityLevel === 'OK') rows.push({ tone: 'ok', icon: Check, text: t('sp.review.qualityOk') });
  if (expiry) rows.push({ tone: expired ? 'danger' : soon ? 'warning' : 'ok', icon: CalendarClock, text: t(expired ? 'sp.review.expired' : soon ? 'sp.review.expiresSoon' : 'sp.review.validUntil', { date: fmtDate(expiry) }) });
  if (ins && ins.status !== 'PENDING' && ins.docType)
    rows.push({ tone: 'muted', icon: Check, text: t('sp.review.recognised', { type: i18n.exists(`uploadAi.types.${ins.docType}`) ? t(`uploadAi.types.${ins.docType}`) : ins.docType, pct: Math.round((ins.confidence ?? 0) * 100) }) });
  const TONE = { danger: 'bg-danger-bg text-danger-fg', warning: 'bg-warning-bg text-warning-fg', ok: 'bg-success-bg text-success-fg', muted: 'bg-sunken text-muted' } as const;
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={i} className={clsx('flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs', TONE[r.tone])}>
          <r.icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{r.text}</span>
        </li>
      ))}
    </ul>
  );
};

const HelpOverlay = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const keys: [string, string][] = [
    ['J', t('sp.review.keys.next')],
    ['K', t('sp.review.keys.prev')],
    ['A', t('sp.review.keys.approve')],
    ['R', t('sp.review.keys.reject')],
    ['S', t('sp.review.keys.skip')],
    ['Z', t('sp.review.keys.undo')],
    ['+ / − / 0', t('sp.review.keys.zoom')],
    ['[ / ]', t('sp.review.keys.rotate')],
    ['?', t('sp.review.keys.help')],
    ['Esc', t('sp.review.keys.close')],
  ];
  return (
    <div className="absolute inset-x-3 top-14 z-10 ml-auto max-w-sm rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-overlay)]" role="dialog" aria-label={t('sp.review.help')}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{t('sp.review.help')}</p>
        <button type="button" className="grid size-7 place-items-center rounded text-muted hover:bg-sunken" onClick={onClose} aria-label={t('admin.common.close')}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {keys.map(([k, label]) => (
          <li key={k} className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-ink/90">{label}</span>
            <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-ink">{k}</kbd>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{t('sp.review.undoWindow', { s: UNDO_MS / 1000 })}</p>
    </div>
  );
};

/**
 * Fast document review (/admin/review): a full-screen queue of client uploads waiting for a decision. Left the
 * scan, right the requirement, client / case, upload AI findings, the case checklist and the actions.
 * J / K move, A approves, R rejects (reason picker + marks), S skips, Z takes the last decision back (10 s),
 * ? shows the keys. Decisions are optimistic: the document leaves the queue at once, the request is sent when its
 * undo window ends (or when the page is left) and a failed request puts the document back.
 */
export default function Review() {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters: ReviewFilters = {
    scope: params.get('scope') === 'mine' ? 'mine' : 'all',
    visaType: params.get('visaType') ?? undefined,
    partnerId: params.get('partnerId') ?? undefined,
    caseId: params.get('caseId') ?? undefined,
  };
  const back = params.get('back') ?? (filters.caseId ? `/admin/cases/${filters.caseId}` : '/admin/cases');
  const { data, isLoading, error, refetch, isFetching } = useReviewQueue(filters);
  const [queue, setQueue] = useState<QueueState>(() => initialQueue([]));
  const pendingRef = useRef<Pending[]>([]);
  const [, force] = useState(0);
  const [view, setView] = useState<ViewState>({ zoom: 1, rotation: 0 });
  const [rejecting, setRejecting] = useState(false);
  const [help, setHelp] = useState(false);

  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const filterKey = JSON.stringify(filters);
  // New filters start a new queue; a refetch keeps this session's decisions.
  const lastKey = useRef(filterKey);
  useEffect(() => {
    const ids = (data?.items ?? []).map((i) => i.id);
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      setQueue(initialQueue(ids));
      return;
    }
    setQueue((q) => (q.order.length ? syncQueue(q, ids) : initialQueue(ids)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const current = queue.current ? byId.get(queue.current) ?? null : null;
  useEffect(() => setView({ zoom: 1, rotation: 0 }), [current?.id]);
  const left = remaining(queue);
  const counts = sessionCounts(queue);
  const position = current ? left.indexOf(current.id) + 1 : 0;

  // Leaving the page sends the decisions still inside their undo window.
  useEffect(
    () => () => {
      for (const p of pendingRef.current) p.handle.flush();
      pendingRef.current = [];
      void qc.invalidateQueries({ queryKey: ['staff-review-queue'] });
    },
    [qc],
  );

  const send = useCallback(
    (item: ReviewItem, decision: Decision, note?: string, marks?: ReviewMark[]) => {
      setQueue((q) => decide(q, item.id, decision));
      const entry: Pending = {
        id: item.id,
        caseId: item.caseId,
        decision,
        at: Date.now(),
        handle: delayedCommit({
          message: t(decision === 'ACCEPTED' ? 'sp.review.approvedToast' : 'sp.review.rejectedToast', { name: item.requirement ? tr(item.requirement.title) : item.originalName }),
          commit: () =>
            api.post(`/admin/cases/${item.caseId}/documents/${item.id}/review`, {
              status: decision,
              ...(decision === 'REJECTED' ? { note, ...(marks?.length ? { reviewMarks: marks } : {}) } : {}),
            }),
          onCommitted: () => {
            pendingRef.current = pendingRef.current.filter((p) => p.id !== item.id);
            force((n) => n + 1);
            void qc.invalidateQueries({ queryKey: ['admin-case', item.caseId] });
            void qc.invalidateQueries({ queryKey: ['admin-cases'] });
          },
          // Undo (Z / "Geri al") and a failed request: back into the queue.
          rollback: () => {
            pendingRef.current = pendingRef.current.filter((p) => p.id !== item.id);
            force((n) => n + 1);
            setQueue((q) => undoDecision(q, item.id));
          },
        }),
      };
      pendingRef.current = [...pendingRef.current, entry];
      force((n) => n + 1);
    },
    [qc, t, tr],
  );

  const undoLast = () => {
    const last = [...pendingRef.current].reverse().find((p) => Date.now() - p.at < UNDO_MS);
    if (last) last.handle.undo();
  };

  const active = !rejecting;
  useShortcuts(
    [
      { id: 'next', keys: ['j'], labelKey: 'sp.review.keys.next', handler: () => setQueue((q) => step(q, 1)) },
      { id: 'prev', keys: ['k'], labelKey: 'sp.review.keys.prev', handler: () => setQueue((q) => step(q, -1)) },
      { id: 'approve', keys: ['a'], labelKey: 'sp.review.keys.approve', handler: () => current && send(current, 'ACCEPTED') },
      { id: 'reject', keys: ['r'], labelKey: 'sp.review.keys.reject', handler: () => current && setRejecting(true) },
      { id: 'skip', keys: ['s'], labelKey: 'sp.review.keys.skip', handler: () => current && setQueue((q) => skip(q, current.id)) },
      { id: 'undo', keys: ['z'], labelKey: 'sp.review.keys.undo', handler: undoLast },
      { id: 'zoomIn', keys: ['+'], labelKey: 'sp.review.keys.zoom', handler: () => setView((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.25) })) },
      { id: 'zoomOut', keys: ['-'], labelKey: 'sp.review.keys.zoomOut', handler: () => setView((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.25) })) },
      { id: 'fit', keys: ['0'], labelKey: 'sp.review.keys.fit', handler: () => setView((v) => ({ ...v, zoom: 1 })) },
      { id: 'rotL', keys: ['['], labelKey: 'sp.review.keys.rotateLeft', handler: () => setView((v) => ({ ...v, rotation: (v.rotation + 270) % 360 })) },
      { id: 'rotR', keys: [']'], labelKey: 'sp.review.keys.rotate', handler: () => setView((v) => ({ ...v, rotation: (v.rotation + 90) % 360 })) },
      { id: 'help', keys: ['?'], labelKey: 'sp.review.keys.help', handler: () => setHelp((v) => !v) },
      { id: 'close', keys: ['Escape'], labelKey: 'sp.review.keys.close', handler: () => (help ? setHelp(false) : !hasOpenOverlay() && navigate(back)) },
    ],
    { enabled: active, titleKey: 'sp.review.title' },
  );

  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  const done = !isLoading && !!data && left.length === 0;
  const scopeBtn = (scope: 'all' | 'mine', label: string, n?: number) => (
    <button
      type="button"
      role="radio"
      aria-checked={filters.scope === scope}
      onClick={() => setFilter('scope', scope === 'all' ? null : scope)}
      className={clsx('rounded-md px-2.5 py-1.5 text-xs font-semibold transition', filters.scope === scope ? 'bg-sunken text-ink' : 'text-muted hover:text-ink')}
    >
      {label} {n !== undefined && <span className="tabular-nums opacity-70">{n}</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[55] flex flex-col bg-canvas text-ink" role="main" aria-label={t('sp.review.title')}>
      <header className="relative flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2 sm:px-4">
        <Link to={back} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('sp.review.exit')} title={`${t('sp.review.exit')} (Esc)`}>
          <X className="size-5" aria-hidden />
        </Link>
        <h1 className="mr-2 text-sm font-semibold">{t('sp.review.title')}</h1>
        <div className="flex flex-wrap items-center gap-2" data-tour="sp-review-filters">
          {!filters.caseId ? (
            <div role="radiogroup" aria-label={t('sp.review.scope')} className="inline-flex gap-0.5 rounded-lg border border-line p-0.5">
              {scopeBtn('all', t('sp.review.scopeAll'), data?.counts.all)}
              {scopeBtn('mine', t('sp.review.scopeMine'), data?.counts.mine)}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sunken px-2.5 py-1.5 text-xs font-semibold">
              {t('sp.review.oneCase')}
              <button type="button" className="text-muted hover:text-ink" onClick={() => setFilter('caseId', null)} aria-label={t('sp.review.allCases')}>
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          )}
          <select aria-label={t('sp.review.visaType')} className="input min-h-8 w-auto py-1 pr-8 text-xs" value={filters.visaType ?? ''} onChange={(e) => setFilter('visaType', e.target.value || null)}>
            <option value="">{t('sp.review.allVisaTypes')}</option>
            {(data?.filters.visaTypes ?? []).map((v) => (
              <option key={v} value={v}>
                {t(`sp.review.visaTypes.${v}`, { defaultValue: v })}
              </option>
            ))}
          </select>
          <select aria-label={t('sp.review.partner')} className="input min-h-8 w-auto max-w-44 py-1 pr-8 text-xs" value={filters.partnerId ?? ''} onChange={(e) => setFilter('partnerId', e.target.value || null)}>
            <option value="">{t('sp.review.allPartners')}</option>
            <option value="none">{t('sp.review.noPartner')}</option>
            {(data?.filters.partners ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {isFetching && <Spinner className="size-4 text-link" />}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span className="hidden tabular-nums md:inline" aria-live="polite">
            {t('sp.review.session', counts)}
          </span>
          {current && (
            <span className="tabular-nums">
              {t('sp.review.position', { n: position, total: left.length })}
              {data?.capped && '+'}
            </span>
          )}
          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 font-semibold hover:bg-sunken hover:text-ink" onClick={() => setHelp((v) => !v)} aria-expanded={help} data-tour="sp-review-help">
            <Keyboard className="size-4" aria-hidden /> ?
          </button>
        </div>
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </header>

      {isLoading ? (
        <div className="grid flex-1 place-items-center">
          <Spinner className="size-6 text-muted" />
        </div>
      ) : error ? (
        <div className="grid flex-1 place-items-center text-center text-sm">
          <div>
            <p className="text-danger-fg">{t('admin.common.loadFailed')}</p>
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => refetch()}>
              {t('admin.common.retry')}
            </button>
          </div>
        </div>
      ) : done || !current ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <PartyPopper className="mx-auto size-10 text-success-fg" aria-hidden />
            <p className="mt-3 text-base font-semibold">{t('sp.review.empty')}</p>
            <p className="mt-1 text-sm text-muted">{t('sp.review.sessionDone', counts)}</p>
            <div className="mt-4 flex justify-center gap-2">
              {pendingRef.current.length > 0 && (
                <button type="button" className="btn-secondary btn-sm" onClick={undoLast}>
                  <Undo2 className="size-3.5" aria-hidden /> {t('sp.review.undo')}
                </button>
              )}
              <Link to={back} className="btn-primary btn-sm">
                {t('sp.review.exit')}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1">
          <DocViewer doc={current} view={view} onView={setView} />
          <aside className="flex min-h-0 flex-col border-t border-line bg-card lg:border-t-0 lg:border-l" data-tour="sp-review-panel">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <section>
                <p className="type-overline">{t(`sp.review.stage.${current.stage}`)}</p>
                <h2 className="mt-0.5 text-base font-semibold text-ink">{current.requirement ? tr(current.requirement.title) : t('sp.review.noRequirement')}</h2>
                {current.requirement?.description && <p className="mt-1 line-clamp-3 text-xs text-muted">{tr(current.requirement.description)}</p>}
                <p className="mt-1 text-[11px] text-muted">{t('sp.review.uploaded', { when: fmtRelative(current.createdAt) })}</p>
              </section>
              <section className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{fullName(current.case.client)}</p>
                    <p className="truncate text-xs text-muted">{current.case.profession}</p>
                  </div>
                  <Link to={`/admin/cases/${current.case.id}`} target="_blank" rel="noopener" className="inline-flex shrink-0 items-center gap-1 code-id text-xs font-medium text-link hover:underline">
                    {current.case.number} <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">{t('sp.review.visa')}</dt>
                  <dd className="truncate text-ink/90">{current.case.visaCategory ? `${tr(current.case.visaCategory.title)} · ${current.case.visaCategory.visaLabel}` : t(`sp.review.visaTypes.${current.case.visaType}`, { defaultValue: current.case.visaType })}</dd>
                  <dt className="text-muted">{t('sp.review.staff')}</dt>
                  <dd className="truncate text-ink/90">{current.case.assignedStaff ? fullName(current.case.assignedStaff) : '—'}</dd>
                  {current.case.partner && (
                    <>
                      <dt className="text-muted">{t('sp.review.partner')}</dt>
                      <dd className="truncate text-ink/90">{current.case.partner.name}</dd>
                    </>
                  )}
                </dl>
              </section>
              <section>
                <h3 className="mb-1.5 text-xs font-semibold text-muted">{t('sp.review.findings')}</h3>
                <Findings item={current} />
              </section>
              <section>
                <h3 className="mb-1.5 text-xs font-semibold text-muted">{t('sp.review.checklist')}</h3>
                <ul className="space-y-1 text-xs">
                  {current.checklist.map((r) => {
                    const I = CHECK_ICON[r.state];
                    return (
                      <li key={r.id} className={clsx('flex items-start gap-2 rounded px-1.5 py-1', r.id === current.requirementId && 'bg-primary/[0.06] font-semibold')}>
                        <I.icon className={clsx('mt-px size-3.5 shrink-0', I.cls)} aria-hidden />
                        <span className="min-w-0 flex-1 text-ink/90">
                          {tr(r.title)}
                          {!r.required && <span className="ml-1 font-normal text-muted">({t('sp.review.optional')})</span>}
                        </span>
                        <span className="sr-only">{t(`sp.review.checkState.${r.state}`)}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
            <div className="space-y-2 border-t border-line p-3" data-tour="sp-review-actions">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => send(current, 'ACCEPTED')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-success-fg px-3 text-sm font-semibold text-white hover:opacity-90">
                  <Check className="size-4" aria-hidden /> {t('sp.review.approve')} <kbd className="rounded bg-white/20 px-1 text-[10px]">A</kbd>
                </button>
                <button type="button" onClick={() => setRejecting(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger-fg px-3 text-sm font-semibold text-white hover:opacity-90">
                  <X className="size-4" aria-hidden /> {t('sp.review.reject')} <kbd className="rounded bg-white/20 px-1 text-[10px]">R</kbd>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-muted hover:bg-sunken hover:text-ink" onClick={() => setQueue((q) => step(q, -1))} aria-label={t('sp.review.keys.prev')}>
                    <ChevronLeft className="size-4" aria-hidden /> K
                  </button>
                  <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-muted hover:bg-sunken hover:text-ink" onClick={() => setQueue((q) => step(q, 1))} aria-label={t('sp.review.keys.next')}>
                    J <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-muted hover:bg-sunken hover:text-ink" onClick={() => setQueue((q) => skip(q, current.id))}>
                  <SkipForward className="size-4" aria-hidden /> {t('sp.review.skip')} <kbd className="rounded border border-line px-1 text-[10px]">S</kbd>
                </button>
                <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-muted hover:bg-sunken hover:text-ink disabled:opacity-40" onClick={undoLast} disabled={!pendingRef.current.length}>
                  <Undo2 className="size-4" aria-hidden /> {t('sp.review.undo')} <kbd className="rounded border border-line px-1 text-[10px]">Z</kbd>
                </button>
              </div>
              <button type="button" className="w-full text-center text-[11px] text-muted hover:text-ink" onClick={openShortcutSheet}>
                {t('sp.review.allShortcuts')}
              </button>
            </div>
          </aside>
        </div>
      )}
      <RejectDialog
        open={rejecting}
        doc={current}
        suggested={current ? suggestedReasons(current.insight?.flags ?? [], current.insight?.qualityLevel) : []}
        onClose={() => setRejecting(false)}
        onConfirm={(note, marks) => {
          setRejecting(false);
          if (current) send(current, 'REJECTED', note, marks);
        }}
      />
    </div>
  );
}

