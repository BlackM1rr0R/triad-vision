import { describe, expect, it } from 'vitest';
import { bulkAssignee, newFiles, nextOwner, parseSentFiles, sendBlocker, summarize } from '../../src/lib/clientFolders/logic.js';
import { classifyRoute } from '../../src/lib/access/routeMap.js';
import { READY_DOCS_TEXT } from '../../src/lib/clientFolders/texts.js';

/** Client folder actions of the documents section (lib/clientFolders): pure rules and the route permissions. */

describe('client folders: ownership follows the case partner', () => {
  it('moves ownership only when the client belonged to nobody or to the previous partner', () => {
    expect(nextOwner(null, null, 'p1')).toBe('p1');
    expect(nextOwner('p1', 'p1', 'p2')).toBe('p2');
    expect(nextOwner('p1', 'p1', null)).toBeNull();
    // owned by another partner: stays
    expect(nextOwner('p9', 'p1', 'p2')).toBeUndefined();
    expect(nextOwner('p9', null, 'p2')).toBeUndefined();
    // no change
    expect(nextOwner('p2', 'p1', 'p2')).toBeUndefined();
    expect(nextOwner(null, null, null)).toBeUndefined();
  });
});

describe('client folders: Fertig → client', () => {
  it('blocks sends outside Fertig, without files and a second send without re-send', () => {
    expect(sendBlocker({ stage: 'WRITTEN', fileCount: 2, sentBefore: false, resend: false })).toBe('READY_DOCS_NOT_DONE');
    expect(sendBlocker({ stage: null, fileCount: 2, sentBefore: false, resend: false })).toBe('READY_DOCS_NOT_DONE');
    expect(sendBlocker({ stage: 'DONE', fileCount: 0, sentBefore: false, resend: false })).toBe('READY_DOCS_NO_FILES');
    expect(sendBlocker({ stage: 'DONE', fileCount: 2, sentBefore: true, resend: false })).toBe('READY_DOCS_ALREADY_SENT');
    expect(sendBlocker({ stage: 'DONE', fileCount: 2, sentBefore: true, resend: true })).toBeNull();
    expect(sendBlocker({ stage: 'DONE', fileCount: 1, sentBefore: false, resend: false })).toBeNull();
    // a re-send with nothing new would only re-notify the client
    expect(sendBlocker({ stage: 'DONE', fileCount: 2, sentBefore: true, resend: true, newCount: 0 })).toBe('READY_DOCS_NOTHING_NEW');
    expect(sendBlocker({ stage: 'DONE', fileCount: 2, sentBefore: true, resend: true, newCount: 1 })).toBeNull();
    expect(sendBlocker({ stage: 'DONE', fileCount: 2, sentBefore: false, resend: false, newCount: 2 })).toBeNull();
  });

  it('bulk stage move: nobody chosen keeps the assignee of a case already in the stage', () => {
    expect(bulkAssignee({ from: 'WRITTEN', to: 'WRITTEN', requested: null, current: 'u1' })).toBe('u1');
    expect(bulkAssignee({ from: 'WRITTEN', to: 'WRITTEN', requested: undefined, current: null })).toBeNull();
    expect(bulkAssignee({ from: 'WRITTEN', to: 'WRITTEN', requested: 'u2', current: 'u1' })).toBe('u2');
    expect(bulkAssignee({ from: null, to: 'WRITTEN', requested: null, current: 'u1' })).toBeNull();
    expect(bulkAssignee({ from: 'IN_PROGRESS', to: 'DONE', requested: 'u3', current: 'u1' })).toBe('u3');
  });

  it('sends only files that are new or replaced since (node + version)', () => {
    const files = [
      { nodeId: 'a', version: 1, name: 'A.pdf' },
      { nodeId: 'b', version: 3, name: 'B.pdf' },
      { nodeId: 'c', version: 1, name: 'C.pdf' },
    ];
    const sent = [
      { nodeId: 'a', version: 1, documentId: 'd1' },
      { nodeId: 'b', version: 2, documentId: 'd2' },
    ];
    expect(newFiles(files, sent).map((f) => f.nodeId)).toEqual(['b', 'c']);
    expect(newFiles(files, [])).toHaveLength(3);
  });

  it('reads stored send files defensively', () => {
    expect(parseSentFiles(null)).toEqual([]);
    expect(parseSentFiles([{ nodeId: 'a', version: 2, documentId: 'd', name: 'A.pdf' }, { nodeId: 1 }, 'x', null])).toEqual([{ nodeId: 'a', version: 2, documentId: 'd', name: 'A.pdf' }]);
    expect(parseSentFiles([{ nodeId: 'a', documentId: 'd' }])[0]!.version).toBe(1);
  });

  it('has the client notification in every portal language', () => {
    for (const l of ['az', 'de', 'en', 'ru'] as const) {
      const tx = READY_DOCS_TEXT[l];
      expect(tx.title(1).length).toBeGreaterThan(5);
      expect(tx.title(3)).toContain('3');
      expect(tx.body({ name: 'Ali', number: 'TV-1', count: 2, resend: false })).toContain('TV-1');
      expect(tx.cta.length).toBeGreaterThan(2);
    }
  });
});

describe('client folders: results and permissions', () => {
  it('summarises bulk results', () => {
    expect(
      summarize([
        { caseId: '1', ok: true },
        { caseId: '2', ok: true, skipped: true },
        { caseId: '3', ok: false, error: 'OUT_OF_SCOPE' },
        { caseId: '4', ok: true },
      ]),
    ).toEqual({ total: 4, succeeded: 2, skipped: 1, failed: 1 });
  });

  it('maps the endpoints to partners / cases / documents', () => {
    expect(classifyRoute('POST', '/admin/client-folders/partner')).toEqual({ area: 'partners', action: 'edit' });
    expect(classifyRoute('POST', '/admin/client-folders/processing')).toEqual({ area: 'cases', action: 'edit' });
    expect(classifyRoute('POST', '/admin/client-folders/ready-docs/send')).toEqual({ area: 'documents', action: 'edit' });
    expect(classifyRoute('GET', '/admin/client-folders/cases/ckabc123/ready-docs')).toEqual({ area: 'documents', action: 'view' });
  });
});
