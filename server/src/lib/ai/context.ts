/** OpenAI-format chat messages as sent to OpenRouter. */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

/**
 * Rough token estimate (no tokenizer dependency): ~3.5 characters per token for mixed
 * Latin/Cyrillic text and JSON, plus a small per-message overhead. Deliberately on the high side.
 */
export const estimateTokens = (text: string | null | undefined) => (text ? Math.ceil(text.length / 3.5) : 0);

export const messageTokens = (m: ChatMessage) => {
  let n = 4 + estimateTokens(m.content);
  if (m.role === 'assistant' && m.tool_calls) for (const c of m.tool_calls) n += 8 + estimateTokens(c.function.name) + estimateTokens(c.function.arguments);
  return n;
};

/**
 * Makes a stored history acceptable to providers: every assistant tool call gets a tool result right
 * after it (a placeholder when a turn was interrupted before the tool ran), and tool results without
 * their call are dropped.
 */
export const repairToolPairs = (history: ChatMessage[]): ChatMessage[] => {
  const out: ChatMessage[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    if (m.role === 'tool') continue; // emitted together with their assistant message below
    if (m.role === 'assistant' && m.tool_calls?.length) {
      out.push(m);
      const results = new Map<string, ChatMessage>();
      let j = i + 1;
      for (; j < history.length && history[j].role === 'tool'; j++) {
        const t = history[j] as Extract<ChatMessage, { role: 'tool' }>;
        if (!results.has(t.tool_call_id)) results.set(t.tool_call_id, t);
      }
      for (const c of m.tool_calls) out.push(results.get(c.id) ?? { role: 'tool', tool_call_id: c.id, content: '{"error":"not_executed"}' });
      i = j - 1;
      continue;
    }
    out.push(m);
  }
  return out;
};

export interface TrimOptions {
  maxMessages?: number;
  maxTokens?: number;
}

/**
 * Keeps the newest part of a conversation that fits in `maxMessages` / `maxTokens`. The kept part
 * always starts at a user message, so an assistant tool call is never separated from its tool
 * results (providers reject orphaned tool results). The newest user message is always kept, even
 * when it alone is over the budget. Returns how many older messages were left out.
 */
export const trimHistory = (history: ChatMessage[], opts: TrimOptions = {}) => {
  const maxMessages = opts.maxMessages ?? 20;
  const maxTokens = opts.maxTokens ?? 12_000;
  const lastUser = history.map((m) => m.role).lastIndexOf('user');

  let start = history.length;
  let tokens = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const t = messageTokens(history[i]);
    const count = history.length - i;
    const mustKeep = lastUser >= 0 && i >= lastUser;
    if (!mustKeep && (count > maxMessages || tokens + t > maxTokens)) break;
    tokens += t;
    start = i;
  }
  // Move forward to the first user message of the kept window.
  while (start < history.length && history[start].role !== 'user') start++;
  if (start >= history.length && lastUser >= 0) start = lastUser;
  const messages = history.slice(start);
  return { messages, omitted: start, tokens: messages.reduce((a, m) => a + messageTokens(m), 0) };
};
