import crypto from 'node:crypto';
import type { CallProvider, ClickToCallInput } from './types.js';

/**
 * In-memory provider for tests and local demos (never selectable in production). Records every
 * click-to-call; its webhook (/api/calls/webhooks/fake) is signed with HMAC-SHA256 over the raw body
 * in the X-Fake-Signature header so the signature path is exercised end to end.
 */

export const fakeSecret = () => process.env.CALLS_FAKE_SECRET || 'fake-calls-secret';

export const fakeCalls: ClickToCallInput[] = [];
let failNext = false;
export const failNextFakeCall = () => {
  failNext = true;
};
export const resetFakeCalls = () => {
  fakeCalls.length = 0;
  failNext = false;
};

export const fakeSign = (raw: string | Buffer) => crypto.createHmac('sha256', fakeSecret()).update(raw).digest('hex');

export const verifyFake = (raw: Buffer | undefined, header: string | undefined) => {
  if (!raw || !header) return false;
  const a = Buffer.from(fakeSign(raw));
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const fakeProvider: CallProvider = {
  name: 'fake',
  async clickToCall(input) {
    if (failNext) {
      failNext = false;
      throw new Error('fake provider failure');
    }
    fakeCalls.push(input);
    return { providerCallId: `FAKE-${crypto.randomBytes(6).toString('hex')}` };
  },
};
