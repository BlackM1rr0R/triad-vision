/**
 * Incremental Server-Sent Events parser (WHATWG event-stream rules, the subset OpenRouter uses):
 * lines end with \n, \r\n or \r; `data:` lines of one event are joined with \n; a blank line
 * dispatches the event; lines starting with ":" are comments (OpenRouter sends ": OPENROUTER PROCESSING"
 * keep-alives). Chunks may split anywhere, even inside a UTF-8 sequence when fed bytes.
 */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export const createSseParser = (onEvent: (ev: SseEvent) => void) => {
  let buffer = '';
  let dataLines: string[] = [];
  let eventName = '';
  let lastId: string | undefined;
  const decoder = new TextDecoder();

  const dispatch = () => {
    if (dataLines.length) onEvent({ event: eventName || 'message', data: dataLines.join('\n'), ...(lastId !== undefined ? { id: lastId } : {}) });
    dataLines = [];
    eventName = '';
  };

  const line = (raw: string) => {
    if (raw === '') return dispatch();
    if (raw.startsWith(':')) return; // comment / keep-alive
    const colon = raw.indexOf(':');
    const field = colon < 0 ? raw : raw.slice(0, colon);
    let value = colon < 0 ? '' : raw.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') eventName = value;
    else if (field === 'id') lastId = value;
    // "retry" and unknown fields are ignored
  };

  const drain = () => {
    for (;;) {
      const m = /\r\n|\r|\n/.exec(buffer);
      if (!m) return;
      // A lone \r at the very end may be the first half of \r\n: wait for more input.
      if (m[0] === '\r' && m.index === buffer.length - 1) return;
      line(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
    }
  };

  return {
    feed(chunk: string | Uint8Array) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      drain();
    },
    /** Flushes a final event that was not followed by a blank line. */
    end() {
      buffer += decoder.decode();
      if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1) + '\n';
      drain();
      if (buffer) {
        line(buffer);
        buffer = '';
      }
      dispatch();
    },
  };
};
