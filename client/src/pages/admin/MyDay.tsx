import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import type { LucideIcon } from 'lucide-react';
import { AlarmClock, ArrowUpRight, CalendarDays, Check, Inbox, ListChecks, ListTodo, MessageCircleReply, RefreshCw } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesToday } from '@/i18n/pagesToday';
import { pagesMyDay } from '@/i18n/pagesMyDay';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { toastError } from '@/components/admin/labels';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { dueText, noteText, runAction, useMyWork, useRefreshMyWork, type WorkAction, type WorkItem } from '@/components/today/api';
import { CATEGORY_TONE, KIND_ICON, PRIORITY_DOT } from '@/components/today/kinds';
import { buildMyDay, greetingKey, startOf, type AgendaDay, type MyDaySection } from '@/components/today/myDay';
import { useStaffNav } from '@/components/command/navPrefs';
import { CallButton } from '@/components/calls/CallButton';
import { FastReviewButton } from '@/components/staffPower/review/FastReviewButton'; // full-screen document review (A / R / ← / →)

registerCopy(pagesToday);
registerCopy(pagesMyDay);

/** Rows per section before "All (n)". */
const SECTION_PREVIEW = 6;
const UNDO_MS = 5000;

const SECTION_ICON: Record<MyDaySection, LucideIcon> = {
  tasks: ListTodo,
  cases: AlarmClock,
  messages: MessageCircleReply,
  agenda: CalendarDays,
  leads: Inbox,
};

/** The one-click button of a row on this page: a link / url, or an API action without confirmation or reason. */
const primaryOf = (item: WorkItem): WorkAction | undefined =>
  item.actions.find((a) => a.primary && a.type !== 'reject' && !a.confirm) ?? item.actions.find((a) => (a.key === 'done' || a.key === 'take') && a.type === 'api' && !a.confirm);

const isExternal = (href: string) => /^https?:\/\//.test(href) || href.startsWith('/api/');

/**
 * /admin/my-day — "Bu günüm": the day plan of the signed-in staff member, built on the my-work queue
 * (GET /api/admin/my-work, scope=mine): today's tasks, late case work, unanswered client messages, the week's
 * embassy appointments / interviews / consultations by day, and new leads. Can be chosen as the /admin start page.
 */
