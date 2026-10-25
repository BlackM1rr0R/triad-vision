import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BarChart3, Check, Lock, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Poll } from './api';
import { useWorkspaceInvalidate } from './api';
import { Card, Chip, Empty, Field, IconButton, Modal, Skeleton, Toggle, errorText, fmtDateTime, fullName } from './ui';

/** One poll with vote toggles and a result bar per option. Also used by the chat module's poll card. */
export const PollCard = ({ poll, compact = false, onChanged }: { poll: Poll; compact?: boolean; onChanged?: (p: Poll) => void }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [busy, setBusy] = useState<string | null>(null);
  const max = Math.max(1, ...poll.options.map((o) => o.count));

  const vote = async (optionId: string) => {
    if (!poll.open || busy) return;
    setBusy(optionId);
    try {
      const { data } = await api.post<{ poll: Poll }>(`/workspace/polls/${poll.id}/vote`, { optionIds: [optionId] });
      onChanged?.(data.poll);
      inv.polls();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };
  const close = async () => {
    try {
      const { data } = await api.post<{ poll: Poll }>(`/workspace/polls/${poll.id}/close`);
      onChanged?.(data.poll);
      inv.polls();
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const remove = async () => {
    // TODO(ui): ConfirmDialog
    if (!window.confirm(t('ws.common.confirmDelete'))) return;
    try {
      await api.delete(`/workspace/polls/${poll.id}`);
      toast.success(t('ws.polls.deleted'));
      inv.polls();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <article className={clsx('rounded-xl border border-line bg-card', compact ? 'p-3' : 'px-4 py-3')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink">{poll.question}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>{fullName(poll.author)}</span>
            <span>· {t('ws.polls.votes', { count: poll.totalVotes })}</span>
            {poll.anonymous && <Chip tone="muted">{t('ws.polls.anonymousHint')}</Chip>}
            {poll.multiple && <Chip tone="muted">{t('ws.polls.multiple')}</Chip>}
            {!poll.open ? (
              <Chip tone="muted">
                <Lock className="size-3" /> {t('ws.polls.closed')}
              </Chip>
            ) : (
              poll.closesAt && <span>· {t('ws.polls.closesIn', { date: fmtDateTime(poll.closesAt) })}</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          {poll.canClose && <IconButton icon={Lock} label={t('ws.polls.close')} onClick={() => void close()} />}
          {poll.canDelete && <IconButton icon={Trash2} label={t('ws.common.delete')} onClick={() => void remove()} danger />}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.totalVotes ? Math.round((o.count / poll.totalVotes) * 100) : 0;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => void vote(o.id)}
                disabled={!poll.open || busy !== null}
                aria-pressed={o.mine}
                className={clsx('relative block w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition', o.mine ? 'border-line-strong bg-primary/[0.06]' : 'border-line bg-sunken hover:border-line-strong', !poll.open && 'cursor-default')}
              >
                <span className={clsx('absolute inset-y-0 left-0 rounded-lg transition-[width] duration-300', o.mine ? 'bg-primary/20' : 'bg-primary/[0.06]')} style={{ width: `${(o.count / max) * 100}%` }} aria-hidden />
                <span className="relative flex items-center gap-2">
                  <span className={clsx('grid size-4 shrink-0 place-items-center rounded-full border', o.mine ? 'border-line-strong bg-sunken text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'border-line bg-card')}>{o.mine && <Check className="size-3" />}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.text}</span>
                  <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">
                    {o.count} · {pct}%
                  </span>
                </span>
                {o.voters && o.voters.length > 0 && !compact && <span className="relative mt-1 block truncate pl-6 text-[0.7rem] text-muted">{o.voters.map(fullName).join(', ')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
};

export const NewPollDialog = ({ open, onClose, channelId }: { open: boolean; onClose: () => void; channelId?: string | null }) => {
  const { t } = useTranslation();
  const inv = useWorkspaceInvalidate();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [closesAt, setClosesAt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setAnonymous(false);
    setClosesAt('');
    setBusy(false);
  }, [open]);

  const clean = options.map((o) => o.trim()).filter(Boolean);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || clean.length < 2 || busy) return;
    setBusy(true);
    try {
      await api.post('/workspace/polls', { question: question.trim(), options: clean, multiple, anonymous, closesAt: closesAt ? new Date(closesAt).toISOString() : null, channelId: channelId ?? null });
      toast.success(t('ws.polls.created'));
      inv.polls();
      onClose();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ws.polls.new')}
      as="form"
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary btn-sm" disabled={busy}>
            {t('ws.common.cancel')}
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !question.trim() || clean.length < 2}>
            {t('ws.polls.new')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('ws.polls.question')}>
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} className="input" required />
        </Field>
        <div>
          <span className="label">{t('ws.polls.options')}</span>
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} placeholder={t('ws.polls.option', { n: i + 1 })} className="input" />
                {options.length > 2 && <IconButton icon={X} label={t('ws.common.delete')} onClick={() => setOptions(options.filter((_, j) => j !== i))} />}
              </div>
            ))}
          </div>
          {options.length < 12 && (
            <button type="button" onClick={() => setOptions([...options, ''])} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-link hover:underline">
              <Plus className="size-3.5" /> {t('ws.polls.addOption')}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={multiple} onChange={setMultiple} label={t('ws.polls.multiple')} />
          <Toggle checked={anonymous} onChange={setAnonymous} label={t('ws.polls.anonymous')} />
        </div>
        <Field label={t('ws.polls.closesAt')} hint={t('ws.common.optional')}>
          <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="input" />
        </Field>
      </div>
    </Modal>
  );
};

export const PollsCard = ({ polls, loading }: { polls: Poll[] | undefined; loading: boolean }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Card
      icon={BarChart3}
      title={t('ws.polls.title')}
      actions={
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm h-8 border border-line px-3">
          <Plus className="size-4" /> {t('ws.polls.new')}
        </button>
      }
      bodyClassName="space-y-3"
    >
      {loading ? <Skeleton className="h-28" /> : !polls?.length ? <Empty icon={BarChart3}>{t('ws.polls.empty')}</Empty> : polls.map((p) => <PollCard key={p.id} poll={p} />)}
      <NewPollDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  );
};
