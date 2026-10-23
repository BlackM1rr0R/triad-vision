import type { CallsSettings } from '../settings.js';

/**
 * Provider-agnostic click-to-call. Every adapter first rings the staff member's own phone and, once they
 * pick up, connects the client. Webhook payloads differ per provider, so each adapter also exposes its own
 * verify / parse helpers used by routes/callWebhooks.ts; they all end up as `CallEvent`s for the service.
 */

export interface ClickToCallInput {
  callId: string;
  staffNumber: string;
  clientNumber: string;
  callerId: string;
  record: boolean;
  /** Spoken to the client before the call is connected when recording (legal notice). */
  announcement: string;
  locale: string;
}

export interface CallProvider {
  readonly name: 'twilio' | 'sipgate' | 'fake';
  clickToCall(input: ClickToCallInput, s: CallsSettings): Promise<{ providerCallId: string }>;
  /** Streams a recording (Twilio only); null when the provider keeps recordings elsewhere. */
  fetchRecording?(key: string, s: CallsSettings): Promise<Response | null>;
}

export type CallLeg = 'staff' | 'client';
export type CallState = 'ringing' | 'answered' | 'completed' | 'busy' | 'no-answer' | 'failed' | 'canceled';

export interface CallEvent {
  leg: CallLeg;
  state: CallState;
  durationSec?: number;
  providerLegId?: string;
}

export class CallProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CallProviderError';
  }
}

/** All outgoing provider HTTP goes through here, so tests can swap in a fake (no real API is ever called). */
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
let fetchImpl: Fetch | null = null;
export const setCallsFetch = (fn: Fetch | null) => {
  fetchImpl = fn;
};
export const callsFetch: Fetch = (url, init) => (fetchImpl ?? fetch)(url, init);

export const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
