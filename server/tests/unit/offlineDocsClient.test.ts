import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Offline documents index (client/src/lib/offlineDocs.ts): saves running at the same time must not overwrite each
 * other's index entry (every index read-modify-write is serialized and re-reads the index). Cache Storage and
 * fetch are replaced by in-memory fakes. Loaded by URL so the server type-check does not pull client sources in.
 */

interface OfflineDocsModule {
  saveDocOffline: (
    doc: { id: string; caseId: string; originalName: string; mimeType: string; size: number },
    meta: { caseNumber: string | null; title: string | null },
    who: { userId: string; holder: string; lang: string; labels: Record<string, string> },
  ) => Promise<string | null>;
  removeDocOffline: (id: string) => Promise<void>;
  saveAppointmentOffline: (cases: unknown[], who: { userId: string; holder: string; lang: string; labels: Record<string, string> }) => Promise<string | null>;
  readIndex: () => Promise<{ docs: { id: string }[]; appointment: unknown } | null>;
}

const store = new Map<string, Response>();
const cache = {
  match: async (url: string) => store.get(url)?.clone(),
  put: async (url: string, res: Response) => {
    // A little latency, so concurrent saves really interleave.
    await new Promise((r) => setTimeout(r, Math.random() * 10));
    store.set(url, res);
  },
  delete: async (url: string) => store.delete(url),
};
const g = globalThis as unknown as Record<string, unknown>;

let m: OfflineDocsModule;
beforeAll(async () => {
  g.caches = { open: async () => cache, delete: async () => (store.clear(), true) };
  g.window = { caches: g.caches, isSecureContext: true };
  g.fetch = async () => {
    await new Promise((r) => setTimeout(r, Math.random() * 20));
    return new Response(new Blob([new Uint8Array(100)]), { status: 200 });
  };
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/lib/offlineDocs.ts');
  m = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as OfflineDocsModule;
});

const who = { userId: 'u1', holder: 'Aysel', lang: 'az', labels: {} };
const doc = (id: string) => ({ id, caseId: 'c1', originalName: `${id}.pdf`, mimeType: 'application/pdf', size: 100 });

describe('offline documents index', () => {
  it('keeps every document when several are saved at once', async () => {
    const ids = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'];
    const results = await Promise.all([...ids.map((id) => m.saveDocOffline(doc(id), { caseNumber: 'TV-1', title: null }, who)), m.saveAppointmentOffline([], who)]);
    expect(results.every((r) => r === null)).toBe(true);
    const idx = await m.readIndex();
    expect(idx!.docs.map((d) => d.id).sort()).toEqual(ids);
    expect(idx!.appointment).not.toBeNull();
  });

  it('removing and saving at the same time leaves a consistent index', async () => {
    await Promise.all([m.removeDocOffline('d1'), m.saveDocOffline(doc('d7'), { caseNumber: null, title: null }, who), m.removeDocOffline('d2')]);
    const idx = await m.readIndex();
    expect(idx!.docs.map((d) => d.id).sort()).toEqual(['d3', 'd4', 'd5', 'd6', 'd7']);
  });
});
