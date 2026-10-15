import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { BarChart3, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import type { Poll } from './types';

/** "[poll:<id>]" anywhere in a message body marks a poll posted into the channel. */
export const pollIdOf = (body: string) => /\[poll:([A-Za-z0-9_-]{5,60})\]/.exec(body)?.[1] ?? null;

/**
 * Poll card for messages that reference a workspace poll. The polls API belongs to the team module;
 * when it is not available (404) the card renders nothing.
 */
export const PollCard = ({ pollId }: { pollId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['workspace', 'poll', pollId],
    queryFn: async () => (await api.get<{ poll: Poll } | Poll>(`/workspace/polls/${encodeURIComponent(pollId)}`)).data,
    retry: false,
    staleTime: 30_000,
  });
  if (q.isError || !q.data) return null;
  const poll = ('poll' in q.data ? q.data.poll : q.data) as Poll;
  if (!poll?.options) return null;
  const total = poll.totalVotes ?? poll.options.reduce((s, o) => s + (o.count ?? 0), 0);
  const closed = poll.open === false || !!poll.closedAt || (!!poll.closesAt && new Date(poll.closesAt).getTime() < Date.now());
  const vote = async (optionId: string) => {
    try {
      await api.post(`/workspace/polls/${encodeURIComponent(pollId)}/vote`, { optionIds: [optionId] });
      void qc.invalidateQueries({ queryKey: ['workspace', 'poll', pollId] });
    } catch {
      /* the poll module reports its own errors */
    }
  };
  return (
    <div className="mt-2 max-w-md rounded-xl border border-line bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <BarChart3 className="size-4 text-brand-600" aria-hidden />
        <span className="text-sm font-bold text-ink">{poll.question}</span>
        {closed && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted">
            <Lock className="size-3" /> {t('chat.poll.closed')}
          </span>
        )}
      </div>
      <ul className="space-y-1.5">
        {poll.options.map((o) => {
          const pct = total ? Math.round(((o.count ?? 0) / total) * 100) : 0;
          return (
            <li key={o.id}>
              <button type="button" disabled={closed} onClick={() => void vote(o.id)} className={clsx('relative block w-full overflow-hidden rounded-lg border px-3 py-1.5 text-left text-sm', o.mine ? 'border-brand-400' : 'border-line', !closed && 'hover:border-brand-300')}>
                <span className="absolute inset-y-0 left-0 bg-brand-50" style={{ width: `${pct}%` }} aria-hidden />
                <span className="relative flex items-center justify-between gap-2">
                  <span className={clsx('text-ink', o.mine && 'font-semibold')}>{o.text}</span>
                  <span className="text-xs text-muted">{pct}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {t('chat.poll.votes', { count: total })}
        {poll.anonymous && ` · ${t('chat.poll.anonymous')}`}
      </p>
    </div>
  );
};
