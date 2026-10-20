import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, BookUser, CalendarDays, CalendarPlus, ClipboardCheck, ListTodo, Mail, MessagesSquare, Palmtree, PenSquare } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWorkspace } from '@/i18n/pagesWorkspace';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { useRealtime } from '@/lib/realtime';
import { MyTasksWidget } from '@/components/tasks/MyTasksWidget';
import { InboxTodayWidget } from '@/components/aiMail/InboxTodayWidget';
import { useHome, useOptionalSummary, useWorkspaceInvalidate } from '@/components/workspace/api';
import { AnnouncementsCard } from '@/components/workspace/Announcements';
import { NotesBoard } from '@/components/workspace/NotesBoard';
import { PollsCard } from '@/components/workspace/Polls';
import { PresenceStrip } from '@/components/workspace/People';
import { LeaveRow } from '@/components/workspace/Leave';
import { Card, Chip, Empty, fmtTime } from '@/components/workspace/ui';

registerCopy(pagesWorkspace);

// Summaries built by the other workspace modules (shapes are read defensively; a 404 hides the card).
interface MailSummary {
  unread?: number;
  accounts?: { id: string; name?: string | null; email?: string; unread: number }[];
}
interface ChatSummary {
  unread?: number;
  mentions?: number;
}
interface EventsSummary {
  today?: EventRow[];
  items?: EventRow[];
}
interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  location?: string | null;
}

const greetingKey = () => {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
};

const QuickLink = ({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) => (
  <Link to={to} className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-brand-400 hover:bg-brand-50">
    <span className="grid size-8 place-items-center rounded-lg bg-brand-100 text-brand-700">
      <Icon className="size-4" aria-hidden />
    </span>
    {label}
  </Link>
);

const OpenLink = ({ to, label }: { to: string; label: string }) => (
  <Link to={to} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline">
    {label} <ArrowUpRight className="size-3" />
  </Link>
);

/** Workspace dashboard: greets the user and gathers what matters today in one screen. */
export default function WorkspaceHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sp] = useSearchParams();
  const inv = useWorkspaceInvalidate();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  usePageTitle(t('ws.home.title'));

  const home = useHome();
  const mail = useOptionalSummary<MailSummary>('mail', '/mail/summary');
  const chat = useOptionalSummary<ChatSummary>('chat', '/chat/summary');
  const events = useOptionalSummary<EventsSummary>('events', '/events/summary');

  useRealtime('presence.updated', () => inv.presence());
  useRealtime('announcement.new', () => inv.announcements());

  const now = useMemo(() => Date.now(), [home.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const highlight = sp.get('announcement');
  const todayEvents = events.data?.today ?? events.data?.items ?? [];
  const mailUnread = mail.data?.unread ?? mail.data?.accounts?.reduce((n, a) => n + a.unread, 0) ?? 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-surface">
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 lg:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink">{t(`ws.home.greeting.${greetingKey()}`, { name: user?.firstName ?? '' })}</h1>
            <p className="text-sm text-muted">{t('ws.home.subtitle')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <QuickLink to="/workspace/mail?compose=" icon={PenSquare} label={t('ws.home.quick.mail')} />
            <QuickLink to="/workspace/calendar?new=1" icon={CalendarPlus} label={t('ws.home.quick.event')} />
            <QuickLink to="/workspace/tasks?new=1" icon={ListTodo} label={t('ws.home.quick.task')} />
            <QuickLink to="/workspace/contacts?new=1" icon={BookUser} label={t('ws.home.quick.contact')} />
          </div>
        </header>

        {/* AI mail triage: today's shared inbox (info@…) by urgency / category, hidden without such a mailbox */}
        <InboxTodayWidget />

        {(mail.data || chat.data || events.data) && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mail.data && (
              <Card icon={Mail} title={t('ws.home.mail.title')} actions={<OpenLink to="/workspace/mail" label={t('ws.home.mail.open')} />} bodyClassName="p-4">
                {mail.data.accounts?.length ? (
                  <ul className="space-y-1.5">
                    {mail.data.accounts.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-ink">{a.name || a.email || a.id}</span>
                        <Chip tone={a.unread ? 'brand' : 'muted'}>{t('ws.home.mail.unread', { count: a.unread })}</Chip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{mailUnread ? t('ws.home.mail.unread', { count: mailUnread }) : t('ws.home.mail.empty')}</p>
                )}
              </Card>
            )}
            {chat.data && (
              <Card icon={MessagesSquare} title={t('ws.home.chat.title')} actions={<OpenLink to="/workspace/chat" label={t('ws.home.chat.open')} />} bodyClassName="p-4">
                {chat.data.unread || chat.data.mentions ? (
                  <div className="flex flex-wrap gap-2">
                    {!!chat.data.unread && <Chip tone="brand">{t('ws.home.chat.unread', { count: chat.data.unread })}</Chip>}
                    {!!chat.data.mentions && <Chip tone="warn">{t('ws.home.chat.mentions', { count: chat.data.mentions })}</Chip>}
                  </div>
                ) : (
                  <p className="text-sm text-muted">{t('ws.home.chat.empty')}</p>
                )}
              </Card>
            )}
            {events.data && (
              <Card icon={CalendarDays} title={t('ws.home.events.title')} actions={<OpenLink to="/workspace/calendar" label={t('ws.home.events.open')} />} bodyClassName="p-4">
                {todayEvents.length ? (
                  <ul className="space-y-1.5">
                    {todayEvents.slice(0, 5).map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-sm">
                        <span className="w-14 shrink-0 text-xs font-semibold text-muted tabular-nums">{e.allDay ? t('ws.home.events.allDay') : fmtTime(e.startsAt)}</span>
                        <span className="truncate text-ink">{e.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('ws.home.events.empty')}</p>
                )}
              </Card>
            )}
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <AnnouncementsCard items={home.data?.announcements.items} loading={home.isLoading} unread={home.data?.announcements.unread ?? 0} isAdmin={isAdmin} highlightId={highlight} />
            <NotesBoard notes={home.data?.notes} loading={home.isLoading} />
            <PollsCard polls={home.data?.polls} loading={home.isLoading} />
          </div>
          <div className="space-y-5">
            <PresenceStrip people={home.data?.presence.people} now={now} loading={home.isLoading} />
            <MyTasksWidget />
            {isAdmin && (
              <Card icon={ClipboardCheck} title={t('ws.home.approvals.title')} actions={<OpenLink to="/workspace/team?tab=leave" label={t('ws.home.approvals.open')} />} bodyClassName="px-4 py-1">
                {home.data?.leave.pending.length ? (
                  <ul className="divide-y divide-line">
                    {home.data.leave.pending.slice(0, 5).map((l) => (
                      <LeaveRow key={l.id} l={l} mine={false} admin dense />
                    ))}
                  </ul>
                ) : (
                  <Empty icon={ClipboardCheck} className="py-5">
                    {t('ws.home.approvals.empty')}
                  </Empty>
                )}
              </Card>
            )}
            <Card icon={Palmtree} title={t('ws.home.myLeave.title')} actions={<OpenLink to="/workspace/team?tab=leave" label={t('ws.home.presence.open')} />} bodyClassName="px-4 py-1">
              {home.data?.leave.mine.length ? (
                <ul className="divide-y divide-line">
                  {home.data.leave.mine.map((l) => (
                    <LeaveRow key={l.id} l={l} mine admin={false} dense />
                  ))}
                </ul>
              ) : (
                <Empty icon={Palmtree} className="py-5">
                  {t('ws.home.myLeave.empty')}
                </Empty>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
