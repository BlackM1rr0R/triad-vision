import { describe, expect, it } from 'vitest';
import { signerLink } from '../../src/lib/employerWorkers/panel.js';

// Employer worker panel: /company/contracts/:signerId opens only for the signer's own login
// (routes/signatures.ts → ownSigner), so a colleague's pending signature must not get a dead sign link.

const signers = [
  { id: 'sig-a', userId: 'user-a' },
  { id: 'sig-b', userId: 'user-b' },
];

describe('signerLink', () => {
  it('links the signed-in user to their own signer', () => {
    expect(signerLink(signers, 'user-b')).toBe('/company/contracts/sig-b');
  });

  it('gives no link when only colleagues still have to sign', () => {
    expect(signerLink(signers, 'user-c')).toBeNull();
  });

  it('keeps the first pending signer without a known viewer (exports, reports)', () => {
    expect(signerLink(signers)).toBe('/company/contracts/sig-a');
    expect(signerLink([])).toBeNull();
  });
});
