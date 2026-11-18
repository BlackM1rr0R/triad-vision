import { describe, expect, it } from 'vitest';
import { documentHintKey } from './hints';
import { pagesPartnerAccess } from '@/i18n/pagesPartnerAccess';

describe('partner portal document hint (QA PE-05 / PE-02)', () => {
  it('status level: status only', () => {
    expect(documentHintKey('status', 'INITIAL', [])).toBe('partnerAccess.docs.statusOnly');
  });
  it('list level: read-only, never "closed for now"', () => {
    expect(documentHintKey('list', null, [])).toBe('partnerAccess.docs.readOnly');
    expect(documentHintKey('list', 'INITIAL', [{ canUpload: false }])).toBe('partnerAccess.docs.readOnly');
  });
  it('upload level: open step or a requirement that takes an upload (replacement / early embassy)', () => {
    expect(documentHintKey('upload', 'INITIAL', [])).toBe('partnerPortal.detail.uploadHint');
    expect(documentHintKey('upload', null, [{ canUpload: false }, { canUpload: true }])).toBe('partnerPortal.detail.uploadHint');
    expect(documentHintKey('download', null, [{ canUpload: false }])).toBe('partnerPortal.detail.uploadClosed');
  });
});

describe('partner access copy (QA PE-07 / PE-05)', () => {
  it.each(['az', 'de', 'en', 'ru'] as const)('%s has the read-only hint and the permission error codes', (lng) => {
    const copy = pagesPartnerAccess[lng].partnerAccess as unknown as { docs: Record<string, string>; errors: Record<string, string> };
    expect(copy.docs.readOnly).toBeTruthy();
    for (const code of ['PARTNER_PERMISSION_DENIED', 'PARTNER_OWNER_ONLY', 'MEMBER_INACTIVE']) expect(copy.errors[code]).toBeTruthy();
  });
});
