import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Building2, CalendarPlus, Clock3, ExternalLink, UserRound, Video } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { fmtDateTime } from '@/components/admin/labels';
import { INTERVIEW_TONE, canJoin, fmtTime, icsUrl, minutesBetween, type Interview } from './shared';

/** Status pill, translated. */
export const InterviewStatusBadge = ({ status, className }: { status: Interview['status']; className?: string }) => {
  const { t } = useTranslation();
  return <span className={clsx('badge whitespace-nowrap', INTERVIEW_TONE[status], className)}>{t(`ops.interviews.status.${status}`)}</span>;
};

/**
 * One interview as a card: time, status, who with, vacancy, notes, join / calendar buttons and a
 * slot for audience-specific actions. Used by the admin list, the employer tab and the candidate page.
 */
export const InterviewCard = ({
  interview: i,
  audience,
  actions,
  onOpen,
  compact,
}: {
  interview: Interview;
  audience: 'staff' | 'company' | 'candidate';
  actions?: ReactNode;
  onOpen?: () => void;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const joinable = canJoin(i);
  const title =
    audience === 'candidate'
      ? i.company
        ? t('ops.account.with', { company: i.company.name })
        : t('ops.account.withTv')
      : i.candidate.name;
  return (
    <article className={clsx('card flex min-w-0 flex-col gap-3 p-4', compact ? 'sm:p-4' : 'sm:p-5', i.status === 'CANCELLED' && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="text-left font-display text-base font-bold text-navy-900 hover:text-brand-700">
              {title}
            </button>
          ) : (
            <p className="font-display text-base font-bold text-navy-900">{title}</p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1 font-medium text-navy-900">
              <Clock3 className="size-3.5" aria-hidden /> {fmtDateTime(i.startsAt)} – {fmtTime(i.endsAt)}
            </span>
            <span>{t('ops.common.minutes', { count: minutesBetween(i.startsAt, i.endsAt) })}</span>
          </p>
        </div>
        <InterviewStatusBadge status={i.status} />
      </div>

      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {audience !== 'candidate' && i.company && (
          <div className="flex items-center gap-1.5 text-ink/80">
            <Building2 className="size-3.5 shrink-0 text-muted" aria-hidden /> {i.company.name}
          </div>
        )}
        {audience === 'candidate' && i.application && (
          <div className="flex items-center gap-1.5 text-ink/80">
            <UserRound className="size-3.5 shrink-0 text-muted" aria-hidden /> {t('ops.account.vacancy')}: {tr(i.application.vacancy.title)}
          </div>
        )}
        {audience !== 'candidate' && i.application && (
          <div className="truncate text-ink/80">{tr(i.application.vacancy.title)}</div>
        )}
        {audience === 'staff' && i.staff && <div className="text-muted">{t('ops.interviews.fields.staff')}: {i.staff.name}</div>}
        {audience === 'staff' && i.candidate.email && <div className="truncate text-muted">{i.candidate.email}</div>}
      </dl>

      {i.notes && !compact && <p className="rounded-lg bg-surface/70 px-3 py-2 text-xs whitespace-pre-wrap text-ink/80">{i.notes}</p>}

      {i.status === 'PROPOSED' && audience !== 'candidate' && <p className="text-xs text-amber-800">{t('ops.company.candidateConfirms')}</p>}
      {i.status === 'PROPOSED' && audience === 'candidate' && <p className="text-xs font-medium text-amber-800">{t('ops.account.awaiting')}</p>}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {i.meetingUrl && i.status !== 'CANCELLED' && (
          <a
            href={i.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx('btn-sm', joinable ? 'btn-primary' : 'btn-white border border-line')}
            title={joinable ? undefined : t('ops.account.joinHint')}
          >
            {joinable ? <Video className="size-3.5" /> : <ExternalLink className="size-3.5" />} {t('ops.interviews.actions.join')}
          </a>
        )}
        {i.status !== 'CANCELLED' && (
          <a href={icsUrl(i.id)} className="btn-white btn-sm border border-line" download>
            <CalendarPlus className="size-3.5" /> {t('ops.account.ics')}
          </a>
        )}
        {actions}
      </div>
    </article>
  );
};
