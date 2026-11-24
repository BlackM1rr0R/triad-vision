import { describe, expect, it } from 'vitest';
import { followReview, matchingRequirements, needsDocument, pickSource, requirementDocType, sameDocumentNeeded, shouldLinkInto } from '../../src/lib/docLink/match.js';

const req = (id: string, stage: string, key: string | null) => ({ id, stage, key });
const doc = (id: string, status: 'PENDING' | 'ACCEPTED' | 'REJECTED', linkedFromId: string | null = null, at = '2026-11-01T10:00:00Z') => ({ id, status, linkedFromId, createdAt: new Date(at) });

describe('sameDocumentNeeded', () => {
  it('matches the same key in the initial and the embassy list', () => {
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('b', 'EMBASSY', 'PASSPORT'))).toBe(true);
    expect(sameDocumentNeeded(req('a', 'EMBASSY', 'VIDEX'), req('b', 'INITIAL', 'VIDEX'))).toBe(true); // key without a document type
  });

  it('matches different keys of the same document type', () => {
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PHOTO'), req('b', 'EMBASSY', 'PHOTO_2'))).toBe(false); // one photo ≠ "2 photos"
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'LANGUAGE_CERT'), req('b', 'EMBASSY', 'GERMAN_CERT'))).toBe(true);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'passport'), req('b', 'EMBASSY', ' PASSPORT '))).toBe(true);
  });

  it('does not match the same stage, other stages, other documents or requirements without a key', () => {
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('b', 'INITIAL', 'PASSPORT'))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('a', 'EMBASSY', 'PASSPORT'))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('b', 'VISA', 'PASSPORT'))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('b', 'EMBASSY', 'CV'))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'DIPLOMA'), req('b', 'EMBASSY', 'ANERKENNUNG'))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', null), req('b', 'EMBASSY', null))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'PASSPORT'), req('b', 'EMBASSY', null))).toBe(false);
    expect(sameDocumentNeeded(req('a', 'INITIAL', 'VIDEX'), req('b', 'EMBASSY', 'ACCOMMODATION'))).toBe(false); // both untyped, different keys
  });

  it('requirementDocType ignores unknown keys and OTHER', () => {
    expect(requirementDocType('PASSPORT')).toBe('PASSPORT');
    expect(requirementDocType('PHOTO_2')).toBe('PHOTO');
    expect(requirementDocType('SOMETHING_ELSE')).toBeNull();
    expect(requirementDocType(null)).toBeNull();
  });

  it('matchingRequirements lists every matching requirement of the other stage', () => {
    const all = [req('i1', 'INITIAL', 'PASSPORT'), req('i2', 'INITIAL', 'PHOTO'), req('e1', 'EMBASSY', 'PASSPORT'), req('e2', 'EMBASSY', 'PHOTO_2'), req('e3', 'EMBASSY', 'HEALTH_INSURANCE')];
    expect(matchingRequirements(all[0], all).map((r) => r.id)).toEqual(['e1']);
    expect(matchingRequirements(all[3], all)).toEqual([]);
    expect(matchingRequirements(all[4], all)).toEqual([]);
  });
});

describe('shouldLinkInto', () => {
  it('links into an empty requirement or one with only rejected / linked documents', () => {
    expect(shouldLinkInto('s', [])).toBe(true);
    expect(shouldLinkInto('s', [doc('x', 'REJECTED')])).toBe(true);
    expect(shouldLinkInto('s', [doc('x', 'ACCEPTED', 'older')])).toBe(true); // another linked file: a new upload joins it
  });

  it('never links the same source twice and leaves a slot the client handled alone', () => {
    expect(shouldLinkInto('s', [doc('x', 'REJECTED', 's')])).toBe(false);
    expect(shouldLinkInto('s', [doc('x', 'PENDING')])).toBe(false);
    expect(shouldLinkInto('s', [doc('x', 'ACCEPTED')])).toBe(false);
  });
});

describe('pickSource / needsDocument', () => {
  it('takes the newest accepted own upload, then (when allowed) the newest pending one; never a linked copy', () => {
    const docs = [
      doc('old', 'ACCEPTED', null, '2026-10-01T00:00:00Z'),
      doc('new', 'ACCEPTED', null, '2026-11-01T00:00:00Z'),
      doc('copy', 'ACCEPTED', 'x', '2026-12-01T00:00:00Z'),
      doc('wait', 'PENDING', null, '2026-12-02T00:00:00Z'),
    ];
    expect(pickSource(docs, { pending: true })?.id).toBe('new');
    expect(pickSource([docs[3], doc('r', 'REJECTED')], { pending: true })?.id).toBe('wait');
    expect(pickSource([docs[3]], { pending: false })).toBeNull();
    expect(pickSource([docs[2]], { pending: true })).toBeNull();
  });

  it('a requirement needs a document while it has nothing waiting or accepted', () => {
    expect(needsDocument([])).toBe(true);
    expect(needsDocument([{ status: 'REJECTED' }])).toBe(true);
    expect(needsDocument([{ status: 'PENDING' }])).toBe(false);
  });
});

describe('followReview', () => {
  it('passes accept / reject (with the note) / pending on, unless the copy was reviewed separately', () => {
    expect(followReview({ linkDetached: false }, { status: 'ACCEPTED', reviewNote: 'x' })).toEqual({ status: 'ACCEPTED', reviewNote: null });
    expect(followReview({ linkDetached: false }, { status: 'REJECTED', reviewNote: 'Blurred' })).toEqual({ status: 'REJECTED', reviewNote: 'Blurred' });
    expect(followReview({ linkDetached: false }, { status: 'PENDING', reviewNote: null })).toEqual({ status: 'PENDING', reviewNote: null });
    expect(followReview({ linkDetached: true }, { status: 'REJECTED', reviewNote: 'Blurred' })).toBeNull();
  });
});
