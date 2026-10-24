import { useEffect, useState, type ReactNode } from 'react';
import { STATUS_TONES, toneTexts } from '@/components/ui/status';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  ArrowRight,
  BellRing,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  ClipboardCheck,
  Clock,
  Compass,
  FileText,
  Hourglass,
  Lightbulb,
  ListChecks,
  MapPin,
  MessageCircle,
  MessageSquareWarning,
  Phone,
  Sparkles,
  UserRound,
  XCircle,
} from 'lucide-react';
import { STEP_KEYS } from '@/lib/caseStatus';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { CaseStatus, Notification } from '@/lib/types';
import type { ActiveCase, DocItemState, LastMessage } from './accountTypes';
import { downloadIcs } from './CaseCards';
import { ProgressRing } from './ProgressRing';
import { StatusBadge } from './StatusBadge';
import { FIELD_TAB, type ProfileField } from './profileFields';
import { useMarkNotificationsRead } from './useNotifications';
import { useWhen } from './useWhen';
import { stepLabel } from './stepLabel';

const caseLink = (c: { id: string }, anchor?: string | null) => `/account/cases/${c.id}${anchor ?? ''}`;

/** Card header used by every dashboard widget. */
const WidgetTitle = ({ icon: Icon, id, children, action }: { icon: typeof BellRing; id: string; children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3">
    <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-base font-bold text-navy-900">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="truncate">{children}</span>
    </h2>
    {action}
  </div>
);

const MoreLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="-my-2 inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold whitespace-nowrap text-brand-600 hover:text-brand-700">
    {children}
    <ArrowRight className="size-3.5" aria-hidden />
  </Link>
);

// ─── Journey ─────────────────────────────────────────────────────────────