export default function MyDay() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { landing, setLanding } = useStaffNav();
  usePageTitle(t('myDay.title'));

  const query = useMyWork('mine');
  const refresh = useRefreshMyWork();
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pending = useRef(new Map<string, { timer: number; run: () => Promise<void> }>());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const debounce = useRef(0);
  const soon = useCallback(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void query.refetch(), 1500);
  }, [query]);
  useRealtime('notification', soon);
  useRealtime('case.updated', soon);

  // Actions still in their undo window are sent when the page is left.
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

  const items = useMemo(() => (query.data?.items ?? []).filter((i) => !hidden.has(i.id)), [query.data, hidden]);
  const day = useMemo(() => buildMyDay(items, now), [items, now]);
  const overdue = useMemo(() => items.filter((i) => i.overdue).length, [items]);

  const setHiddenFor = (id: string, on: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const openHref = (href: string) => (isExternal(href) ? window.open(href, '_blank', 'noopener') : navigate(href));

  const perform = (item: WorkItem, a: WorkAction) => {
    if (a.type === 'link' || a.type === 'url') {
      if (a.href) openHref(a.href);
      return;
    }
    if (pending.current.has(item.id)) return;
    setHiddenFor(item.id, true);
    const run = async () => {
      pending.current.delete(item.id);
      try {
        await runAction(a);
      } catch (err) {
        toastError(err, t('today.toast.failed'));
      }
      try {
        await refresh('mine');
      } finally {
        setHiddenFor(item.id, false);
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
          setHiddenFor(item.id, false);
        },
      },
    });
  };

  const isLanding = landing === 'myday';
  const toggleLanding = () => {
    setLanding(isLanding ? null : 'myday');
    toast.success(t(isLanding ? 'myDay.landingOff' : 'myDay.landingOn'));
  };

  const dateLine = new Date(now).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  const allClear = !!query.data && !day.counts.tasks && !day.counts.cases && !day.counts.messages && !day.counts.agenda && !day.counts.leads;

  const row = (item: WorkItem, opts: { time?: boolean } = {}) => <DayRow key={item.id} item={item} now={now} showTime={opts.time} onOpen={() => openHref(item.link)} onAction={(a) => perform(item, a)} />;

  return (
    <div className="space-y-5">
      <PageHead
        title={t(`myDay.greeting.${greetingKey(new Date(now))}`, { name: user?.firstName ?? '' })}
        subtitle={
          <>
            <span className="font-semibold text-ink first-letter:uppercase">{dateLine}</span> · {t('myDay.subtitle')}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!!query.data?.counts.byKind.doc_review && <FastReviewButton pending={query.data.counts.byKind.doc_review} className="min-h-8 py-0 text-xs" />}
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm text-ink" title={t('myDay.landingHint')}>
              <input type="checkbox" className="size-4 accent-primary" checked={isLanding} onChange={toggleLanding} />
              {t('myDay.landing')}
            </label>
            <Link to="/admin/today" className="btn-secondary btn-sm">
              <ListChecks className="size-3.5" aria-hidden /> {t('myDay.queue')}
            </Link>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void refresh('mine').catch((err) => toastError(err))} disabled={query.isFetching} aria-label={t('today.refresh')}>
              <RefreshCw className={clsx('size-3.5', query.isFetching && 'animate-spin')} aria-hidden />
              <span className="max-sm:sr-only">{t('today.refresh')}</span>
            </button>
          </div>
        }
      />

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.isError ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Kpi label={t('myDay.kpi.overdue')} value={overdue} tone={overdue ? 'danger' : 'muted'} />
            <Kpi label={t('myDay.kpi.tasks')} value={day.counts.tasks} />
            <Kpi label={t('myDay.kpi.messages')} value={day.counts.messages} tone={day.counts.messages ? 'warning' : 'muted'} />
            <Kpi label={t('myDay.kpi.agenda')} value={day.agendaToday} />
            <Kpi label={t('myDay.kpi.leads')} value={day.counts.leads} />
          </dl>

          {allClear && <p className="rounded-xl border border-line bg-card px-4 py-6 text-center font-display text-lg font-bold text-ink">{t('myDay.allClear')}</p>}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section id="tasks" count={day.counts.tasks} items={day.tasks} render={(i) => row(i)} />
            <Section id="agenda" count={day.counts.agenda}>
              {day.agenda.length ? <Agenda days={day.agenda} lang={i18n.language} render={(i) => row(i, { time: true })} /> : null}
            </Section>
            <Section id="messages" count={day.counts.messages} items={day.messages} render={(i) => row(i)} />
            <Section id="cases" count={day.counts.cases} items={day.cases} render={(i) => row(i)} />
            <Section id="leads" count={day.counts.leads} items={day.leads} render={(i) => row(i)} className="lg:col-span-2" />
          </div>

          {query.data && (
            <p className="text-right text-xs text-muted">{t('today.updated', { time: new Date(query.data.generatedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) })}</p>
          )}
        </>
      )}
    </div>
  );
}

const Kpi = ({ label, value, tone = 'ink' }: { label: string; value: number; tone?: 'ink' | 'danger' | 'warning' | 'muted' }) => (
  <div className="rounded-xl border border-line bg-card px-4 py-3">
    <dt className="truncate text-xs font-medium text-muted">{label}</dt>
    <dd className={clsx('mt-0.5 font-display text-2xl font-bold tabular-nums', tone === 'danger' ? 'text-danger-fg' : tone === 'warning' ? 'text-warning-fg' : tone === 'muted' ? 'text-muted' : 'text-ink')}>{value}</dd>
  </div>
);

