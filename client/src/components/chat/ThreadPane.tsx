import { useTranslation } from 'react-i18next';
import { MessageSquare, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useThread } from './api';
import { Composer, type SendPayload } from './Composer';
import { MessageItem, type MessageActions } from './MessageList';
import type { Channel, Person } from './types';
import { channelLabel } from './utils';

/** Right pane: the root message and its replies, with a composer that posts into the thread. */
export const ThreadPane = ({
  rootId,
  channel,
  people,
  meId,
  actions,
  onSend,
  onTyping,
  onClose,
}: {
  rootId: string;
  channel: Channel;
  people: Person[];
  meId: string;
  actions: MessageActions;
  onSend: (p: SendPayload) => Promise<void>;
  onTyping?: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const thread = useThread(rootId);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <MessageSquare className="size-4 text-brand-600" />
        <span className="min-w-0 leading-tight">
          <span className="block text-sm font-bold text-ink">{t('chat.thread.title')}</span>
          <span className="block truncate text-xs text-muted">{channelLabel(channel)}</span>
        </span>
        <button type="button" onClick={onClose} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.actions.close')}>
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
        {thread.isLoading && (
          <div className="grid place-items-center py-10">
            <Spinner />
          </div>
        )}
        {thread.data && (
          <>
            <MessageItem m={thread.data.root} people={people} meId={meId} grouped={false} inThread actions={actions} />
            <div className="my-2 flex items-center gap-2 px-4 text-xs text-muted">
              <span className="whitespace-nowrap">{thread.data.replies.length ? t('chat.thread.replies', { count: thread.data.replies.length }) : t('chat.thread.noReplies')}</span>
              <span className="h-px flex-1 bg-line" />
            </div>
            {thread.data.replies.map((r, i) => {
              const prev = thread.data!.replies[i - 1];
              const grouped = !!prev && prev.authorId === r.authorId && new Date(r.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
              return <MessageItem key={r.id} m={r} people={people} meId={meId} grouped={grouped} inThread actions={actions} />;
            })}
          </>
        )}
      </div>
      {channel.isMember && !channel.archivedAt && <Composer people={people} placeholder={t('chat.composer.placeholderThread')} onSend={onSend} onTyping={onTyping} channelKey={`thread-${rootId}`} compact autoFocus />}
    </div>
  );
};
