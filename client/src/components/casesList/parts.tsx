import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowUpRight, CalendarClock, Eye, FileClock, Handshake, Hourglass, MessageSquare, MessageSquareText } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesCasesList } from '@/i18n/pagesCasesList';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { fmtDate, fmtDateTime, fmtRelative, fullName } from '@/components/admin/labels';
import type { AdminCaseListItem } from '@/components/admin/types';
import { morphCaseRow } from '@/components/admin/caseMorph';
import { NextStepChip } from '@/components/caseNext/NextStepChip';
import { StageBadge } from '@/components/caseProcessing/parts';
import { CasePartnerCell } from '@/components/partners/CasesPartnerTools';
import { useAssignPartner, usePartnerOptions } from '@/components/partners/api';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesCasesList);

/** The list answer spreads the case row, so the appointment and the scalar owner id come along. */
export type CaseRow = AdminCaseListItem & { appointmentAt?: string | null; assignedStaffId?: string | null };

/** Days in the current status: neutral, amber from 3 days, red from 7. */
export const DaysInStatus = ({ c, className }: { c: CaseRow; className?: string }) => {
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

/** Pending uploads (amber when any) and the message count. */
export const ActivityCell = ({ c }: { c: CaseRow }) => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-2 text-[11px] text-muted tabular-nums">
      <span
        className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5', c.pendingDocs > 0 ? 'bg-warning-bg font-semibold text-warning-fg' : 'text-subtle')}
        title={t('cl.row.docsPending', { count: c.pendingDocs })}
      >
        <FileClock className="size-3" aria-hidden /> {c.pendingDocs}
      </span>
      <span className="inline-flex items-center gap-1" title={t('cl.row.messages', { count: c.messagesCount })}>
        <MessageSquare className="size-3" aria-hidden /> {c.messagesCount}
      </span>
    </span>
  );
};

/** Embassy appointment date (highlighted in the coming 7 days), "—" without one. */
export const AppointmentCell = ({ at }: { at?: string | null }) => {
  if (!at) return <span className="text-xs text-subtle">—</span>;
  const days = (new Date(at).getTime() - Date.now()) / 86_400_000;
  const soon = days >= 0 && days <= 7;
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs whitespace-nowrap tabular-nums', soon ? 'font-semibold text-link' : days < 0 ? 'text-muted' : 'text-ink/80')} title={fmtDateTime(at)}>
      <CalendarClock className="size-3 shrink-0" aria-hidden /> {fmtDate(at)}
    </span>
  );
};

const actionBtn =
  'grid size-8 place-items-center rounded-md text-muted transition hover:bg-sunken hover:text-ink focus-visible:bg-sunken focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50';

/**
 * Row hover actions (also shown while the row has keyboard focus inside, and always on touch screens):
 * quick view, write a message (quick view with the reply box focused), open the full page.
 */
export const RowActions = ({ c, onPreview, onMessage }: { c: CaseRow; onPreview: () => void; onMessage: () => void }) => {
  const { t } = useTranslation();
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-aria-selected:opacity-100 pointer-coarse:opacity-100">
      <button type="button" className={actionBtn} onClick={stop(onPreview)} aria-label={`${t('cl.row.preview')}: ${c.number}`} title={t('cl.row.preview')}>
        <Eye className="size-4" aria-hidden />
      </button>
      <button type="button" className={actionBtn} onClick={stop(onMessage)} aria-label={`${t('cl.row.message')}: ${c.number}`} title={t('cl.row.message')}>
        <MessageSquareText className="size-4" aria-hidden />
      </button>
      <Link
        to={`/admin/cases/${c.id}`}
        className={actionBtn}
        onClick={(e) => {
          e.stopPropagation();
          morphCaseRow(e, c.id);
        }}
        aria-label={`${t('cl.row.openFull')}: ${c.number}`}
        title={t('cl.row.openFull')}
      >
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </span>
  );
};

/** Phone / tablet card of a case: tap opens the quick view; the checkbox selects it for bulk actions. */
export const CaseCard = ({
  c,
  selected,
  current,
  onToggle,
  onOpen,
}: {
  c: CaseRow;
  selected: boolean;
  current: boolean;
  onToggle: (on: boolean, shift: boolean) => void;
  onOpen: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={clsx(
        'group relative flex h-full gap-3 rounded-xl border bg-card p-3.5 transition',
        selected ? 'border-primary/40 bg-primary/[0.04]' : 'border-line hover:border-line-strong',
        current && 'ring-2 ring-focus/50',
      )}
    >
      <input
        type="checkbox"
        className="relative z-10 mt-0.5 size-5 shrink-0 cursor-pointer accent-primary sm:size-4"
        aria-label={t('cl.row.select', { name: fullName(c.client) })}
        checked={selected}
        onClick={(e) => onToggle(e.currentTarget.checked, e.shiftKey)}
        onChange={() => {
          /* handled in onClick (needs shiftKey) */
        }}
      />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-focus/50">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="code-id block text-xs font-medium whitespace-nowrap text-link" data-vt-part="title">
              {c.number}
            </span>
            <span className="mt-0.5 block truncate font-semibold text-ink">{fullName(c.client)}</span>
            <span className="block truncate text-xs text-muted">{c.profession}</span>
          </span>
          <StatusBadge status={c.status} className="shrink-0" />
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <DaysInStatus c={c} />
          {c.processing?.stage && <StageBadge stage={c.processing.stage} />}
          <ActivityCell c={c} />
          {c.appointmentAt && <AppointmentCell at={c.appointmentAt} />}
        </span>
        {c.nextStep && <NextStepChip step={c.nextStep} className="mt-2.5" />}
        <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11px] text-muted">
          <span className={clsx('truncate', !c.assignedStaff && 'text-warning-fg')}>{c.assignedStaff ? fullName(c.assignedStaff) : t('admin.cases.unassigned')}</span>
          <CasePartnerCell c={c} empty="" />
          <span className="shrink-0 tabular-nums" title={fmtDateTime(c.updatedAt)}>
            {fmtRelative(c.updatedAt)}
          </span>
        </span>
      </button>
    </div>
  );
};

/** Referral partner of the selected cases, as a compact control inside the bulk bar. */
export const PartnerBulkControl = ({ ids, onDone }: { ids: string[]; onDone: () => void }) => {
  const { t } = useTranslation();
  const { data: partners } = usePartnerOptions();
  const assign = useAssignPartner();
  const [target, setTarget] = useState('');
  if (!ids.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-card pl-2">
      <Handshake className="size-3.5 text-muted" aria-hidden />
      <select aria-label={t('refPartners.assignTo')} className="min-h-9 max-w-[10rem] border-0 bg-transparent py-1 pr-6 text-xs font-semibold text-ink/85 focus:ring-0" value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">{t('refPartners.none')}</option>
        {(partners ?? [])
          .filter((p) => p.active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>
      <button
        type="button"
        className="min-h-9 rounded-r-lg border-l border-line px-2.5 text-xs font-semibold text-link hover:bg-primary/[0.06] disabled:opacity-50"
        disabled={assign.isPending}
        onClick={() =>
          assign.mutate(
            { caseIds: ids, partnerId: target || null },
            {
              onSuccess: (r) => {
                toast.success(t('refPartners.bulkDone', { count: r.updated }));
                onDone();
              },
            },
          )
        }
      >
        {assign.isPending ? <Spinner className="size-3.5" /> : t('refPartners.assignApply')}
      </button>
    </span>
  );
};
