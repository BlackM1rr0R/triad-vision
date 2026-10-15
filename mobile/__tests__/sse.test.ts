import { SseParser, sseJson } from '@/lib/sse';

describe('SseParser', () => {
  it('parses a complete event with id, event and data', () => {
    const p = new SseParser();
    const events = p.feed('id: 1\nevent: message.new\ndata: {"caseId":"c1"}\n\n');
    expect(events).toEqual([{ type: 'message.new', data: '{"caseId":"c1"}', lastEventId: '1' }]);
  });

  it('handles chunks split anywhere, including inside a line', () => {
    const p = new SseParser();
    expect(p.feed('id: 7\nev')).toEqual([]);
    expect(p.feed('ent: typing\nda')).toEqual([]);
    expect(p.feed('ta: {"a":1}\n')).toEqual([]);
    const events = p.feed('\n');
    expect(events).toEqual([{ type: 'typing', data: '{"a":1}', lastEventId: '7' }]);
  });

  it('ignores comments (heartbeats) and the retry preamble', () => {
    const p = new SseParser();
    expect(p.feed('retry: 3000\n: connected 2026-10-15T00:00:00Z\n\n')).toEqual([]);
    expect(p.feed(': ping 123\n\n')).toEqual([]);
    expect(p.feed('event: notification\ndata: {}\n\n')).toEqual([{ type: 'notification', data: '{}', lastEventId: '' }]);
  });

  it('exposes retry on the event that carries it', () => {
    const p = new SseParser();
    expect(p.feed('retry: 5000\ndata: x\n\n')[0]).toMatchObject({ retry: 5000, data: 'x' });
  });

  it('joins multi-line data with newlines and defaults the type to message', () => {
    const p = new SseParser();
    expect(p.feed('data: line1\ndata: line2\n\n')).toEqual([{ type: 'message', data: 'line1\nline2', lastEventId: '' }]);
  });

  it('accepts \\r\\n and lone \\r line endings, also when \\r\\n is split across chunks', () => {
    const p = new SseParser();
    expect(p.feed('event: a\r\ndata: 1\r\n\r')).toEqual([]);
    expect(p.feed('\nevent: b\rdata: 2\r\r')).toEqual([{ type: 'a', data: '1', lastEventId: '' }]);
    expect(p.feed('\n')).toEqual([{ type: 'b', data: '2', lastEventId: '' }]);
  });

  it('keeps the last event id across events and drops events without data', () => {
    const p = new SseParser();
    const events = p.feed('id: 3\nevent: x\ndata: 1\n\nevent: nothing\n\ndata: 2\n\n');
    expect(events.map((e) => [e.type, e.lastEventId])).toEqual([
      ['x', '3'],
      ['message', '3'],
    ]);
  });

  it('strips exactly one leading space from values and keeps data with colons', () => {
    const p = new SseParser();
    expect(p.feed('data:  two spaces\n\n')[0].data).toBe(' two spaces');
    expect(p.feed('data: a:b:c\n\n')[0].data).toBe('a:b:c');
    expect(p.feed('data\n\n')[0].data).toBe('');
  });

  it('reset() forgets a half-received event', () => {
    const p = new SseParser();
    p.feed('event: partial\ndata: 1');
    p.reset();
    expect(p.feed('\n\n')).toEqual([]);
  });
});

describe('sseJson', () => {
  it('returns the object payload or null', () => {
    expect(sseJson({ type: 'x', data: '{"caseId":"c"}', lastEventId: '' })).toEqual({ caseId: 'c' });
    expect(sseJson({ type: 'x', data: '[1]', lastEventId: '' })).toBeNull();
    expect(sseJson({ type: 'x', data: 'not json', lastEventId: '' })).toBeNull();
  });
});
