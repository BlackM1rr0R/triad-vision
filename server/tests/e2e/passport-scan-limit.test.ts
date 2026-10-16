import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/docsIntel/ocr.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/docsIntel/ocr.js')>()),
  langDataAvailable: () => true,
  getWorker: async () => ({ recognize: async () => ({ data: { text: 'nothing', confidence: 0 } }) }),
}));

import { anon } from '../helpers/api';
import { fakePng } from './passport-scan.fixtures';

// Own file: the scan limiter (10 per 10 minutes per IP) lives in this file's app instance.
describe('POST /api/auth/passport-scan rate limit', () => {
  it('allows 10 scans per 10 minutes per IP, then answers 429', async () => {
    const send = () => anon().post('/api/auth/passport-scan').attach('image', fakePng(), { filename: 'p.png', contentType: 'image/png' });
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(422);
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('TOO_MANY_REQUESTS');
  });
});
