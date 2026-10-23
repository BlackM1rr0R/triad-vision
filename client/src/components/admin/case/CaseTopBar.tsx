import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  ClipboardList,
  Copy,
  FileStack,
  FileText,
  History,
  ListTodo,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  StickyNote,
} from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { CallButton } from '@/components/calls/CallButton';
import { StatusPill } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { fmtDate, fmtDateTime, fullName, statusLabel, waLink } from '../labels';
import type { CaseStats } from '../types';

const HeaderChips = lazy(() => import('./HeaderChips'));
const TimerButton = lazy(() => import('@/components/timeCare/TimerButton'));

export type GoTo = (section: string, opts?: { focus?: string }) => void;

const Meta = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <span className={className}>
    <span className="sr-only">{label}: </span>
    {children}
  </span>
);

/**
 * Sticky compact case header: number, status, client, visa, owner, key dates and the quick actions
 * (call, message, timer, ⋯). Everything else from the old header lives in the summary column.
 */
export const CaseTopBar = ({
  c,
  stats,
  goTo,
  onEdit,
  onTemplate,
  onPackage,
}: {
  c: CaseDetail;
  stats: CaseStats;
  goTo: GoTo;
  onEdit: () => void;
  onTemplate: () => void;
  onPackage: () => void;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const relation = (c as CaseDetail & { relation?: string | null }).relation ?? null;
  const client = c.client;
  const name = fullName(client);

  const items: MenuItem[] = [
    { label: t('caseLayout.menu.edit'), icon: Pencil, onSelect: onEdit },
    { label: t('caseLayout.menu.fromTemplate'), icon: FileText, onSelect: onTemplate },
    { label: t('caseLayout.menu.package'), icon: FileStack, onSelect: onPackage },
    'separator',
    { label: t('caseLayout.menu.note'), icon: StickyNote, onSelect: () => goTo('case-notes', { focus: 'int-note' }) },
    { label: t('caseLayout.menu.task'), icon: ListTodo, onSelect: () => goTo('case-tasks') },
    { label: t('caseLayout.menu.clientTask'), icon: ClipboardList, onSelect: () => goTo('client-tasks') },
    { label: t('caseLayout.menu.history'), icon: History, onSelect: () => goTo('case-history') },
    'separator',
    { label: t('caseLayout.menu.email'), icon: Mail, onSelect: () => void (window.location.href = `mailto:${client.email}`) },
    ...(client.phone ? [{ label: t('caseLayout.menu.whatsapp'), icon: MessageCircle, onSelect: () => void window.open(waLink(client.phone!), '_blank', 'noopener') }] : []),
    {
      label: t('caseLayout.menu.copy'),
      icon: Copy,
      onSelect: () =>
        void navigator.clipboard?.writeText(c.number).then(
          () => toast.success(t('caseLayout.menu.copied')),
          () => undefined,
        ),
    },
  ];

  return (
    <>
    <header
      id="case-topbar"
      className="sticky top-16 z-30 -mx-4 -mt-4 border-b border-line bg-card px-4 py-2.5 shadow-[0_1px_2px_rgba(11,31,68,0.04)] sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <Link
          to="/admin/cases"
          className="-ml-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
          aria-label={t('caseLayout.back')}
          title={t('caseLayout.back')}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="font-mono text-base font-bold text-ink sm:text-lg">{c.number}</h1>
            <StatusPill domain="case" status={c.status} label={statusLabel(c.status)} />
            <span className="hidden flex-wrap items-center gap-1.5 sm:inline-flex">
              <Suspense fallback={null}>
                <HeaderChips caseId={c.id} clientId={client.id} relation={relation} onOpenData={() => goTo('case-data')} />
              </Suspense>
            </span>
          </div>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className="w-full text-sm font-semibold break-words text-ink sm:w-auto">{name}</span>
            <Meta label={t('admin.case.header.visa')} className="min-w-0 truncate sm:before:mr-2 sm:before:content-['·']">
              {c.visaCategory ? `${c.visaCategory.visaLabel} · ${tr(c.visaCategory.title)}` : '—'}
            </Meta>
            <Meta label={t('caseLayout.meta.staff')} className="hidden before:mr-2 before:content-['·'] md:inline">
              {c.assignedStaff ? fullName(c.assignedStaff) : <span className="text-warning-fg">{t('caseLayout.meta.unassigned')}</span>}
            </Meta>
            <Meta label={t('caseLayout.meta.created')} className="hidden before:mr-2 before:content-['·'] lg:inline">
              {t('caseLayout.meta.created')} {fmtDate(c.createdAt)}
            </Meta>
            <Meta label={t('caseLayout.meta.inStatus', { days: stats.daysInStatus })} className="hidden before:mr-2 before:content-['·'] lg:inline">
              <span className={stats.daysInStatus >= 7 ? 'font-semibold text-danger-fg' : undefined}>{t('caseLayout.meta.inStatus', { days: stats.daysInStatus })}</span>
            </Meta>
            {c.appointmentAt && (
              <Meta label={t('caseLayout.meta.appointment')} className="inline-flex items-center gap-1 font-medium text-accent-fg before:mr-1 before:text-muted before:content-['·']">
                <CalendarClock className="size-3.5 shrink-0" aria-hidden /> {fmtDateTime(c.appointmentAt)}
              </Meta>
            )}
            {c.status === 'APPROVED' && c.visaValidTo && (
              <Meta label={t('caseLayout.meta.visaValid')} className="inline-flex items-center gap-1 font-medium text-success-fg before:mr-1 before:text-muted before:content-['·']">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden /> {fmtDate(c.visaValidFrom)} – {fmtDate(c.visaValidTo)}
              </Meta>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {client.phone && <CallButton target={{ caseId: c.id }} phone={client.phone} name={name} compact className="min-h-9 px-2.5 sm:px-3" />}
          <Button variant="secondary" size="sm" icon={MessageSquare} onClick={() => goTo('case-messages', { focus: 'msg-body' })} className="hidden sm:inline-flex">
            {t('caseLayout.message')}
          </Button>
          <IconButton icon={MessageSquare} label={t('caseLayout.message')} variant="secondary" size="sm" onClick={() => goTo('case-messages', { focus: 'msg-body' })} className="sm:hidden" />
          <span className="hidden sm:contents">
            <Suspense fallback={null}>
              <TimerButton caseId={c.id} className="min-h-9" />
            </Suspense>
          </span>
          <Menu
            label={t('caseLayout.more')}
            widthClassName="min-w-56"
            trigger={<IconButton icon={MoreHorizontal} label={t('caseLayout.more')} variant="secondary" size="sm" />}
            items={items}
          />
        </div>
      </div>
    </header>
      {/* Phones: chips + timer get their own row, below the sticky part (keeps the sticky header short). */}
      <div className="-mt-3 flex flex-wrap items-center gap-1.5 empty:hidden sm:hidden">
        <Suspense fallback={null}>
          <HeaderChips caseId={c.id} clientId={client.id} relation={relation} onOpenData={() => goTo('case-data')} />
          <TimerButton caseId={c.id} compact />
        </Suspense>
      </div>
    </>
  );
};
