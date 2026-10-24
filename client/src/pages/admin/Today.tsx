import { CallButton } from '@/components/calls/CallButton'; // click-to-call (Twilio / sipgate) or manual call log
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowUpRight, Check, Keyboard, PartyPopper, RefreshCw, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesToday } from '@/i18n/pagesToday';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { toastError } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { dueText, noteText, runAction, useMyWork, useRefreshMyWork, type WorkAction, type WorkBucket, type WorkItem, type WorkScope } from '@/components/today/api';
import { CATEGORY_TONE, FILTERS, KIND_ICON, PRIORITY_DOT, type WorkFilter } from '@/components/today/kinds';
import { TimerButton } from '@/components/timeCare/TimerButton'; // "⏱ Başlat" on rows with a case
import { RequiredTrainingBanner } from '@/components/team/training/TrainingNotice'; // unfinished required courses

registerCopy(pagesToday);

/** Delay before an action is sent: the undo toast can still cancel it. */
const UNDO_MS = 5000;
const BUCKETS: WorkBucket[] = ['overdue', 'today', 'week', 'later'];
const REASONS = ['unreadable', 'incomplete', 'expired', 'wrongDocument', 'notCertified'] as const;
const SCOPE_KEY = 'tv-today-scope';
const LOCALES = ['az', 'de', 'en', 'ru'];

