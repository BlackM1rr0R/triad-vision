import i18n from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { downloadBlob, filenameFrom } from '@/components/cv/types';
import { blobErrorCode } from '@/components/cv/CvDownloadButton';

/** Shared types / helpers of "apply via Triad Vision" after sending (server lib/germanyJobs/applicationStatus.ts). */

export const EXTERNAL_APP_STATUSES = ['SUBMITTED', 'FORWARDED', 'INTERVIEW', 'ACCEPTED', 'REJECTED', 'NO_REPLY'] as const;
export type ExternalAppStatus = (typeof EXTERNAL_APP_STATUSES)[number];

export const COVER_JOB_TYPES = ['FAHRER', 'PFLEGE', 'HANDWERK', 'GASTRO', 'BUERO_IT', 'AUSBILDUNG', 'GENERAL'] as const;
export type CoverJobType = (typeof COVER_JOB_TYPES)[number];

export interface TimelineStep {
  key: 'SUBMITTED' | 'FORWARDED' | 'INTERVIEW' | 'ANSWER';
  state: 'done' | 'current' | 'todo' | 'skipped';
  at: string | null;
  outcome?: ExternalAppStatus;
}

export interface CoverDraft {
  jobType: CoverJobType;
  subject: string;
  body: string;
  missing: string[];
  templates: { jobType: CoverJobType; name: string }[];
}

export interface AttachedLetter {
  subject: string;
  body: string;
  at: string | null;
}

export const STATUS_TONE: Record<ExternalAppStatus, string> = {
  SUBMITTED: 'bg-sunken text-ink',
  FORWARDED: 'bg-info-bg text-info-fg',
  INTERVIEW: 'bg-warning-bg text-warning-fg',
  ACCEPTED: 'bg-success-bg text-success-fg',
  REJECTED: 'bg-danger-bg text-danger-fg',
  NO_REPLY: 'bg-sunken text-muted',
};

/** Translated error of an API call (xapp.errors.<CODE>, generic otherwise). */
export const xappError = (err: unknown) => {
  const key = `xapp.errors.${errorCode(err)}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('xapp.errors.generic'));
};

/** POSTs JSON and saves the PDF answer. Returns an error text or null. */
export const postPdf = async (url: string, body: unknown, fallbackName: string): Promise<string | null> => {
  try {
    const res = await api.post<Blob>(url, body, { responseType: 'blob' });
    downloadBlob(res.data, filenameFrom(res.headers['content-disposition'] as string | undefined, fallbackName));
    return null;
  } catch (err) {
    const code = await blobErrorCode(err);
    const key = `xapp.errors.${code}`;
    return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('xapp.errors.generic'));
  }
};

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
