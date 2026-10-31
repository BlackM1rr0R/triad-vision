import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CalendarCheck, ThumbsDown, ThumbsUp, Users, type LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesEmployerExtras } from '@/i18n/pagesEmployerExtras';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { toastJobsError } from '@/components/jobs/labels';

registerCopy(pagesEmployerExtras);

export type Vote = 'LIKE' | 'INTERVIEW' | 'REJECT';
export const REJECT_REASONS = ['GERMAN', 'EXPERIENCE', 'QUALIFICATION', 'SALARY', 'AVAILABILITY', 'OTHER'] as const;

export interface EmployerVote {
  id: string;
  userId: string | null;
  voterName: string;
  vote: Vote;
  rejectReason: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  mine?: boolean;
}

const VOTE_META: Record<Vote, { icon: LucideIcon; tone: string; active: string }> = {
  LIKE: { icon: ThumbsUp, tone: 'text-success', active: 'border-success bg-success/10 text-success' },
  INTERVIEW: { icon: CalendarCheck, tone: 'text-primary', active: 'border-primary bg-primary/10 text-primary' },
  REJECT: { icon: ThumbsDown, tone: 'text-danger', active: 'border-danger bg-danger/10 text-danger' },
};
const VOTES: Vote[] = ['LIKE', 'INTERVIEW', 'REJECT'];

/** Read-only list of votes ("who voted what"): employer portal and admin panel. */
export const EmployerVotesList = ({ votes, title, className }: { votes: EmployerVote[]; title?: string; className?: string }) => {
  const { t } = useTranslation();
  if (!votes.length) return title ? null : <p className={clsx('text-xs text-muted', className)}>{t('employerVotes.none')}</p>;
  return (
    <div className={className}>
      {title && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Users className="size-3.5" aria-hidden /> {title}
        </p>
      )}
      <ul className="space-y-1.5">
        {votes.map((v) => {
          const M = VOTE_META[v.vote];
          return (
            <li key={v.id} className="rounded-xl bg-sunken px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <M.icon className={clsx('size-3.5 shrink-0', M.tone)} aria-hidden />
                <span className="font-semibold text-ink">
                  {v.voterName}
                  {v.mine ? ` (${t('employerVotes.you')})` : ''}
                </span>
                <span className={clsx('font-medium', M.tone)}>{t(`employerVotes.vote.${v.vote}`)}</span>
                {v.rejectReason && <span className="text-muted">· {t(`employerVotes.reason.${v.rejectReason}`)}</span>}
                <span className="ml-auto text-[11px] text-muted">{fmtDate(v.updatedAt)}</span>
              </div>
              {v.comment && <p className="mt-1 whitespace-pre-line text-ink">{v.comment}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Company portal: the signed-in user's vote + the team's votes on one presented candidate. */
export const CandidateVotes = ({
  applicationId,
  status,
  votes,
  onDone,
}: {
  applicationId: string;
  status: string;
  votes: EmployerVote[];
  onDone: () => void;
}) => {
  const { t } = useTranslation();
  const mine = votes.find((v) => v.mine);
  const [vote, setVote] = useState<Vote | null>(mine?.vote ?? null);
  const [reason, setReason] = useState(mine?.rejectReason ?? '');
  const [comment, setComment] = useState(mine?.comment ?? '');
  const open = status === 'PROPOSED' || status === 'INTERVIEW';

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.put<{ interviewRequested: boolean }>(`/company/candidates/${applicationId}/vote`, {
          vote,
          rejectReason: vote === 'REJECT' && reason ? reason : null,
          comment: comment.trim() || null,
        })
      ).data,
    onSuccess: (d) => {
      toast.success(d.interviewRequested ? t('employerVotes.interviewRequested') : t('employerVotes.saved'));
      onDone();
    },
    onError: toastJobsError,
  });
  const withdraw = useMutation({
    mutationFn: () => api.delete(`/company/candidates/${applicationId}/vote`),
    onSuccess: () => {
      toast.success(t('employerVotes.withdrawn'));
      setVote(null);
      setReason('');
      setComment('');
      onDone();
    },
    onError: toastJobsError,
  });
  const others = votes.filter((v) => !v.mine);

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Users className="size-4 text-primary" aria-hidden /> {t('employerVotes.title')}
        </p>
        {open && <p className="mt-0.5 text-xs text-muted">{t('employerVotes.hint')}</p>}
      </div>
      {open ? (
        <>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('employerVotes.title')}>
            {VOTES.map((v) => {
              const M = VOTE_META[v];
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={vote === v}
                  onClick={() => setVote(v)}
                  className={clsx(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors',
                    vote === v ? M.active : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  <M.icon className="size-3.5" aria-hidden /> {t(`employerVotes.vote.${v}`)}
                </button>
              );
            })}
          </div>
          {vote === 'REJECT' && (
            <label className="block text-xs font-medium text-muted">
              {t('employerVotes.reason.label')}
              <select className="input mt-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">{t('employerVotes.reason.none')}</option>
                {REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`employerVotes.reason.${r}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {vote && (
            <label className="block text-xs font-medium text-muted">
              {t('employerVotes.comment')}
              <textarea
                className="input mt-1 min-h-14 text-sm"
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t('employerVotes.commentPh')}
              />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={!vote || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Spinner className="size-3.5" />} {t('employerVotes.save')}
            </button>
            {mine && (
              <button type="button" className="btn-ghost btn-sm" disabled={withdraw.isPending} onClick={() => withdraw.mutate()}>
                {t('employerVotes.withdraw')}
              </button>
            )}
          </div>
          <EmployerVotesList votes={others} />
        </>
      ) : (
        <>
          <p className="text-xs text-muted">{t('employerVotes.closed')}</p>
          <EmployerVotesList votes={votes} />
        </>
      )}
    </div>
  );
};
