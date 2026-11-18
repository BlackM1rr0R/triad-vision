import { describe, expect, it } from 'vitest';
import { nextActionOf } from '../../src/lib/partnerPortal/cases.js';

describe('partner portal next action with two-step contracts', () => {
  it('tells the partner the client signs only when it is the client’s turn', () => {
    expect(nextActionOf('CONTRACT_SENT', 0)).toBe('SIGN_CONTRACT'); // legacy contract (no turn known)
    expect(nextActionOf('CONTRACT_SENT', 0, null)).toBe('SIGN_CONTRACT');
    expect(nextActionOf('CONTRACT_SENT', 0, 'CLIENT')).toBe('SIGN_CONTRACT');
    expect(nextActionOf('CONTRACT_SENT', 0, 'TRIAD')).toBe('WAIT_CONTRACT_CHECK');
    expect(nextActionOf('CONTRACT_SENT', 0, 'STAFF')).toBe('WAIT_CONTRACT_CHECK');
  });

  it('other statuses are unchanged', () => {
    expect(nextActionOf('DOCUMENTS_PENDING', 2, 'TRIAD')).toBe('UPLOAD_DOCUMENTS');
    expect(nextActionOf('DOCUMENTS_PENDING', 0)).toBe('SUBMIT_DOCUMENTS');
    expect(nextActionOf('CONTRACT_SIGNED', 0)).toBe('WAIT_CONTRACT_CHECK');
    expect(nextActionOf('APPROVED', 0)).toBe('NONE');
  });
});
