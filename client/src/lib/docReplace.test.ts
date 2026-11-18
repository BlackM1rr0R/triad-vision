import { describe, expect, it } from 'vitest';
import { awaitsReplacement, clientUploadMode, embassyUploadsEarly } from './docReplace';

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

describe('early embassy uploads (waiting for the work contract)', () => {
  const initial = (required: boolean, ...statuses: string[]) => ({ stage: 'INITIAL', required, documents: statuses.map((status) => ({ status })) });

  it('embassyUploadsEarly: contract step, or every required initial document accepted in review', () => {
    expect(embassyUploadsEarly('CONTRACT_SENT', [])).toBe(true);
    expect(embassyUploadsEarly('CONTRACT_SIGNED', [])).toBe(true);
    expect(embassyUploadsEarly('DOCUMENTS_REVIEW', [initial(true, 'ACCEPTED'), initial(false)])).toBe(true);
    expect(embassyUploadsEarly('DOCUMENTS_REVIEW', [initial(true, 'ACCEPTED'), initial(true, 'PENDING')])).toBe(false);
    expect(embassyUploadsEarly('DOCUMENTS_PENDING', [initial(true, 'ACCEPTED')])).toBe(false);
    expect(embassyUploadsEarly('EMBASSY_DOCUMENTS', [initial(true, 'ACCEPTED')])).toBe(false);
  });

  it('clientUploadMode: early for EMBASSY only, with the flag', () => {
    expect(clientUploadMode('CONTRACT_SENT', req('EMBASSY'), { earlyEmbassy: true })).toBe('early');
    expect(clientUploadMode('CONTRACT_SENT', req('EMBASSY'))).toBeNull();
    expect(clientUploadMode('CONTRACT_SENT', req('INITIAL'), { earlyEmbassy: true })).toBeNull();
    expect(clientUploadMode('EMBASSY_DOCUMENTS', req('EMBASSY'), { earlyEmbassy: true })).toBe('open');
    expect(clientUploadMode('EMBASSY_REVIEW', req('EMBASSY'), { earlyEmbassy: true })).toBeNull();
  });
});
