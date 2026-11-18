import { describe, expect, it, vi } from 'vitest';
import type { CaseStatus, DocStage, DocStatus } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EARLY_EMBASSY_STATUSES, earlyEmbassyOpen, initialDocsAccepted } from '../../src/lib/earlyEmbassy/rules.js';
import { waitingForContract, requirementStatus } from '../../src/lib/docProgress/build.js';

vi.mock('../../src/db.js', () => ({ prisma: {} }));

const { clientUploadStageFor } = await import('../../src/lib/clientUploadTarget.js');

const initial = (required: boolean, ...statuses: DocStatus[]) => ({ required, documents: statuses.map((status) => ({ status })) });
const req = (stage: DocStage, ...statuses: DocStatus[]) => ({ stage, documents: statuses.map((status) => ({ status })) });

describe('early embassy documents: rules', () => {
  it('waiting for the contract = CONTRACT_SENT / CONTRACT_SIGNED, or DOCUMENTS_REVIEW with every required initial document accepted', () => {
    expect(earlyEmbassyOpen('CONTRACT_SENT', [])).toBe(true);
    expect(earlyEmbassyOpen('CONTRACT_SIGNED', [])).toBe(true);
    expect(earlyEmbassyOpen('DOCUMENTS_REVIEW', [initial(true, 'ACCEPTED'), initial(false)])).toBe(true);
    expect(earlyEmbassyOpen('DOCUMENTS_REVIEW', [initial(true, 'ACCEPTED'), initial(true, 'PENDING')])).toBe(false);
    expect(earlyEmbassyOpen('DOCUMENTS_REVIEW', [initial(true, 'REJECTED', 'ACCEPTED')])).toBe(true);
    expect(earlyEmbassyOpen('DOCUMENTS_REVIEW', [initial(false, 'ACCEPTED')])).toBe(false); // no required document at all
    for (const s of ['DOCUMENTS_PENDING', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPROVED', 'CANCELLED'] as CaseStatus[]) {
      expect(earlyEmbassyOpen(s, [initial(true, 'ACCEPTED')])).toBe(false);
    }
    expect(initialDocsAccepted([])).toBe(false);
    expect(EARLY_EMBASSY_STATUSES).toEqual(['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED']);
  });

  it('is the same state the process overview calls "waiting for the work contract"', () => {
    const lists = [[initial(true, 'ACCEPTED')], [initial(true, 'PENDING')], [initial(true, 'ACCEPTED'), initial(false)], [initial(false, 'ACCEPTED')], []];
    for (const s of ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS'] as CaseStatus[]) {
      for (const list of lists) {
        const items = list.map((r) => ({ required: r.required, status: requirementStatus(r.documents) }));
        expect(earlyEmbassyOpen(s, list), `${s} ${JSON.stringify(list)}`).toBe(waitingForContract(s, items));
      }
    }
  });
});

describe('clientUploadStageFor with early embassy uploads', () => {
  it('EMBASSY requirements are uploadable in the waiting state (not a replacement, flagged early)', () => {
    for (const s of ['DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED'] as CaseStatus[]) {
      expect(clientUploadStageFor(s, req('EMBASSY'), { earlyEmbassy: true })).toEqual({ stage: 'EMBASSY', replacement: false, early: true });
      expect(clientUploadStageFor(s, req('EMBASSY'))).toBeNull();
    }
  });

  it('only EMBASSY, only in the waiting statuses; the open step and replacements are unchanged', () => {
    expect(clientUploadStageFor('CONTRACT_SENT', req('INITIAL'), { earlyEmbassy: true })).toBeNull();
    expect(clientUploadStageFor('DOCUMENTS_PENDING', req('EMBASSY'), { earlyEmbassy: true })).toBeNull();
    expect(clientUploadStageFor('EMBASSY_REVIEW', req('EMBASSY'), { earlyEmbassy: true })).toBeNull();
    expect(clientUploadStageFor('CANCELLED', req('EMBASSY'), { earlyEmbassy: true })).toBeNull();
    expect(clientUploadStageFor('EMBASSY_DOCUMENTS', req('EMBASSY'), { earlyEmbassy: true })).toEqual({ stage: 'EMBASSY', replacement: false });
    expect(clientUploadStageFor('CONTRACT_SENT', req('INITIAL', 'REJECTED'), { earlyEmbassy: true })).toEqual({ stage: 'INITIAL', replacement: true });
  });

  it('the portal mirrors the rule (client/src/lib/docReplace.ts)', async () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/docReplace.ts');
    if (!fs.existsSync(file)) return; // server-only checkout
    const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      clientUploadMode: (status: string, r: { stage: string; documents: { status: string }[] }, ctx?: { earlyEmbassy?: boolean }) => string | null;
      embassyUploadsEarly: (status: string, reqs: { stage: string; required?: boolean; documents: { status: string }[] }[]) => boolean;
    };
    const statuses: CaseStatus[] = ['DOCUMENTS_PENDING', 'DOCUMENTS_REVIEW', 'CONTRACT_SENT', 'CONTRACT_SIGNED', 'EMBASSY_DOCUMENTS', 'EMBASSY_REVIEW', 'APPROVED'];
    const lists = [[initial(true, 'ACCEPTED')], [initial(true, 'PENDING')], [initial(false, 'ACCEPTED')]];
    for (const s of statuses) {
      for (const list of lists) {
        const early = earlyEmbassyOpen(s, list);
        expect(mod.embassyUploadsEarly(s, list.map((r) => ({ ...r, stage: 'INITIAL' })))).toBe(early);
        for (const r of [req('EMBASSY'), req('EMBASSY', 'REJECTED'), req('INITIAL')]) {
          const server = clientUploadStageFor(s, r, { earlyEmbassy: early });
          const expected = server ? (server.early ? 'early' : server.replacement ? 'replace' : 'open') : null;
          expect(mod.clientUploadMode(s, r, { earlyEmbassy: early }), `${s} ${JSON.stringify(r)}`).toBe(expected);
        }
      }
    }
  });
});
