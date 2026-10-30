import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CASE_BULK_ACTIONS, commonCaseActions, renderTemplate, reverseOf, runBatched, summarize, toCsv } from '../../src/lib/bulk/index.js';
import { badRequest } from '../../src/lib/http.js';
import { RELEASE_NOTES, cleanParams, normalizeTablePrefs, overridesSchema, tablePrefsSchema, viewInputSchema, whatsNewFeed } from '../../src/lib/staffUi/index.js';

/**
 * Staff power features: bulk helpers and staff UI store (server), and the client's pure helpers
 * (client/src/components/staffPower/pure.ts — selection range, column order, review queue reducer), loaded by URL
 * like the nav registry test (the client has no test runner).
 */

// Local shape of the client module (a type import would pull the client file into tests/tsconfig: TS6059).
type Decision = 'ACCEPTED' | 'REJECTED';
interface QueueState {
  order: string[];
  decided: Record<string, Decision>;
  skipped: string[];
  current: string | null;
}
interface Pure {
  rangeBetween: (ids: string[], from: string, to: string) => string[];
  orderColumns: (defs: { id: string }[], order: string[] | undefined) => string[];
  moveId: (list: string[], id: string, toIndex: number) => string[];
  viewParams: (entries: Iterable<[string, string]>) => Record<string, string>;
  sameParams: (a: Record<string, string>, b: Record<string, string>) => boolean;
  initialQueue: (ids: string[]) => QueueState;
  remaining: (s: QueueState) => string[];
  syncQueue: (s: QueueState, ids: string[]) => QueueState;
  step: (s: QueueState, delta: 1 | -1) => QueueState;
  decide: (s: QueueState, id: string, d: Decision) => QueueState;
  skip: (s: QueueState, id: string) => QueueState;
  undoDecision: (s: QueueState, id: string) => QueueState;
  sessionCounts: (s: QueueState) => { accepted: number; rejected: number; skipped: number };
}
const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src');
let pure: Pure;
beforeAll(async () => {
  pure = (await import(/* @vite-ignore */ pathToFileURL(path.join(clientSrc, 'components/staffPower/pure.ts')).href)) as Pure;
});

describe('bulk: case status transitions valid for the whole selection', () => {
  it('offers only the actions every selected status allows', () => {
    expect(commonCaseActions([])).toEqual([]);
    expect(commonCaseActions(['DOCUMENTS_REVIEW'])).toEqual(['REQUEST_CHANGES', 'CANCEL']);
    expect(commonCaseActions(['DOCUMENTS_REVIEW', 'EMBASSY_REVIEW'])).toEqual(['REQUEST_CHANGES', 'CANCEL']);
    expect(commonCaseActions(['DOCUMENTS_REVIEW', 'CONTRACT_SIGNED'])).toEqual(['CANCEL']);
    expect(commonCaseActions(['CONTRACT_SIGNED', 'CONTRACT_SIGNED'])).toEqual(['CONFIRM_CONTRACT', 'CANCEL']);
    expect(commonCaseActions(['REJECTED', 'CANCELLED'])).toEqual(['REOPEN']);
    // final + open statuses have nothing in common
    expect(commonCaseActions(['APPROVED', 'DOCUMENTS_PENDING'])).toEqual([]);
    expect(commonCaseActions(['APPROVED'])).toEqual([]);
  });

  it('never offers per-case decisions in bulk', () => {
    expect(Object.keys(CASE_BULK_ACTIONS)).not.toContain('DECIDE');
    expect(Object.keys(CASE_BULK_ACTIONS)).not.toContain('SCHEDULE_APPOINTMENT');
  });

  it('knows the safe reverse of a cancellation only', () => {
    expect(reverseOf('CANCEL', 'DOCUMENTS_PENDING')).toEqual({ action: 'REOPEN', to: 'DOCUMENTS_PENDING' });
    expect(reverseOf('CANCEL', 'EMBASSY_DOCUMENTS')).toEqual({ action: 'REOPEN', to: 'EMBASSY_DOCUMENTS' });
    expect(reverseOf('CANCEL', 'CONTRACT_SENT')).toBeNull();
    expect(reverseOf('CONFIRM_CONTRACT', 'CONTRACT_SIGNED')).toBeNull();
  });
});

