/**
 * Incremental Server-Sent Events parser (pure; no I/O). Feed it decoded text chunks as they arrive
 * from a streaming response and it returns the events that became complete with that chunk.
 *
 * Implements the relevant parts of the WHATWG EventSource spec: `event:`, `data:` (multi-line,
 * joined with "\n"), `id:`, `retry:`; comment lines (`: ping`) are ignored; "\r\n", "\n" and "\r"
 * all end a line; an empty line dispatches the pending event. An event without any `data` line is
 * dropped, as the spec requires.
 */
export interface SseEvent {
  /** `event:` field, or 'message' when the server did not set one. */
  type: string;
  data: string;
  /** Last `id:` seen (sticky across events, like EventSource.lastEventId). */
  lastEventId: string;
  /** `retry:` field of this event in milliseconds, when present and numeric. */
  retry?: number;
}

export class SseParser {
  private buffer = '';
  private type = '';
  private data: string[] = [];
  private hasData = false;
  private lastEventId = '';
  private retry: number | undefined;

  /** Feeds one chunk of text; returns every event completed by it (possibly none). */
  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    // Keep the (possibly incomplete) last line in the buffer.
    let start = 0;
    for (;;) {
      const nl = this.buffer.indexOf('\n', start);
      const cr = this.buffer.indexOf('\r', start);
      let end: number;
      let skip: number;
      if (nl === -1 && cr === -1) break;
      if (cr !== -1 && (nl === -1 || cr < nl)) {
        // "\r" alone or "\r\n": a trailing "\r" at the very end may be half of "\r\n" — wait for more.
        if (cr === this.buffer.length - 1) break;
        end = cr;
        skip = this.buffer[cr + 1] === '\n' ? 2 : 1;
      } else {
        end = nl;
        skip = 1;
      }
      const line = this.buffer.slice(start, end);
      start = end + skip;
      const ev = this.line(line);
      if (ev) events.push(ev);
    }
    this.buffer = this.buffer.slice(start);
    return events;
  }

  /** Forgets any half-received event (call when the connection drops). */
  reset() {
    this.buffer = '';
    this.type = '';
    this.data = [];
    this.hasData = false;
    this.retry = undefined;
  }

  private line(line: string): SseEvent | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'event':
        this.type = value;
        break;
      case 'data':
        this.data.push(value);
        this.hasData = true;
        break;
      case 'id':
        // A NUL in the id makes it invalid (spec); ignore it then.
        if (!value.includes('\0')) this.lastEventId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
      default:
        // unknown field: ignored
        break;
    }
    return null;
  }

  private dispatch(): SseEvent | null {
    const hadData = this.hasData;
    const ev: SseEvent | null = hadData
      ? { type: this.type || 'message', data: this.data.join('\n'), lastEventId: this.lastEventId, ...(this.retry !== undefined ? { retry: this.retry } : {}) }
      : null;
    this.type = '';
    this.data = [];
    this.hasData = false;
    this.retry = undefined;
    return ev;
  }
}

/** Parses the JSON payload of an event; null when it is not a JSON object. */
export const sseJson = (ev: SseEvent): Record<string, unknown> | null => {
  try {
    const v: unknown = JSON.parse(ev.data);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
