import { describe, expect, it } from 'vitest';
import { estimateTokens, repairToolPairs, trimHistory, type ChatMessage } from '../../src/lib/ai/context.js';
import { reasoningFor } from '../../src/lib/ai/openrouter.js';

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });
const call = (id: string): ChatMessage => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: 'my_cases', arguments: '{}' } }] });
const res = (id: string): ChatMessage => ({ role: 'tool', tool_call_id: id, content: '{"ok":true}' });

describe('context trimming', () => {
  it('keeps everything when under the limits', () => {
    const h = [u('a'), a('b'), u('c')];
    expect(trimHistory(h)).toMatchObject({ messages: h, omitted: 0 });
  });

  it('keeps at most maxMessages and starts at a user message', () => {
    const h: ChatMessage[] = [];
    for (let i = 0; i < 30; i++) h.push(u(`q${i}`), a(`a${i}`));
    const r = trimHistory(h, { maxMessages: 20 });
    expect(r.messages.length).toBeLessThanOrEqual(20);
    expect(r.messages[0].role).toBe('user');
    expect(r.messages.at(-1)).toEqual(a('a29'));
    expect(r.omitted).toBe(h.length - r.messages.length);
  });

  it('respects the token budget', () => {
    const big = 'x'.repeat(3500 * 2); // ~2000 tokens each
    const h = [u(big), a(big), u(big), a(big), u('last question')];
    const r = trimHistory(h, { maxTokens: 4500 });
    expect(r.tokens).toBeLessThanOrEqual(4500);
    expect(r.messages.at(-1)).toEqual(u('last question'));
    expect(r.messages[0].role).toBe('user');
  });

  it('never splits a tool call from its results', () => {
    const h = [u('q1'), call('c1'), res('c1'), a('answer'), u('q2'), call('c2'), res('c2'), a('answer2')];
    const r = trimHistory(h, { maxMessages: 3 });
    // A window of 3 would begin at a tool result; it moves forward to the next user message instead.
    expect(r.messages[0]).toEqual(u('q2'));
    expect(r.messages).toContainEqual(res('c2'));
  });

  it('always keeps the newest user message even when it alone is over budget', () => {
    const r = trimHistory([u('old'), a('x'), u('y'.repeat(100_000))], { maxTokens: 100 });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].role).toBe('user');
  });

  it('estimates tokens roughly', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(35))).toBe(10);
  });
});

describe('tool pair repair', () => {
  it('adds a placeholder result for an interrupted call and drops orphaned results', () => {
    const out = repairToolPairs([u('q'), res('orphan'), call('c1'), a('next')]);
    expect(out).toEqual([u('q'), call('c1'), { role: 'tool', tool_call_id: 'c1', content: '{"error":"not_executed"}' }, a('next')]);
  });
});

describe('reasoning settings', () => {
  it('turns reasoning off where allowed and gives mandatory reasoning the minimum budget', () => {
    expect(reasoningFor({ id: 'h', name: 'h', contextLength: 1, promptPerM: 1, completionPerM: 1, reasoning: { mandatory: false, efforts: ['low', 'none'] } }, 600)).toEqual({ reasoning: { effort: 'none' }, max_tokens: 600 });
    expect(reasoningFor({ id: 's', name: 's', contextLength: 1, promptPerM: 1, completionPerM: 1, reasoning: { mandatory: true, efforts: ['low'] } }, 1500)).toEqual({ reasoning: { max_tokens: 1024, exclude: true }, max_tokens: 2524 });
    expect(reasoningFor({ id: 'n', name: 'n', contextLength: 1, promptPerM: 1, completionPerM: 1, reasoning: null }, 600)).toEqual({ max_tokens: 600 });
    expect(reasoningFor(undefined, 600)).toEqual({ reasoning: { max_tokens: 1024, exclude: true }, max_tokens: 1624 });
  });
});