/** The active case: progress, current status, and the one next action. */
export const JourneyCard = ({ c }: { c: ActiveCase }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const clientTurn = c.turn === 'client';
  const action = c.nextAction;
  const hintCount = action.kind === 'FIX_DOCUMENTS' ? c.documents.rejected : c.documents.missingRequired;

  return (
    <section className="card relative overflow-hidden" aria-labelledby="journey-title">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 px-5 pt-5 pb-6 text-white sm:px-7 sm:pt-6">
        <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-[radial-gradient(closest-side,var(--color-brand-400),transparent)] opacity-25" aria-hidden />
        <div className="relative flex items-start gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <span className="eyebrow text-brand-400">{t('accountPage.dash.journey')}</span>
            <h2 id="journey-title" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-extrabold sm:text-2xl">
              <span className="min-w-0 break-words">
                <span className="text-white/60">{t('portal.caseNo')}</span> <span className="whitespace-nowrap">{c.number}</span>
              </span>
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/75">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Briefcase className="size-4 shrink-0" aria-hidden />
                <span className="truncate font-medium text-white">{c.profession}</span>
              </span>
              {c.visaCategory && (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="badge shrink-0 bg-white/15 text-white">{c.visaCategory.visaLabel}</span>
                  <span className="truncate">{tr(c.visaCategory.title)}</span>
                </span>
              )}
            </div>
          </div>
          <ProgressRing percent={c.percent} size={76} stroke={7} tone="light" className="max-sm:scale-[0.85] max-sm:-mr-1.5 max-sm:-mt-1.5" label={`${t('accountPage.dash.progress')}: ${c.percent}%`}>
            <span className="text-center leading-none">
              <span className="block font-display text-lg font-extrabold">{c.percent}%</span>
              <span className="mt-0.5 block text-[10px] font-semibold text-white/70">{t('accountPage.dash.done')}</span>
            </span>
          </ProgressRing>
        </div>

        {/* 6-step track */}
        <ol className="relative mt-6 grid grid-cols-6 gap-1.5" aria-label={t('accountPage.dash.stepOf', { n: Math.max(1, c.step + 1), total: c.stepCount })}>
          {STEP_KEYS.map((key, i) => {
            const done = i < c.step;
            const current = i === c.step;
            return (
              <li key={key} className="min-w-0" aria-current={current ? 'step' : undefined}>
                <span
                  className={clsx(
                    'block h-1.5 rounded-full',
                    done ? 'bg-brand-400' : current ? 'bg-white' : 'bg-white/15',
                  )}
                  aria-hidden
                />
                <span
                  className={clsx(
                    'mt-2 hidden truncate text-[11px] font-semibold md:block',
                    current ? 'text-white' : done ? 'text-white/70' : 'text-white/40',
                  )}
                >
                  {stepLabel(t, key, c.visaType)}
                </span>
                <span className="sr-only">{stepLabel(t, key, c.visaType)}</span>
              </li>
            );
          })}
        </ol>
        <p className="relative mt-2 text-xs font-semibold text-white/70 md:hidden">
          {t('accountPage.dash.stepOf', { n: Math.max(1, c.step + 1), total: c.stepCount })} · {stepLabel(t, STEP_KEYS[Math.max(0, c.step)], c.visaType)}
        </p>
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={c.status} />
          {clientTurn ? (
            <span className="badge bg-warning-bg text-warning-fg">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              {t('portal.actionRequired')}
            </span>
          ) : c.turn === 'staff' ? (
            <span className="badge bg-info-bg text-info-fg">
              <Hourglass className="size-3.5" aria-hidden />
              {t('accountPage.dash.ourTurn')}
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted">{t(`portal.statusHelp.${c.status}`)}</p>

        {c.staffNote && (
          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">{t('portal.staffNote')}</p>
              <p className="mt-1 line-clamp-4 text-sm leading-relaxed break-words whitespace-pre-line text-amber-950">{c.staffNote}</p>
            </div>
          </div>
        )}

        <div
          className={clsx(
            'mt-5 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
            clientTurn ? 'border-brand-400/40 bg-brand-50' : 'border-line bg-surface',
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={clsx(
                'grid size-10 shrink-0 place-items-center rounded-xl',
                clientTurn ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30' : 'bg-white text-sky-700',
              )}
            >
              {clientTurn ? <Sparkles className="size-5" aria-hidden /> : <Hourglass className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-wide text-muted uppercase">{t('portal.nextAction')}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-navy-900">
                {t(`accountPage.dash.nextHint.${action.kind}`, { count: hintCount })}
              </p>
            </div>
          </div>
          <Link
            to={caseLink(c, action.anchor)}
            className={clsx('min-h-11 w-full shrink-0 sm:w-auto', clientTurn ? 'btn-primary' : 'btn-ghost')}
          >
            {t(`accountPage.dash.next.${action.kind}`)}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
};

// ─── Document checklist ─────────────────────────────────────────────────

const DOC_ICON: Record<DocItemState, typeof CheckCircle2> = {
  missing: CircleDashed,
  pending: Clock,
  accepted: CheckCircle2,
  rejected: XCircle,
};
const DOC_TONE: Record<DocItemState, string> = { ...toneTexts(STATUS_TONES.docItem), missing: 'text-muted' };

export const DocumentChecklist = ({ c }: { c: ActiveCase }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const d = c.documents;
  const allAccepted = d.total > 0 && d.items.every((i) => i.state === 'accepted' || (!i.required && i.state === 'missing'));
  const reqPct = d.required ? Math.round((d.requiredUploaded / d.required) * 100) : 0;
  const LIMIT = 7;
  // Rejected first so problems are never hidden below the fold.
  const items = [...d.items].sort((a, b) => Number(b.state === 'rejected') - Number(a.state === 'rejected'));
  const shown = items.slice(0, LIMIT);

  return (
    <section className="card card-pad" aria-labelledby="checklist-title">
      <WidgetTitle
        icon={ListChecks}
        id="checklist-title"
        action={<MoreLink to={caseLink(c, `#docs-${d.stage.toLowerCase()}`)}>{t('accountPage.dash.docs.open')}</MoreLink>}
      >
        {t('accountPage.dash.docs.title')}
      </WidgetTitle>
      <p className="mt-1 pl-[2.6rem] text-sm text-muted">{t(`accountPage.dash.docs.${d.stage}`)}</p>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
        <div className="col-span-3 rounded-xl border border-line p-3 sm:col-span-1">
          <p className="text-xs font-semibold text-muted">{t('accountPage.dash.docs.requiredUploaded')}</p>
          <p className="mt-1 font-display text-xl font-extrabold text-navy-900">
            {d.requiredUploaded}
            <span className="text-base text-muted"> / {d.required}</span>
          </p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-brand-100" aria-hidden>
            <span className="block h-full rounded-full bg-brand-600 transition-[width] duration-700" style={{ width: `${reqPct}%` }} />
          </span>
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-3">
          <div className="rounded-xl border border-line p-3">
            <p className="text-xs font-semibold text-muted">{t('accountPage.dash.docs.accepted')}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-success">{d.accepted}</p>
          </div>
          <div className={clsx('rounded-xl border p-3', d.rejected ? 'border-red-200 bg-red-50' : 'border-line')}>
            <p className={clsx('text-xs font-semibold', d.rejected ? 'text-danger' : 'text-muted')}>{t('accountPage.dash.docs.rejected')}</p>
            <p className={clsx('mt-1 font-display text-xl font-extrabold', d.rejected ? 'text-danger' : 'text-navy-900')}>{d.rejected}</p>
          </div>
        </div>
      </div>

      {allAccepted ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {t('accountPage.dash.docs.allAccepted')}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {shown.map((item) => {
            const Icon = DOC_ICON[item.state];
            return (
              <li key={item.id} className={clsx('flex items-start gap-3 py-2.5', item.state === 'rejected' && '-mx-3 rounded-lg border-0 bg-red-50 px-3')}>
                <Icon className={clsx('mt-0.5 size-4.5 shrink-0', DOC_TONE[item.state])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words text-navy-900">
                    {tr(item.title)}
                    {!item.required && <span className="ml-1.5 text-xs font-normal text-muted">· {t('accountPage.dash.docs.optional')}</span>}
                  </p>
                  {item.note && <p className="mt-0.5 text-xs break-words text-danger">{item.note}</p>}
                </div>
                <span className={clsx('shrink-0 text-xs font-semibold whitespace-nowrap', DOC_TONE[item.state])}>
                  {t(`accountPage.dash.docs.state.${item.state}`)}
                </span>
              </li>
            );
          })}
          {items.length > LIMIT && (
            <li className="pt-2.5 text-xs text-muted">{t('accountPage.dash.docs.more', { count: items.length - LIMIT })}</li>
          )}
        </ul>
      )}
    </section>
  );
};

// ─── Appointment ────────────────────────────────────────────────────────

/** Re-renders once a minute (for the countdown). */
const useMinuteTick = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

export const AppointmentWidget = ({ c }: { c: ActiveCase }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const now = useMinuteTick();
  if (!c.appointment) return null;
  const at = new Date(c.appointment.at);
  const diff = at.getTime() - now;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const title = `${t('portal.appointment.title')} · ${c.number}`;

  return (
    <section className="card overflow-hidden" aria-labelledby="appt-title">
      <div className="bg-gradient-to-br from-violet-600 to-violet-800 p-5 text-white sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex w-16 shrink-0 flex-col overflow-hidden rounded-xl bg-white text-center text-navy-900 shadow-sm" aria-hidden>
            <span className="bg-violet-500 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">{date(at, { month: 'short' })}</span>
            <span className="py-1 font-display text-2xl font-extrabold">{date(at, { day: 'numeric' })}</span>
          </div>
          <div className="min-w-0">
            <h2 id="appt-title" className="text-base font-bold">
              {t('accountPage.dash.appointment.title')}
            </h2>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-white/85">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
              <time dateTime={c.appointment.at}>{date(at, { dateStyle: 'full', timeStyle: 'short' })}</time>
            </p>
            {c.appointment.place && (
              <p className="mt-1 flex items-start gap-1.5 text-sm break-words text-white/85">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                {c.appointment.place}
              </p>
            )}
          </div>
        </div>

        {diff > 0 ? (
          <div className="mt-5">
            <p className="text-xs font-semibold text-white/70">{t('accountPage.dash.appointment.countdown')}</p>
            <div className="mt-2 grid grid-cols-3 gap-2" role="timer" aria-live="off">
              {(
                [
                  [days, 'days'],
                  [hours, 'hours'],
                  [minutes, 'minutes'],
                ] as const
              ).map(([value, unit]) => (
                <div key={unit} className="rounded-xl bg-white/12 px-2 py-2 text-center ring-1 ring-white/15">
                  <span className="block font-display text-2xl leading-none font-extrabold tabular-nums">{value}</span>
                  <span className="mt-1 block text-[11px] font-semibold text-white/75">{t(`accountPage.dash.appointment.${unit}`)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-white/12 px-3 py-2 text-sm text-white/85">{t('accountPage.dash.appointment.passed')}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4 min-[480px]:flex-row sm:p-5 lg:flex-col">
        {diff > 0 && (
          <button
            type="button"
            className="btn-primary min-h-11 flex-1"
            onClick={() =>
              downloadIcs({
                uid: `${c.number}-appointment`,
                start: at,
                title,
                place: c.appointment!.place,
                description: `${title}\n${t('portal.statusHelp.APPOINTMENT_SCHEDULED')}`,
              })
            }
          >
            <CalendarPlus className="size-4" aria-hidden />
            {t('accountPage.dash.appointment.addToCalendar')}
          </button>
        )}
        <Link to={caseLink(c, '#appointment')} className="btn min-h-11 flex-1 border border-line text-navy-900 hover:bg-surface">
          {t('accountPage.dash.appointment.details')}
        </Link>
      </div>
    </section>
  );
};

// ─── Manager / contact ──────────────────────────────────────────────────

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.28.25-.27.54-.34.72-.34h.52c.17 0 .4-.06.62.47.24.56.8 1.94.87 2.08.07.14.12.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.27.14.43.12.59-.07.16-.18.68-.8.86-1.07.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.34Z" />
  </svg>
);

export const ManagerCard = ({ c }: { c: ActiveCase | null }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const { data: content } = useSiteContent();
  const contact = content?.settings.contact;
  const name = c?.manager ? `${c.manager.firstName} ${c.manager.lastName}` : t('accountPage.dash.manager.team');
  const initials = c?.manager ? `${c.manager.firstName[0] ?? ''}${c.manager.lastName[0] ?? ''}`.toUpperCase() : 'TV';
  const wa = contact?.whatsapp?.replace(/\D/g, '');

  return (
    <section className="card card-pad" aria-labelledby="manager-title">
      <WidgetTitle icon={UserRound} id="manager-title">
        {t('accountPage.dash.manager.title')}
      </WidgetTitle>
      <div className="mt-4 flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-display text-base font-extrabold text-white shadow-md shadow-brand-600/25" aria-hidden>
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy-900">{name}</p>
          {contact?.hours && <p className="truncate text-xs text-muted">{tr(contact.hours)}</p>}
        </div>
      </div>
      {!c?.manager && <p className="mt-3 text-sm leading-relaxed text-muted">{t('accountPage.dash.manager.pending')}</p>}
      <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
        {c && (
          <Link to={caseLink(c, '#messages')} className="btn-primary btn-sm min-h-11">
            <MessageCircle className="size-4" aria-hidden />
            {t('accountPage.dash.manager.chat')}
          </Link>
        )}
        {contact?.phone && (
          <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="btn btn-sm min-h-11 border border-line text-navy-900 hover:bg-surface">
            <Phone className="size-4" aria-hidden />
            {t('accountPage.dash.manager.call')}
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm min-h-11 border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            <WhatsAppIcon className="size-4" />
            {t('accountPage.dash.manager.whatsapp')}
          </a>
        )}
      </div>
    </section>
  );
};

// ─── Notifications & last message ───────────────────────────────────────

export const LatestNotifications = ({ items, unread }: { items: Notification[]; unread: number }) => {
  const { t } = useTranslation();
  const when = useWhen();
  const navigate = useNavigate();
  const markRead = useMarkNotificationsRead();

  const open = (n: Notification) => {
    // optimistic: the dot and the badge clear before the request returns (rolled back on error)
    if (!n.readAt) markRead.mutate([n.id]);
    navigate(n.link ?? '/account/notifications');
  };

  return (
    <section className="card card-pad" aria-labelledby="latest-notif-title">
      <WidgetTitle
        icon={BellRing}
        id="latest-notif-title"
        action={<MoreLink to="/account/notifications">{t('accountPage.dash.notifications.all')}</MoreLink>}
      >
        {t('accountPage.dash.notifications.title')}
        {unread > 0 && (
          <span className="ml-2 badge bg-danger align-middle text-white">
            {unread} <span className="sr-only">{t('accountPage.dash.notifications.unread')}</span>
          </span>
        )}
      </WidgetTitle>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('accountPage.dash.notifications.empty')}</p>
      ) : (
        <ul className="-mx-2 mt-3">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface"
              >
                <span className="mt-1.5 flex size-2 shrink-0" aria-hidden>
                  {!n.readAt && <span className="size-2 rounded-full bg-brand-600" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-sm text-navy-900', n.readAt ? 'font-medium' : 'font-bold')}>{n.title}</span>
                  <time className="block text-xs text-muted" dateTime={n.createdAt}>
                    {when(n.createdAt)}
                  </time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export const LastMessageCard = ({ message, caseId }: { message: LastMessage | null; caseId: string | null }) => {
  const { t } = useTranslation();
  const when = useWhen();
  const target = message?.caseId ?? caseId;

  return (
    <section className="card card-pad" aria-labelledby="last-msg-title">
      <WidgetTitle icon={MessageCircle} id="last-msg-title">
        {t('accountPage.dash.message.title')}
      </WidgetTitle>
      {message ? (
        <div className="mt-4">
          <div className={clsx('rounded-2xl px-4 py-3', message.fromTeam ? 'rounded-tl-sm bg-surface' : 'rounded-tr-sm bg-brand-50')}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="font-bold text-navy-900">
                {message.fromTeam ? `${message.author.firstName} · ${t('portal.messages.team')}` : t('accountPage.dash.message.you')}
              </span>
              <time className="text-muted" dateTime={message.createdAt}>
                {when(message.createdAt)}
              </time>
            </p>
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed break-words whitespace-pre-line text-navy-900">{message.body}</p>
          </div>
          <MoreLink to={`/account/cases/${message.caseId}#messages`}>{t('accountPage.dash.message.reply')}</MoreLink>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-muted">{t('accountPage.dash.message.empty')}</p>
          {target && <MoreLink to={`/account/cases/${target}#messages`}>{t('accountPage.dash.message.write')}</MoreLink>}
        </>
      )}
    </section>
  );
};

// ─── Quick links & tips ─────────────────────────────────────────────────

export const QuickLinks = ({ visaSlug }: { visaSlug?: string | null }) => {
  const { t } = useTranslation();
  const links = [
    { to: visaSlug ? `/visas/${visaSlug}` : '/visas', label: t(visaSlug ? 'accountPage.dash.quick.visa' : 'accountPage.dash.quick.visas'), icon: FileText },
    { to: '/faq', label: t('accountPage.dash.quick.faq'), icon: CircleHelp },
    { to: '/eligibility', label: t('accountPage.dash.quick.eligibility'), icon: ClipboardCheck },
    { to: '/contact', label: t('accountPage.dash.quick.contact'), icon: Phone },
  ];
  return (
    <section className="card card-pad" aria-labelledby="quick-title">
      <WidgetTitle icon={Compass} id="quick-title">
        {t('accountPage.dash.quick.title')}
      </WidgetTitle>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to} className="min-w-0">
            <Link
              to={to}
              className="group flex h-full min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm font-semibold text-navy-900 transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <Icon className="size-4 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 break-words">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

type TipGroup = 'start' | 'documents' | 'contract' | 'embassy' | 'appointment' | 'decision' | 'approved';

export const tipGroup = (status: CaseStatus | null): TipGroup => {
  switch (status) {
    case 'DOCUMENTS_PENDING':
    case 'DOCUMENTS_REVIEW':
      return 'documents';
    case 'CONTRACT_SENT':
    case 'CONTRACT_SIGNED':
      return 'contract';
    case 'EMBASSY_DOCUMENTS':
    case 'EMBASSY_REVIEW':
      return 'embassy';
    case 'APPOINTMENT_SCHEDULED':
      return 'appointment';
    case 'DECISION_PENDING':
      return 'decision';
    case 'APPROVED':
      return 'approved';
    default:
      return 'start';
  }
};

export const TipsCard = ({ status }: { status: CaseStatus | null }) => {
  const { t } = useTranslation();
  const group = tipGroup(status);
  const tips = t(`accountPage.dash.tips.${group}`, { returnObjects: true }) as unknown as string[];
  const checklist = group === 'appointment';
  return (
    <section className="card card-pad" aria-labelledby="tips-title">
      <WidgetTitle icon={checklist ? ClipboardCheck : Lightbulb} id="tips-title">
        {t(checklist ? 'accountPage.dash.tips.appointmentTitle' : 'accountPage.dash.tips.title')}
      </WidgetTitle>
      <ul className={clsx('mt-4 grid gap-2.5', checklist && 'sm:grid-cols-2')}>
        {(Array.isArray(tips) ? tips : []).map((tip) => (
          <li key={tip} className="flex items-start gap-2.5 text-sm leading-relaxed text-navy-900">
            {checklist ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-violet-600" aria-hidden />
            ) : (
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
            )}
            <span className="min-w-0">{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

// ─── Profile completeness ───────────────────────────────────────────────

export const ProfileCard = ({ percent, missing }: { percent: number; missing: ProfileField[] }) => {
  const { t } = useTranslation();
  const firstTab = missing[0] ? FIELD_TAB[missing[0]] : 'personal';
  return (
    <section className="card card-pad" aria-labelledby="profile-card-title">
      <div className="flex items-center gap-4">
        <ProgressRing percent={percent} size={60} stroke={6} className="text-navy-900" />
        <div className="min-w-0">
          <h2 id="profile-card-title" className="text-base font-bold text-navy-900">
            {t('accountPage.dash.profileCard.title')}
          </h2>
          <p className="text-sm text-muted">
            {missing.length === 0
              ? t('accountPage.dash.profileCard.complete')
              : t('accountPage.dash.profileCard.missing', { count: missing.length })}
          </p>
        </div>
      </div>
      {missing.length > 0 && (
        <>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {missing.map((f) => (
              <li key={f}>
                <Link
                  to={`/account/profile?tab=${FIELD_TAB[f]}`}
                  className="badge border border-dashed border-line bg-surface py-1 text-navy-900 hover:border-brand-400 hover:text-brand-700"
                >
                  {t(`accountPage.profile.fields.${f}`)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">{t('accountPage.dash.profileCard.hint')}</p>
          <Link to={`/account/profile?tab=${firstTab}`} className="btn-ghost btn-sm mt-4 min-h-11 w-full">
            {t('accountPage.dash.profileCard.cta')}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
};

// ─── Skeleton ───────────────────────────────────────────────────────────

const Bone = ({ className }: { className?: string }) => <span className={clsx('block rounded-md bg-line/70', className)} />;

/** Same grid and approximate heights as the loaded dashboard, so nothing jumps. */
export const DashboardSkeleton = () => (
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8" aria-busy="true">
    <div className="min-w-0 space-y-6">
      <div className="card overflow-hidden">
        <div className="h-[184px] bg-navy-900/90 p-6">
          <Bone className="h-3 w-28 bg-white/15" />
          <Bone className="mt-4 h-6 w-48 bg-white/15" />
          <Bone className="mt-3 h-4 w-64 max-w-full bg-white/10" />
          <Bone className="mt-8 h-1.5 w-full bg-white/10" />
        </div>
        <div className="space-y-3 p-6">
          <Bone className="h-5 w-40" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-2/3" />
          <Bone className="mt-4 h-20 w-full rounded-2xl" />
        </div>
      </div>
      <div className="card card-pad space-y-3">
        <Bone className="h-6 w-44" />
        <div className="grid grid-cols-3 gap-3">
          <Bone className="h-20" />
          <Bone className="h-20" />
          <Bone className="h-20" />
        </div>
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-5/6" />
        <Bone className="h-4 w-4/6" />
      </div>
    </div>
    <div className="min-w-0 space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card card-pad space-y-3">
          <Bone className="h-6 w-36" />
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-3/4" />
          <Bone className="h-10 w-full" />
        </div>
      ))}
    </div>
  </div>
);
