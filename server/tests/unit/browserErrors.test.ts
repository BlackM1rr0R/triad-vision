import { describe, expect, it } from 'vitest';
import { fingerprint, isNoise, sanitizeMessage, sanitizeRoute, scrubText, topFrame, trimStack } from '../../src/lib/browserErrors/sanitize.js';

describe('browser errors: sanitise', () => {
  it('keeps only the path and the allowlisted query parameters, replaces ids, drops the hash', () => {
    expect(sanitizeRoute('https://triad-vision.de/status?token=abc123&tab=docs#k=SECRETSECRETSECRETSECRET')).toBe('/status?tab=docs');
    expect(sanitizeRoute('/admin/cases/ckabc123def456ghi789jkl0/documents?email=a@b.de')).toBe('/admin/cases/:id/documents');
    expect(sanitizeRoute('/de/jobs/a-vacancy?page=2&utm_source=x')).toBe('/de/jobs/a-vacancy?page=2');
    expect(sanitizeRoute('/users/max@example.com/profile')).toBe('/users/:email/profile');
    expect(sanitizeRoute('')).toBe('/');
  });

  it('removes e-mail addresses, tokens and secret pairs from messages and stacks', () => {
    const m = sanitizeMessage('Failed for max.mustermann@example.com with token=abcdef1234 at https://x.de/a?session=SECRET&b=1');
    expect(m).not.toContain('max.mustermann');
    expect(m).not.toContain('abcdef1234');
    expect(m).not.toContain('SECRET');
    expect(scrubText('Authorization: Bearer abcdefghijklmnop12345')).not.toContain('abcdefghijklmnop');
    expect(scrubText('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc')).toBe('<token>');
  });

  it('trims a stack to 8 frames and removes URL queries', () => {
    const frames = Array.from({ length: 20 }, (_, i) => `    at fn${i} (https://triad-vision.de/assets/index-AbC12xYz.js:1:${i}?x=secret)`);
    const out = trimStack(['TypeError: boom', ...frames].join('\n'));
    expect(out.split('\n')).toHaveLength(9);
    expect(out).not.toContain('secret');
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(trimStack(undefined)).toBe('');
  });
});

describe('browser errors: fingerprint', () => {
  const stackA = 'TypeError: x\n    at render (https://triad-vision.de/assets/index-AbC12xYz.js:1:100)\n    at b (https://triad-vision.de/assets/index-AbC12xYz.js:2:3)';
  const stackB = 'TypeError: x\n    at render (https://triad-vision.de/assets/index-ZzY98aBc.js:7:55)\n    at b (https://triad-vision.de/assets/index-ZzY98aBc.js:2:3)';

  it('is stable across builds and varying numbers / ids, different for other errors', () => {
    expect(topFrame(stackA)).toBe(topFrame(stackB));
    expect(fingerprint('error', 'Cannot read 12 of undefined', stackA)).toBe(fingerprint('error', 'Cannot read 987 of undefined', stackB));
    expect(fingerprint('error', 'Cannot read 12 of undefined', stackA)).not.toBe(fingerprint('react', 'Cannot read 12 of undefined', stackA));
    expect(fingerprint('error', 'Another message', stackA)).not.toBe(fingerprint('error', 'Cannot read 12 of undefined', stackA));
    expect(fingerprint('error', 'm', stackA)).toMatch(/^[0-9a-f]{40}$/);
  });

  it('drops browser noise', () => {
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.', '')).toBe(true);
    expect(isNoise('Script error.', '')).toBe(true);
    expect(isNoise('boom', 'at x (chrome-extension://abc/content.js:1:1)')).toBe(true);
    expect(isNoise('Cannot read properties of undefined', 'at x (https://triad-vision.de/a.js:1:1)')).toBe(false);
  });
});
