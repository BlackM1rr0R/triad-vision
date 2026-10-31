import { afterEach, describe, expect, it, vi } from 'vitest';
import { anon, asClient, type Agent } from '../helpers/api';
import { prisma } from '../helpers/db';
import { makePdf, PNG_BUFFER } from '../helpers/files';
import { expectStatus } from '../helpers/workflow';
import { docCheckDeps } from '../../src/lib/docCheck/index.js';

// POST /api/vault/precheck: the client portal's pre-upload check of a passport / ID photo (MRZ expiry), storing nothing.

const original = { ...docCheckDeps };
afterEach(() => Object.assign(docCheckDeps, original));

/** PNG with a real IHDR of the given size (enough for header-based checks). */
const pngOf = (w: number, h: number) => {
  const b = Buffer.from(PNG_BUFFER);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

const scanWithExpiry = (expiryDate: string) =>
  vi.fn().mockResolvedValue({
    ok: true,
    fields: { firstName: 'Leyla', lastName: 'Huseynova', birthDate: '1995-03-02', passportNumber: 'C07654321', nationality: 'AZE', sex: 'F', expiryDate },
    checks: { valid: true, documentNumber: true, birthDate: true, expiryDate: true, composite: true },
    warnings: [],
  });

const precheck = (agent: Agent, fields: Record<string, string>, file: Buffer = pngOf(1800, 1200), name = 'pass.png', contentType = 'image/png') => {
  const req = agent.post('/api/vault/precheck');
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return req.attach('file', file, { filename: name, contentType });
};

describe('POST /api/vault/precheck', () => {
  it('needs a session', async () => {
    expect((await anon().post('/api/vault/precheck')).status).toBe(401);
  });

  it('reports an expired passport (case requirement key) without storing anything or returning personal data', async () => {
    const { agent } = await asClient();
    docCheckDeps.ocrAvailable = () => true;
    docCheckDeps.scan = scanWithExpiry('2020-01-31');
    const res = expectStatus(await precheck(agent, { requirementKey: 'PASSPORT' }), 200);
    expect(res.body.target).toBe('PASSPORT');
    expect(res.body.checks.issues).toEqual([expect.objectContaining({ code: 'PASSPORT_EXPIRED', level: 'error', params: { expiryDate: '2020-01-31' } })]);
    expect(JSON.stringify(res.body)).not.toContain('C07654321');
    expect(res.body.checks.pending).toBeUndefined();
    expect(await prisma.vaultDocument.count()).toBe(0);
    expect(await prisma.document.count()).toBe(0);
  });

  it('a passport valid for less than 6 months is reported (vault kind)', async () => {
    const { agent } = await asClient();
    docCheckDeps.ocrAvailable = () => true;
    const soon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    docCheckDeps.scan = scanWithExpiry(soon);
    const res = expectStatus(await precheck(agent, { kind: 'PASSPORT' }), 200);
    expect(res.body.checks.issues).toEqual([expect.objectContaining({ code: 'PASSPORT_EXPIRES_SOON', level: 'error' })]);
  });

  it('no MRZ check for other documents; an OCR timeout is not reported as pending', async () => {
    const { agent } = await asClient();
    docCheckDeps.ocrAvailable = () => true;
    docCheckDeps.scan = vi.fn().mockResolvedValue({ ok: false, error: 'OCR_TIMEOUT' });
    const other = expectStatus(await precheck(agent, { requirementKey: 'DIPLOMA' }), 200);
    expect(other.body.checks.issues).toEqual([]);
    expect(docCheckDeps.scan).not.toHaveBeenCalled();
    const timeout = expectStatus(await precheck(agent, { requirementKey: 'PASSPORT' }), 200);
    expect(timeout.body.checks).toMatchObject({ level: 'ok', issues: [] });
    expect(timeout.body.checks.pending).toBeUndefined();
  });

  it('images only, checked by their bytes', async () => {
    const { agent } = await asClient();
    expect((await precheck(agent, { kind: 'PASSPORT' }, await makePdf('x'), 'x.pdf', 'application/pdf')).status).toBe(400);
    expect((await precheck(agent, { kind: 'PASSPORT' }, Buffer.from('not an image at all'), 'fake.png', 'image/png')).status).toBe(400);
    expect((await agent.post('/api/vault/precheck').field('kind', 'PASSPORT')).status).toBe(400);
  });
});
