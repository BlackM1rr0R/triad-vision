import { describe, expect, it, vi } from 'vitest';
import type { CaseStatus, DocStage, DocStatus } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { awaitsReplacement, clientUploadStageFor } = await import('../../src/lib/clientUploadTarget.js');

const req = (stage: DocStage, ...statuses: DocStatus[]) => ({ stage, documents: statuses.map((status) => ({ status })) });

describe('clientUploadStageFor (re-upload in place of a rejected document)', () => {
  it('open upload step: the stage of the step, not a replacement', () => {
    expect(clientUploadStageFor('DOCUMENTS_PENDING', req('INITIAL'))).toEqual({ stage: 'INITIAL', replacement: false });
    expect(clientUploadStageFor('EMBASSY_DOCUMENTS', req('EMBASSY', 'PENDING'))).toEqual({ stage: 'EMBASSY', replacement: false });
  });

  it('after hand-in: only requirements whose files were all rejected', () => {
    expect(clientUploadStageFor('DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED'))).toEqual({ stage: 'INITIAL', replacement: true });
    expect(clientUploadStageFor('EMBASSY_REVIEW', req('EMBASSY', 'REJECTED', 'REJECTED'))).toEqual({ stage: 'EMBASSY', replacement: true });
    expect(clientUploadStageFor('EMBASSY_DOCUMENTS', req('INITIAL', 'REJECTED'))).toEqual({ stage: 'INITIAL', replacement: true });
    expect(clientUploadStageFor('DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED', 'PENDING'))).toBeNull();
    expect(clientUploadStageFor('DOCUMENTS_REVIEW', req('INITIAL', 'ACCEPTED'))).toBeNull();
    expect(clientUploadStageFor('DOCUMENTS_REVIEW', req('INITIAL'))).toBeNull();
    expect(clientUploadStageFor('EMBASSY_DOCUMENTS', req('INITIAL'))).toBeNull();
  });

  it('never for closed cases or non-upload stages', () => {
    for (const s of ['APPROVED', 'REJECTED', 'CANCELLED'] as CaseStatus[]) expect(clientUploadStageFor(s, req('INITIAL', 'REJECTED'))).toBeNull();
    expect(clientUploadStageFor('DOCUMENTS_REVIEW', req('CONTRACT', 'REJECTED'))).toBeNull();
  });

  it('awaitsReplacement', () => {
    expect(awaitsReplacement([])).toBe(false);
    expect(awaitsReplacement([{ status: 'REJECTED' }])).toBe(true);
    expect(awaitsReplacement([{ status: 'REJECTED' }, { status: 'ACCEPTED' }])).toBe(false);
  });

  it('the portal mirrors the same rule (client/src/lib/docReplace.ts)', async () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/docReplace.ts');
    if (!fs.existsSync(file)) return; // server-only checkout
    const { clientUploadMode } = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      clientUploadMode: (status: string, r: { stage: string; documents: { status: string }[] }) => 'open' | 'replace' | null;
    };
    const cases: [CaseStatus, ReturnType<typeof req>][] = [
      ['DOCUMENTS_PENDING', req('INITIAL')],
      ['DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED')],
      ['DOCUMENTS_REVIEW', req('INITIAL', 'PENDING')],
      ['EMBASSY_REVIEW', req('EMBASSY', 'REJECTED')],
      ['CONTRACT_SENT', req('INITIAL', 'REJECTED')],
      ['CANCELLED', req('INITIAL', 'REJECTED')],
      ['EMBASSY_DOCUMENTS', req('INITIAL', 'ACCEPTED')],
    ];
    for (const [status, r] of cases) {
      const server = clientUploadStageFor(status, r);
      expect(clientUploadMode(status, r), `${status} ${JSON.stringify(r)}`).toBe(server ? (server.replacement ? 'replace' : 'open') : null);
    }
  });
});

const { computeBall } = await import('../../src/lib/clientProcess/ballInCourt.js');
const { DEFAULT_ETA } = await import('../../src/lib/clientProcess/settings.js');

describe('ball in court: replacing a rejected document after hand-in', () => {
  const settings = { eta: DEFAULT_ETA, useCategoryProcessing: true };
  const now = new Date('2026-11-20T09:00:00Z');
  const facts = (status: CaseStatus, replaceReqs: number, uploadReqs: { docs: string[] }[] = []) => ({
    id: 'c1',
    status,
    createdAt: new Date(now.getTime() - 10 * 86_400_000),
    appointmentAt: null,
    processing: { min: null, max: null },
    contract: null,
    uploadReqs,
    replaceReqs,
    pendingDocs: 1,
    tasks: [],
    pendingSignatures: 0,
    lastClientMsg: null,
    lastStaffMsg: null,
    statusEvents: [],
  });

  it('DOCUMENTS_REVIEW / EMBASSY_REVIEW: the team keeps the ball, the client gets a FIX_DOCS item', () => {
    for (const s of ['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'] as CaseStatus[]) {
      const b = computeBall(facts(s, 2), settings, now);
      expect(b.side).toBe('TEAM');
      expect(b.items.find((i) => i.side === 'CLIENT')).toMatchObject({ reason: 'FIX_DOCS', count: 2 });
    }
    expect(computeBall(facts('DOCUMENTS_REVIEW', 0), settings, now).items.some((i) => i.reason === 'FIX_DOCS')).toBe(false);
  });

  it('open step: rejected documents of the step and of an earlier stage add up; closed cases have none', () => {
    const b = computeBall(facts('EMBASSY_DOCUMENTS', 1, [{ docs: ['REJECTED'] }, { docs: ['PENDING'] }]), settings, now);
    expect(b.items.find((i) => i.reason === 'FIX_DOCS')?.count).toBe(2);
    expect(computeBall(facts('CANCELLED', 3), settings, now).items).toEqual([]);
  });
});
