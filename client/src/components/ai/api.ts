/** Types and the streaming client for /api/ai (Server-Sent Events over a POST, read with fetch). */

export type AiScope = 'CLIENT' | 'ADMIN';

export interface AiContext {
  folderId?: string | null;
  nodeId?: string | null;
  caseId?: string | null;
  page?: string | null;
}

export type AiActionStatus = 'PENDING' | 'DONE' | 'REJECTED' | 'FAILED' | 'EXPIRED';

export interface AiAction {
  id: string;
  tool: string;
  summary: string;
  status: AiActionStatus;
  createdAt: string;
  decidedAt: string | null;
  expiresAt: string;
  result: unknown;
  args?: unknown;
}

export interface AiConversationItem {
  id: string;
  title: string | null;
  scope: AiScope;
  archived: boolean;
  updatedAt: string;
  pendingActions: number;
}

export interface AiToolChip {
  callId: string;
  name: string;
  label: string;
  status?: 'running' | 'done' | 'error';
}

export interface AiStoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools: AiToolChip[];
  createdAt: string;
  costUsd?: number;
}

export interface AiStreamEvent {
  event: 'start' | 'delta' | 'tool' | 'action' | 'notice' | 'done' | 'error';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Error answered as JSON before a stream starts (limits, 404, 409 …). */
export class AiHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public reason?: string,
    public serverMessage?: string,
  ) {
    super(serverMessage ?? code);
  }
}

/** Minimal SSE line parser (mirror of the server's). */
const sseParser = (onEvent: (event: string, data: string) => void) => {
  let buf = '';
  let data: string[] = [];
  let name = '';
  const line = (l: string) => {
    if (l === '') {
      if (data.length) onEvent(name || 'message', data.join('\n'));
      data = [];
      name = '';
      return;
    }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? '' : l.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') name = value;
  };
  return (chunk: string, end = false) => {
    buf += chunk;
    const parts = buf.split(/\r\n|\n|\r/);
    buf = end ? '' : (parts.pop() ?? '');
    parts.forEach(line);
    if (end) line('');
  };
};

/** POSTs to an SSE endpoint and calls `onEvent` for every event until the stream ends. */
export const streamPost = async (url: string, body: unknown, onEvent: (e: AiStreamEvent) => void, signal?: AbortSignal) => {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang.slice(0, 2) : '';
  const res = await fetch(`/api${url}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(lang ? { 'X-Locale': lang } : {}) },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    let j: { error?: string; reason?: string; message?: string } = {};
    try {
      j = await res.json();
    } catch {
      /* not JSON */
    }
    throw new AiHttpError(res.status, j.error ?? (res.status === 429 ? 'TOO_MANY_REQUESTS' : 'HTTP_ERROR'), j.reason, j.message);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const feed = sseParser((event, data) => {
    try {
      onEvent({ event: event as AiStreamEvent['event'], data: JSON.parse(data) });
    } catch {
      /* ignore malformed */
    }
  });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      feed(decoder.decode(), true);
      break;
    }
    feed(decoder.decode(value, { stream: true }));
  }
};
