import { describe, expect, it } from 'vitest';
import { awaitsReplacement, clientUploadMode } from './docReplace';

const req = (stage: string, ...statuses: string[]) => ({ stage, documents: statuses.map((status) => ({ status })) });

describe('clientUploadMode', () => {
  it('open upload step: any requirement of that stage', () => {
    expect(clientUploadMode('DOCUMENTS_PENDING', req('INITIAL'))).toBe('open');
    expect(clientUploadMode('DOCUMENTS_PENDING', req('INITIAL', 'ACCEPTED'))).toBe('open');
    expect(clientUploadMode('EMBASSY_DOCUMENTS', req('EMBASSY', 'PENDING'))).toBe('open');
  });

  it('after hand-in: only a requirement whose files were all rejected can be replaced', () => {
    expect(clientUploadMode('DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED'))).toBe('replace');
    expect(clientUploadMode('EMBASSY_REVIEW', req('EMBASSY', 'REJECTED', 'REJECTED'))).toBe('replace');
    expect(clientUploadMode('EMBASSY_DOCUMENTS', req('INITIAL', 'REJECTED'))).toBe('replace');
    expect(clientUploadMode('DOCUMENTS_REVIEW', req('INITIAL', 'REJECTED', 'PENDING'))).toBeNull(); // already replaced
    expect(clientUploadMode('DOCUMENTS_REVIEW', req('INITIAL', 'ACCEPTED'))).toBeNull();
    expect(clientUploadMode('DOCUMENTS_REVIEW', req('INITIAL'))).toBeNull();
  });

  it('never for closed cases or other stages', () => {
    for (const s of ['APPROVED', 'REJECTED', 'CANCELLED']) expect(clientUploadMode(s, req('INITIAL', 'REJECTED'))).toBeNull();
    expect(clientUploadMode('DOCUMENTS_REVIEW', req('CONTRACT', 'REJECTED'))).toBeNull();
  });

  it('awaitsReplacement', () => {
    expect(awaitsReplacement([])).toBe(false);
    expect(awaitsReplacement([{ status: 'REJECTED' }])).toBe(true);
    expect(awaitsReplacement([{ status: 'REJECTED' }, { status: 'PENDING' }])).toBe(false);
  });
});
