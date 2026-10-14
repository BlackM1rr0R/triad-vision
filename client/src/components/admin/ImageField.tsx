import { useId, useRef, useState } from 'react';
import { ImageOff, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from './labels';

/** Image URL input with upload (POST /admin/upload) and live preview. */
export const ImageField = ({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
}) => {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<{ url: string }>('/admin/upload', fd);
      setBroken(false);
      onChange(data.url);
    } catch (err) {
      toastError(err, 'Şəkil yüklənmədi.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <div className="flex gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {value && !broken ? (
            <img src={value} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
          ) : (
            <ImageOff className="size-5 text-muted/60" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="relative">
            <input
              id={id}
              className="input pr-9"
              value={value}
              placeholder="https://… və ya /uploads/…"
              required={required}
              onChange={(e) => {
                setBroken(false);
                onChange(e.target.value);
              }}
            />
            {value && (
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-danger"
                onClick={() => onChange('')}
                aria-label="Şəkli təmizlə"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml,image/avif"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
            Şəkil yüklə
          </button>
        </div>
      </div>
    </div>
  );
};
