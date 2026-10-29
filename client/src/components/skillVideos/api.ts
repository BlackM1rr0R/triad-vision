import { toast } from 'sonner';
import axios from 'axios';
import i18n, { registerCopy } from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { pagesSkillVideos } from '@/i18n/pagesSkillVideos';

/**
 * Skill videos (server: lib/skillVideos, routes/skillVideos.ts, routes/admin/skillVideos.ts,
 * routes/companySkillVideos.ts). Copy: i18n/pagesSkillVideos.ts (`skillVideos.*`).
 */
registerCopy(pagesSkillVideos);

export const SKILL_TAGS = ['driver', 'welder', 'cook', 'nurse', 'electrician', 'construction', 'mechanic', 'warehouse', 'cleaning', 'safety', 'other'] as const;
export type SkillTag = (typeof SKILL_TAGS)[number];
export type SkillVideoStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SkillVideoBase {
  id: string;
  title: string;
  skill: SkillTag;
  source: 'RECORDED' | 'UPLOADED';
  mimeType: string;
  size: number;
  durationSec: number | null;
  hasPoster: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OwnSkillVideo extends SkillVideoBase {
  status: SkillVideoStatus;
  rejectReason: string | null;
  reviewedAt: string | null;
  consent: boolean;
  consentAt: string | null;
  consentWithdrawnAt: string | null;
  employerViews: number;
  visibleToEmployers: boolean;
}

export interface StaffSkillVideo extends OwnSkillVideo {
  caseId: string | null;
  candidate?: { id: string; firstName: string; lastName: string; profession: string | null };
  case?: { id: string; number: string } | null;
}

export interface SkillVideoLimits {
  maxCount: number;
  maxBytes: number;
  maxSeconds: number;
  maxRecordSeconds: number;
}

export interface OwnListResponse {
  items: OwnSkillVideo[];
  limits: SkillVideoLimits;
  skills: SkillTag[];
  suggestedSkill: SkillTag;
  employersTotal: number;
}

export const ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';

export const skillVideoError = (err: unknown) => {
  const code = errorCode(err);
  const key = `skillVideos.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('skillVideos.errors.default'));
};
export const toastSkillVideoError = (err: unknown) => toast.error(skillVideoError(err));

export const fmtDuration = (s: number | null | undefined) => {
  if (s == null || !Number.isFinite(s)) return '—';
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
};

/** Duration of a local file from its metadata (null when the browser cannot tell, e.g. an unseekable WebM). */
export const probeDuration = (file: Blob): Promise<number | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (d: number | null) => {
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      resolve(d);
    };
    const timer = window.setTimeout(() => done(null), 8000);
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) {
        window.clearTimeout(timer);
        done(v.duration);
        return;
      }
      // Chrome reports Infinity for MediaRecorder WebM until it is seeked to the end.
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        window.clearTimeout(timer);
        done(Number.isFinite(v.duration) ? v.duration : null);
      };
      v.currentTime = 1e7;
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });

/** A poster frame (JPEG) from about one second into the video, drawn on a canvas; null when it fails. */
export const capturePoster = (file: Blob): Promise<Blob | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let settled = false;
    const done = (b: Blob | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      resolve(b);
    };
    const timer = window.setTimeout(() => done(null), 10000);
    v.onloadeddata = () => {
      v.currentTime = Number.isFinite(v.duration) && v.duration > 0 ? Math.min(1, v.duration / 2) : 0.5;
    };
    v.onseeked = () => {
      try {
        const w = v.videoWidth;
        const h = v.videoHeight;
        if (!w || !h) return done(null);
        const scale = Math.min(1, 640 / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            window.clearTimeout(timer);
            done(b && b.size <= 600 * 1024 ? b : null);
          },
          'image/jpeg',
          0.75,
        );
      } catch {
        window.clearTimeout(timer);
        done(null);
      }
    };
    v.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    v.src = url;
  });

export interface UploadInput {
  file: Blob;
  fileName: string;
  title: string;
  skill: SkillTag;
  source: 'RECORDED' | 'UPLOADED';
  durationSec: number | null;
  consent: boolean;
  poster: Blob | null;
}

const MAX_ATTEMPTS = 3;
const retryable = (err: unknown) => {
  if (!axios.isAxiosError(err)) return false;
  if (!err.response) return true; // network error / timeout
  return err.response.status >= 500 || err.response.status === 429;
};

/**
 * Plain multipart upload with a progress bar and up to 2 automatic retries on network / server errors
 * (the server has no chunked / resumable upload; a retry sends the whole file again).
 */
export const uploadSkillVideo = async (
  url: string,
  input: UploadInput,
  onProgress: (percent: number) => void,
  onRetry: (attempt: number, max: number) => void,
) => {
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.append('title', input.title);
    form.append('skill', input.skill);
    form.append('source', input.source);
    form.append('consent', String(input.consent));
    if (input.durationSec != null) form.append('durationSec', String(Math.round(input.durationSec * 10) / 10));
    form.append('file', input.file, input.fileName);
    if (input.poster) form.append('poster', input.poster, 'poster.jpg');
    try {
      onProgress(0);
      return await api.post<{ video: OwnSkillVideo }>(url, form, {
        timeout: 30 * 60 * 1000,
        onUploadProgress: (e) => onProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !retryable(err)) throw err;
      onRetry(attempt + 1, MAX_ATTEMPTS);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
};
