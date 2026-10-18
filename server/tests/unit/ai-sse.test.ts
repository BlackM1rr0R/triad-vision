import { describe, expect, it } from 'vitest';
import { createSseParser, type SseEvent } from '../../src/lib/ai/sse.js';

const collect = () => {
  const events: SseEvent[] = [];
  const p = createSseParser((e) => events.push(e));
  return { events, p };
};

describe('SSE parser', () => {
  it('parses data events and ignores comments', () => {
    const { events, p } = collect();
    p.feed(': OPENROUTER PROCESSING\n\ndata: {"a":1}\n\ndata: [DONE]\n\n');
    expect(events).toEqual([
      { event: 'message', data: '{"a":1}' },
      { event: 'message', data: '[DONE]' },
    ]);
  });

  it('handles chunks split anywhere, including inside a line and between \\r and \\n', () => {
    const { events, p } = collect();
    const text = 'event: delta\r\ndata: {"text":"Sa"}\r\n\r\ndata: {"text":"lam"}\r\n\r\n';
    for (const ch of text) p.feed(ch);
    p.end();
    expect(events).toEqual([
      { event: 'delta', data: '{"text":"Sa"}' },
      { event: 'message', data: '{"text":"lam"}' },
    ]);
  });

  it('joins multi-line data, keeps ids, strips one leading space only', () => {
    const { events, p } = collect();
    p.feed('id: 7\ndata:  two spaces\ndata:line2\n\n');
    expect(events).toEqual([{ event: 'message', data: ' two spaces\nline2', id: '7' }]);
  });

  it('decodes UTF-8 split across byte chunks and flushes a trailing event on end()', () => {
    const { events, p } = collect();
    const bytes = new TextEncoder().encode('data: Şəhər – Привет');
    p.feed(bytes.slice(0, 8));
    p.feed(bytes.slice(8, 9));
    p.feed(bytes.slice(9));
    expect(events).toHaveLength(0);
    p.end();
    expect(events).toEqual([{ event: 'message', data: 'Şəhər – Привет' }]);
  });

  it('does not dispatch events without data', () => {
    const { events, p } = collect();
    p.feed('event: ping\n\nretry: 100\n\n');
    expect(events).toHaveLength(0);
  });
});
