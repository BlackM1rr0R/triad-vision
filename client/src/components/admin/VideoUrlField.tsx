import { useId, useRef, useState } from 'react';
import { Upload, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from './labels';

/**
 * Story video: a YouTube / Vimeo link (embedded privacy-friendly on /stories) or an MP4 / WebM uploaded to the
 * site (POST /admin/site-features/video-upload, ≤ 100 MB; the site CSP only plays videos from its own origin).
 */
export const VideoUrlField = ({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (url: string) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ url: string }>('/admin/site-features/video-upload', fd);
      onChange(data.url);
    } catch (err) {
      toastError(err, t('discoverAdmin.story.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <span className="grid size-[42px] shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted" aria-hidden>
          <Video className="size-5" />
        </span>
        <input id={id} type="text" className="input min-w-0 flex-1" value={value} placeholder="https://youtu.be/…" maxLength={500} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary shrink-0" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Spinner className="size-4" /> : <Upload className="size-4" aria-hidden />}
          <span className="hidden sm:inline">{t('discoverAdmin.story.upload')}</span>
        </button>
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,.mp4,.webm" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      </div>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
};