const readScope = (): WorkScope => {
  try {
    return localStorage.getItem(SCOPE_KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
};
const saveScope = (s: WorkScope) => {
  try {
    localStorage.setItem(SCOPE_KEY, s);
  } catch {
    /* private mode */
  }
};

const isExternal = (href: string) => /^https?:\/\//.test(href) || href.startsWith('/api/');
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** The one-key action of a row (A): accept / done / the primary API button. */
const quickAction = (item: WorkItem) =>
  item.actions.find((a) => a.type === 'api' && (a.key === 'accept' || a.key === 'done') && !a.confirm) ?? item.actions.find((a) => a.type === 'api' && a.primary && !a.confirm);

/** /admin/today — "Bu gün mənim işlərim": one queue of everything waiting for the signed-in staff member. */
export default function Today() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  usePageTitle(t('today.title'));

  const [scope, setScopeState] = useState<WorkScope>(() => (isAdmin ? readScope() : 'mine'));
  const [byAssignee, setByAssignee] = useState(false);
  const [filter, setFilter] = useState<WorkFilter>('all');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(0);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const query = useMyWork(scope);
  const refresh = useRefreshMyWork();
  const pending = useRef(new Map<string, { timer: number; run: () => Promise<void> }>());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const setScope = (s: WorkScope) => {
    setScopeState(s);
    saveScope(s);
    setActive(0);
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Realtime: new notifications / case changes / mail → reload (debounced).
  const debounce = useRef(0);
  const soon = useCallback(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void query.refetch(), 1500);
  }, [query]);
  useRealtime('notification', soon);
  useRealtime('case.updated', soon);
  useRealtime('mail.new', soon);

  // Pending actions are sent right away when the page is left (nothing is silently dropped).
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const p of map.values()) {
        window.clearTimeout(p.timer);
        void p.run();
      }
      map.clear();
      window.clearTimeout(debounce.current);
    };
  }, []);

  const hide = (id: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const perform = (item: WorkItem, a: WorkAction, extra?: Record<string, unknown>) => {
    if (a.type === 'link') {
      if (a.href) navigate(a.href);
      return;
    }
    if (a.type === 'url') {
      if (a.href) window.open(a.href, '_blank', 'noopener');
      return;
    }
    if (a.type === 'reject' && !extra) {
      setRejecting((cur) => (cur === item.id ? null : item.id));
      return;
    }
    if (a.confirm && armed !== `${item.id}:${a.key}`) {
      setArmed(`${item.id}:${a.key}`);
      window.setTimeout(() => setArmed((cur) => (cur === `${item.id}:${a.key}` ? null : cur)), 4000);
      return;
    }
    setArmed(null);
    setRejecting(null);
    if (pending.current.has(item.id)) return;
    hide(item.id, true);
    const run = async () => {
      pending.current.delete(item.id);
      try {
        await runAction(a, extra);
      } catch (err) {
        toastError(err, t('today.toast.failed'));
      }
      try {
        await refresh(scope);
      } finally {
        hide(item.id, false);
      }
    };
    const timer = window.setTimeout(() => void run(), UNDO_MS);
    pending.current.set(item.id, { timer, run });
    toast(t('today.toast.done', { title: item.title }), {
      duration: UNDO_MS,
      action: {
        label: t('today.toast.undo'),
        onClick: () => {
          window.clearTimeout(timer);
          pending.current.delete(item.id);
          hide(item.id, false);
        },
      },
    });
  };

  const reject = (item: WorkItem, a: WorkAction, reason: (typeof REASONS)[number]) => {
    // The note goes to the client: written in the client's language.
    const lng = item.refs.clientLocale && LOCALES.includes(item.refs.clientLocale) ? item.refs.clientLocale : 'az';
    perform(item, a, { note: i18n.getFixedT(lng)(`today.reason.${reason}`) });
  };

  const data = query.data;
  const all = useMemo(() => (data?.items ?? []).filter((i) => !hidden.has(i.id)), [data, hidden]);
  const visible = useMemo(() => all.filter((i) => (filter === 'all' ? true : filter === 'urgent' ? i.priority === 'URGENT' : i.category === filter)), [all, filter]);

  // Sections: by deadline bucket, or (team view) by assignee.
  const sections = useMemo(() => {
    if (scope === 'all' && byAssignee) {
      const map = new Map<string, { key: string; title: string; items: WorkItem[] }>();
      for (const i of visible) {
        const key = i.assignee?.id ?? 'none';
        if (!map.has(key)) map.set(key, { key, title: i.assignee?.name || t('today.group.unassigned'), items: [] });
        map.get(key)!.items.push(i);
      }
      return [...map.values()].sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.title.localeCompare(b.title)));
    }
    return BUCKETS.map((b) => ({ key: b, title: t(`today.group.${b}`), items: visible.filter((i) => i.bucket === b) })).filter((s) => s.items.length);
  }, [visible, scope, byAssignee, t]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    if (active >= flat.length) setActive(Math.max(0, flat.length - 1));
  }, [flat.length, active]);

  const openItem = (item: WorkItem) => (isExternal(item.link) ? window.open(item.link, '_blank', 'noopener') : navigate(item.link));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const key = e.key.toLowerCase();
      if (!['j', 'k', 'a', 'enter'].includes(key) || !flat.length) return;
      if (key === 'enter' && e.target instanceof HTMLElement && e.target.closest('button, a')) return;
      e.preventDefault();
      const cur = flat[Math.min(active, flat.length - 1)];
      if (key === 'j' || key === 'k') {
        const next = Math.max(0, Math.min(flat.length - 1, active + (key === 'j' ? 1 : -1)));
        setActive(next);
        rowRefs.current.get(flat[next].id)?.scrollIntoView({ block: 'nearest' });
      } else if (key === 'enter') openItem(cur);
      else {
        const q = quickAction(cur);
        if (q) perform(cur, q);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const counts = data?.counts;
  const chipCount = (f: WorkFilter) => (!counts ? 0 : f === 'all' ? counts.total : f === 'urgent' ? counts.urgent : (counts.byCategory[f] ?? 0));

  return (
    <div className="space-y-4">
      <PageHead
        title={t('today.title')}
        subtitle={t('today.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label={t('today.scope.label')}>
                {(['mine', 'all'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    aria-pressed={scope === s}
                    className={clsx('min-h-8 rounded-md px-3 text-sm font-semibold transition', scope === s ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink')}
                  >
                    {t(s === 'mine' ? 'today.scope.mine' : 'today.scope.team')}
                  </button>
                ))}
              </div>
            )}
            {isAdmin && scope === 'all' && (
              <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink">
                <input type="checkbox" className="size-4 accent-brand-600" checked={byAssignee} onChange={(e) => setByAssignee(e.target.checked)} />
                {t('today.scope.byAssignee')}
              </label>
            )}
            <button type="button" className="btn-ghost btn-sm" onClick={() => void refresh(scope).catch((err) => toastError(err))} disabled={query.isFetching}>
              <RefreshCw className={clsx('size-3.5', query.isFetching && 'animate-spin')} aria-hidden /> {t('today.refresh')}
            </button>
          </div>
        }
      />

      <RequiredTrainingBanner />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap" role="group" aria-label={t('today.filter.label')}>
          {FILTERS.map((f) => {
            const n = chipCount(f);
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFilter(f);
                  setActive(0);
                }}
                aria-pressed={on}
                className={clsx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition',
                  on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:border-brand-400',
                  !on && f === 'urgent' && n > 0 && 'text-red-600',
                )}
              >
                {t(`today.filter.${f}`)}
                <span className={clsx('rounded-full px-1.5 text-xs tabular-nums', on ? 'bg-white/20' : 'bg-surface text-muted', !on && f === 'urgent' && n > 0 && 'bg-red-100 text-red-700')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : !flat.length ? (
        <div className="grid place-items-center rounded-2xl border border-line bg-card px-6 py-16 text-center">
          {/* TODO(ui): large portal empty state (size-14 icon, display title) -> <EmptyState size="lg" tone="brand"> (portal rework) */}
          <PartyPopper className="size-10 text-brand-600" aria-hidden />
          <p className="mt-3 font-display text-xl font-bold text-ink">{all.length ? t('today.empty.filtered') : t('today.empty.title')}</p>
          {!all.length && <p className="mt-1 max-w-md text-sm text-muted">{t('today.empty.body')}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((s) => (
            <section key={s.key} aria-labelledby={`today-${s.key}`}>
              <h2 id={`today-${s.key}`} className={clsx('mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.12em] uppercase', s.key === 'overdue' ? 'text-red-600' : 'text-muted')}>
                {s.title}
                <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] text-muted tabular-nums">{s.items.length}</span>
              </h2>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card" role="list">
                {s.items.map((item) => {
                  const index = flat.indexOf(item);
                  return (
                    <Fragment key={item.id}>
                      <Row
                        item={item}
                        now={now}
                        active={index === active}
                        showAssignee={scope === 'all' && !byAssignee}
                        armed={armed}
                        refCb={(el) => {
                          if (el) rowRefs.current.set(item.id, el);
                          else rowRefs.current.delete(item.id);
                        }}
                        onFocusRow={() => setActive(index)}
                        onOpen={() => openItem(item)}
                        onAction={(a) => perform(item, a)}
                      />
                      {rejecting === item.id && (
                        <RejectPanel
                          onCancel={() => setRejecting(null)}
                          onPick={(reason) => {
                            const a = item.actions.find((x) => x.type === 'reject');
                            if (a) reject(item, a, reason);
                          }}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {!!data?.more.length && (
        <div className="flex flex-wrap gap-2">
          {data.more
            .filter((m) => filter === 'all' || filter === 'urgent' || data.items.find((i) => i.kind === m.kind)?.category === filter)
            .map((m) => (
              <Link key={m.kind} to={m.link} className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-brand-700 hover:border-brand-400">
                {t(`today.kind.${m.kind}`)}: {t('today.more', { count: m.count })} <ArrowUpRight className="size-3" aria-hidden />
              </Link>
            ))}
        </div>
      )}

      <p className="hidden items-center gap-2 text-xs text-muted sm:flex">
        <Keyboard className="size-3.5" aria-hidden /> {t('today.keys')}
        {data && <span className="ml-auto">{t('today.updated', { time: new Date(data.generatedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}</span>}
      </p>
    </div>
  );
}

const Row = ({
  item,
  now,
  active,
  showAssignee,
  armed,
  refCb,
  onFocusRow,
  onOpen,
  onAction,
}: {
  item: WorkItem;
  now: number;
  active: boolean;
  showAssignee: boolean;
  armed: string | null;
  refCb: (el: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onOpen: () => void;
  onAction: (a: WorkAction) => void;
}) => {
  const { t } = useTranslation();
  const Icon = KIND_ICON[item.kind];
  const due = dueText(t, item, now);
  const note = noteText(t, item);
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      e.preventDefault();
      e.stopPropagation();
      onOpen();
    }
  };
  return (
    <div
      ref={refCb}
      role="listitem"
      tabIndex={0}
      onFocus={onFocusRow}
      onKeyDown={onKey}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        onFocusRow();
        onOpen();
      }}
      className={clsx(
        'group relative flex cursor-pointer flex-col gap-3 px-4 py-3 transition outline-none sm:flex-row sm:items-center',
        active ? 'bg-brand-50/70' : 'hover:bg-surface',
        'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset',
      )}
    >
      {active && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-brand-500" aria-hidden />}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={clsx('relative grid size-9 shrink-0 place-items-center rounded-lg', CATEGORY_TONE[item.category])}>
          <Icon className="size-[18px]" aria-hidden />
          <span className={clsx('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card', PRIORITY_DOT[item.priority])} title={t(`today.priority.${item.priority}`)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
            {t(`today.kind.${item.kind}`)}
            {item.priority === 'URGENT' && <span className="rounded bg-red-100 px-1 text-red-700 normal-case">{t('today.priority.URGENT')}</span>}
          </p>
          <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
          {(item.subtitle || note) && <p className="line-clamp-2 text-xs text-muted sm:line-clamp-1">{[note, item.subtitle].filter(Boolean).join(' · ')}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:hidden">
          <DueChip text={due.text} late={due.late} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        <span className="hidden sm:inline-flex">
          <DueChip text={due.text} late={due.late} />
        </span>
        {showAssignee && item.assignee?.name && <span className="max-w-[9rem] truncate rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">{item.assignee.name}</span>}
        {item.refs.caseId && <TimerButton caseId={item.refs.caseId} compact />}
        {item.refs.phone && <CallButton target={item.refs.inquiryId ? { inquiryId: item.refs.inquiryId } : { phone: item.refs.phone }} phone={item.refs.phone} name={item.title} compact />}
        {item.actions.map((a) => {
          const locked = !!a.notBefore && Date.parse(a.notBefore) > now;
          const isArmed = armed === `${item.id}:${a.key}`;
          const label = isArmed ? t('today.confirm') : t(`today.action.${a.label}`, a.params ?? {});
          return (
            <button
              key={a.key}
              type="button"
              disabled={locked}
              title={locked ? t('today.notBefore', { time: new Date(a.notBefore!).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) }) : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onAction(a);
              }}
              className={clsx(
                'inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50',
                isArmed
                  ? 'bg-amber-500 text-white'
                  : a.primary
                    ? 'bg-brand-600 text-white hover:bg-brand-700'
                    : a.type === 'reject' || a.key === 'rejectApp'
                      ? 'border border-line bg-card text-red-600 hover:border-red-300'
                      : 'border border-line bg-card text-ink hover:border-brand-400',
              )}
            >
              {a.key === 'accept' || a.key === 'done' ? <Check className="size-3.5" aria-hidden /> : null}
              {a.type === 'url' && <ArrowUpRight className="size-3" aria-hidden />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const DueChip = ({ text, late }: { text: string; late: boolean }) => (
  <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums', late ? 'bg-red-100 text-red-700' : 'bg-surface text-muted')}>{text}</span>
);

const RejectPanel = ({ onPick, onCancel }: { onPick: (r: (typeof REASONS)[number]) => void; onCancel: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-surface px-4 py-3" role="group" aria-label={t('today.reject.title')}>
      <p className="mb-2 text-xs font-semibold text-ink">
        {t('today.reject.title')} <span className="font-normal text-muted">— {t('today.reject.hint')}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button key={r} type="button" onClick={() => onPick(r)} title={t(`today.reason.${r}`)} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-red-600 hover:border-red-300">
            {t(`today.reasonLabel.${r}`)}
          </button>
        ))}
        <button type="button" onClick={onCancel} className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-muted hover:text-ink">
          <X className="size-3.5" aria-hidden /> {t('today.reject.cancel')}
        </button>
      </div>
    </div>
  );
};