describe('bulk: runner, templates, CSV', () => {
  it('runs every item in batches and reports per-item failures in order', async () => {
    let concurrent = 0;
    let peak = 0;
    const ids = Array.from({ length: 23 }, (_, i) => `id${i}`);
    const results = await runBatched(
      ids,
      async (id) => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        await new Promise((r) => setTimeout(r, 2));
        concurrent--;
        if (id === 'id3') throw badRequest('INVALID_STAFF');
        if (id === 'id7') throw new Error('boom');
      },
      5,
    );
    expect(results.map((r) => r.id)).toEqual(ids);
    expect(peak).toBeLessThanOrEqual(5);
    expect(results.find((r) => r.id === 'id3')).toEqual({ id: 'id3', ok: false, error: 'INVALID_STAFF' });
    expect(results.find((r) => r.id === 'id7')).toEqual({ id: 'id7', ok: false, error: 'FAILED' });
    expect(summarize(results)).toEqual({ ok: 21, failed: 2 });
  });

  it('fills {{variables}} and blanks unknown ones', () => {
    expect(renderTemplate('Salam {{firstName}}, {{ caseNumber }} hazırdır. — {{staffName}}', { firstName: 'Əli', caseNumber: 'TV-2026-0001', staffName: 'Aysel' })).toBe(
      'Salam Əli, TV-2026-0001 hazırdır. — Aysel',
    );
    expect(renderTemplate('{{firstName}} {{password}} {{lastName}}', { firstName: 'A', lastName: null })).toBe('A  ');
  });

  it('writes Excel-safe CSV (BOM, semicolons, quoting, formula guard)', () => {
    const csv = toCsv(['a', 'b'], [['=HYPERLINK("x")', 'x;y'], [null, new Date('2026-10-30T12:00:00Z')]]);
    expect(csv.startsWith('﻿a;b\r\n')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")";"x;y"`);
    expect(csv).toContain(';2026-10-30');
  });
});

describe('staff UI store', () => {
  it('drops pagination / selection params from a saved view', () => {
    expect(cleanParams({ status: 'DOCUMENTS_REVIEW', page: '3', selected: 'x', sv: 'v1', search: '' , mine: '1' })).toEqual({ status: 'DOCUMENTS_REVIEW', mine: '1' });
  });

  it('validates view input and table prefs', () => {
    expect(viewInputSchema.safeParse({ page: 'cases', name: 'Mənim LKW işlərim — səfirlik', params: { status: 'EMBASSY_REVIEW' } }).success).toBe(true);
    expect(viewInputSchema.safeParse({ page: 'users', name: 'x', params: {} }).success).toBe(false);
    expect(viewInputSchema.safeParse({ page: 'cases', name: ' ', params: {} }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v']));
    expect(viewInputSchema.safeParse({ page: 'cases', name: 'x', params: many }).success).toBe(false);
    expect(tablePrefsSchema.safeParse({ widths: { client: 20 } }).success).toBe(false);
    expect(tablePrefsSchema.safeParse({ order: ['../x'] }).success).toBe(false);
    expect(normalizeTablePrefs({ order: ['a', 'b', 'a'], hidden: ['c', 'c'], widths: { a: 120 } })).toEqual({ order: ['a', 'b'], hidden: ['c'], widths: { a: 120 } });
  });

  it('counts unread release notes and applies overrides', () => {
    const none = overridesSchema.parse({});
    const all = whatsNewFeed(none, null);
    expect(all.items.map((i) => i.id)).toEqual(expect.arrayContaining(RELEASE_NOTES.map((n) => n.id)));
    expect(all.unread).toBe(all.items.length);
    expect(whatsNewFeed(none, all.latest).unread).toBe(0);
    expect(whatsNewFeed(none, all.items[2].id).unread).toBe(2);
    const o = overridesSchema.parse({
      hidden: ['2026-10-undo'],
      extra: [{ id: 'x1', date: '2027-01-02', title: { az: 'a', de: 'd', en: 'e', ru: 'r' }, body: { az: 'a', de: 'd', en: 'e', ru: 'r' } }],
    });
    const feed = whatsNewFeed(o, all.latest);
    expect(feed.items[0].id).toBe('x1');
    expect(feed.items.some((i) => i.id === '2026-10-undo')).toBe(false);
    expect(feed.unread).toBe(1);
  });
});

describe('client pure helpers (components/staffPower/pure.ts)', () => {
  it('selects a Shift + click range in list order', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(pure.rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(pure.rangeBetween(ids, 'e', 'c')).toEqual(['c', 'd', 'e']);
    expect(pure.rangeBetween(ids, 'x', 'c')).toEqual([]);
  });

  it('keeps the saved column order and slots new columns in after their neighbour', () => {
    const defs = [{ id: 'number' }, { id: 'client' }, { id: 'status' }, { id: 'staff' }];
    expect(pure.orderColumns(defs, undefined)).toEqual(['number', 'client', 'status', 'staff']);
    expect(pure.orderColumns(defs, ['staff', 'number', 'client'])).toEqual(['staff', 'number', 'client', 'status']);
    // staff follows status (its default neighbour), client follows number
    expect(pure.orderColumns(defs, ['gone', 'status', 'number'])).toEqual(['status', 'staff', 'number', 'client']);
    expect(pure.moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(pure.moveId(['a', 'b', 'c'], 'a', 9)).toEqual(['b', 'c', 'a']);
  });

  it('compares saved-view params without the transient ones', () => {
    const p = pure.viewParams([['status', 'X'], ['page', '2'], ['sv', 'v1'], ['mine', '1']]);
    expect(p).toEqual({ status: 'X', mine: '1' });
    expect(pure.sameParams(p, { mine: '1', status: 'X' })).toBe(true);
    expect(pure.sameParams(p, { status: 'X' })).toBe(false);
  });

  it('review queue: J / K, decide, skip, undo and the session counts', () => {
    let q = pure.initialQueue(['d1', 'd2', 'd3']);
    expect(q.current).toBe('d1');
    q = pure.step(q, 1);
    expect(q.current).toBe('d2');
    q = pure.step(q, -1);
    q = pure.step(q, -1);
    expect(q.current).toBe('d1'); // stops at the start
    q = pure.decide(q, 'd1', 'ACCEPTED');
    expect(q.current).toBe('d2');
    expect(pure.remaining(q)).toEqual(['d2', 'd3']);
    q = pure.skip(q, 'd2');
    expect(q.current).toBe('d3');
    q = pure.decide(q, 'd3', 'REJECTED');
    expect(q.current).toBe('d2'); // the last one left was skipped earlier
    expect(pure.sessionCounts(q)).toEqual({ accepted: 1, rejected: 1, skipped: 1 });
    q = pure.undoDecision(q, 'd3');
    expect(q.current).toBe('d3');
    expect(pure.remaining(q)).toEqual(['d2', 'd3']);
    q = pure.decide(pure.decide(q, 'd3', 'ACCEPTED'), 'd2', 'ACCEPTED');
    expect(q.current).toBeNull();
    expect(pure.sessionCounts(q)).toEqual({ accepted: 3, rejected: 0, skipped: 0 });
  });

  it('review queue: a refetch keeps local decisions and the current document', () => {
    let q = pure.decide(pure.initialQueue(['d1', 'd2', 'd3']), 'd1', 'ACCEPTED');
    // the server no longer lists d1 (accepted) and has a new upload d4
    q = pure.syncQueue(q, ['d2', 'd3', 'd4']);
    expect(q.current).toBe('d2');
    expect(pure.remaining(q)).toEqual(['d2', 'd3', 'd4']);
    expect(q.decided).toEqual({ d1: 'ACCEPTED' });
    // undo of d1 after the refetch brings it back
    expect(pure.remaining(pure.undoDecision(q, 'd1'))).toContain('d1');
  });
});
