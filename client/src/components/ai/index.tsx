import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { ChatPanelProps } from './ChatPanel';

/*
 * Lazy entry point of the AI chat: the panel code (markdown renderer, streaming client, copy) is
 * downloaded the first time a panel is rendered, so it never lands in the main bundle.
 *
 *   <ChatPanel scope="ADMIN" context={{ folderId, nodeId }} compact />
 *
 * After a confirmed action finishes, the panel dispatches
 *   window 'ai:action-done'  CustomEvent<{ actionId: string; tool: string; ok: boolean }>
 * so the drive / sheet editor can reload their data.
 */
const ChatPanelImpl = lazy(() => import('./ChatPanel'));

export type { ChatPanelProps } from './ChatPanel';
export type { AiContext, AiScope } from './api';

export const ChatPanel = (props: ChatPanelProps) => (
  <Suspense
    fallback={
      <div className={`grid h-full min-h-40 place-items-center bg-card text-brand-600 ${props.className ?? ''}`} role="status">
        <Loader2 className="size-6 animate-spin" />
      </div>
    }
  >
    <ChatPanelImpl {...props} />
  </Suspense>
);

export default ChatPanel;
