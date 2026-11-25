import type { AutoMissing } from './autoCheck.js';

/** FIX_PATH is still read by the history view of earlier applications (routes/externalApplications.ts). */

/** Where the client fixes each item (site path; the language prefix is added for e-mails). */
export const FIX_PATH: Record<AutoMissing, string> = {
  ACCOUNT: '/register',
  CV: '/account/cv',
  GERMAN_LEVEL: '/account/profile',
  PROFESSION: '/account/profile',
  PASSPORT: '/account/profile',
  PHONE: '/account/profile',
  EMAIL: '/account/profile',
};
