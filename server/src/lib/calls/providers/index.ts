import type { ProviderName } from '../settings.js';
import { fakeProvider } from './fake.js';
import { sipgateProvider } from './sipgate.js';
import { twilioProvider } from './twilio.js';
import type { CallProvider } from './types.js';

export const providerFor = (name: ProviderName): CallProvider | null =>
  name === 'twilio' ? twilioProvider : name === 'sipgate' ? sipgateProvider : name === 'fake' ? fakeProvider : null;

export * from './types.js';