const Section = ({
  id,
  count,
  items,
  render,
  children,
  className,
}: {
  id: MyDaySection;
  count: number;
  items?: WorkItem[];
  render?: (i: WorkItem) => ReactNode;
  children?: ReactNode;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const Icon = SECTION_ICON[id];
  const list = items ?? [];
  const shown = all ? list : list.slice(0, SECTION_PREVIEW);
  const body = children ?? (list.length ? <div className="divide-y divide-line">{shown.map((i) => render?.(i))}</div> : null);
  return (
    <section aria-labelledby={`myday-${id}`} className={clsx('flex flex-col overflow-hidden rounded-xl border border-line bg-card', className)}>
      <h2 id={`myday-${id}`} className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold text-ink">
        <Icon className="size-4 text-muted" aria-hidden />
        {t(`myDay.section.${id}`)}
        <span className={clsx('ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', count ? 'bg-sunken text-ink' : 'bg-sunken text-muted')}>{count}</span>
      </h2>
      {body ?? (
        <p className="flex flex-1 items-center gap-2 px-4 py-6 text-sm text-muted">
          <Check className="size-4 text-success-fg" aria-hidden /> {t(`myDay.empty.${id}`)}
        </p>
      )}
      {!children && list.length > SECTION_PREVIEW && (
        <button type="button" onClick={() => setAll((v) => !v)} className="border-t border-line px-4 py-2 text-left text-xs font-semibold text-link hover:bg-sunken">
          {all ? t('myDay.showLess') : t('myDay.showAll', { count: list.length })}
        </button>
      )}
    </section>
  );
};

const Agenda = ({ days, lang, render }: { days: AgendaDay[]; lang: string; render: (i: WorkItem) => ReactNode }) => {
  const { t } = useTranslation();
  const label = (d: AgendaDay) =>
    d.offset === 0 ? t('myDay.day.today') : d.offset === 1 ? t('myDay.day.tomorrow') : new Date(`${d.day}T12:00:00`).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <div>
      {days.map((d) => (
        <div key={d.day}>
          <p className={clsx('bg-sunken px-4 py-1.5 text-[11px] font-bold tracking-[0.1em] uppercase first-letter:uppercase', d.offset === 0 ? 'text-link' : 'text-muted')}>{label(d)}</p>
          <div className="divide-y divide-line">{d.items.map((i) => render(i))}</div>
        </div>
      ))}
    </div>
  );
};

const DayRow = ({ item, now, showTime, onOpen, onAction }: { item: WorkItem; now: number; showTime?: boolean; onOpen: () => void; onAction: (a: WorkAction) => void }) => {
  const { t, i18n } = useTranslation();
  const Icon = KIND_ICON[item.kind];
  const due = dueText(t, item, now);
  const note = noteText(t, item);
  const primary = primaryOf(item);
  const start = showTime ? startOf(item) : null;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a')) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-pointer items-start gap-3 px-4 py-3 outline-none hover:bg-sunken focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
    >
      {start ? (
        <span className="w-12 shrink-0 pt-0.5 font-mono text-sm font-semibold text-ink tabular-nums">{new Date(start).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}</span>
      ) : (
        <span className={clsx('relative grid size-8 shrink-0 place-items-center rounded-lg', CATEGORY_TONE[item.category])}>
          <Icon className="size-4" aria-hidden />
          <span className={clsx('absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card', PRIORITY_DOT[item.priority])} title={t(`today.priority.${item.priority}`)} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t(`today.kind.${item.kind}`)}</p>
        <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
        {(note || item.subtitle) && <p className="line-clamp-2 text-xs text-muted">{[note, item.subtitle].filter(Boolean).join(' · ')}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        {!showTime && <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums', due.late ? 'bg-danger-bg text-danger-fg' : 'bg-sunken text-muted')}>{due.text}</span>}
        {item.refs.phone && <CallButton target={item.refs.inquiryId ? { inquiryId: item.refs.inquiryId } : { phone: item.refs.phone }} phone={item.refs.phone} name={item.title} compact />}
        {primary && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction(primary);
            }}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold whitespace-nowrap text-primary-contrast pointer-coarse:min-h-10"
          >
            {primary.key === 'done' && <Check className="size-3.5" aria-hidden />}
            {primary.type === 'url' && <ArrowUpRight className="size-3" aria-hidden />}
            {t(`today.action.${primary.label}`, primary.params ?? {})}
          </button>
        )}
      </div>
    </div>
  );
};
