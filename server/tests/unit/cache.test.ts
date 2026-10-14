import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cached, clearCache } from '../../src/lib/cache.js';

const TTL = 5 * 60 * 1000;

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('cached', () => {
  it('calls the loader on a miss and serves hits from memory', async () => {
    const load = vi.fn().mockResolvedValue({ v: 1 });
    expect(await cached('k', load)).toEqual({ v: 1 });
    expect(await cached('k', load)).toEqual({ v: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps keys independent', async () => {
    const a = vi.fn().mockResolvedValue('a');
    const b = vi.fn().mockResolvedValue('b');
    expect(await cached('a', a)).toBe('a');
    expect(await cached('b', b)).toBe('b');
    expect(await cached('a', a)).toBe('a');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('expires entries after the 5 minute TTL', async () => {
    const load = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    expect(await cached('k', load)).toBe('old');
    vi.advanceTimersByTime(TTL - 1);
    expect(await cached('k', load)).toBe('old');
    vi.advanceTimersByTime(1);
    expect(await cached('k', load)).toBe('new');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent misses into one load', async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const p1 = cached('k', load);
    const p2 = cached('k', load);
    const p3 = cached('k', load);
    expect(load).toHaveBeenCalledTimes(1);
    resolve('value');
    expect(await Promise.all([p1, p2, p3])).toEqual(['value', 'value', 'value']);
    expect(await cached('k', load)).toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures and retries on the next call', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce('ok');
    await expect(cached('k', load)).rejects.toThrow('db down');
    expect(await cached('k', load)).toBe('ok');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('concurrent callers all see the failure', async () => {
    let reject!: (e: Error) => void;
    const load = vi.fn(() => new Promise<string>((_r, j) => (reject = j)));
    const p1 = cached('k', load);
    const p2 = cached('k', load);
    reject(new Error('boom'));
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('clearCache', () => {
  it('forces the next call to reload every key', async () => {
    const a = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const b = vi.fn().mockResolvedValueOnce('x').mockResolvedValueOnce('y');
    await cached('a', a);
    await cached('b', b);
    clearCache();
    expect(await cached('a', a)).toBe(2);
    expect(await cached('b', b)).toBe('y');
  });
});
