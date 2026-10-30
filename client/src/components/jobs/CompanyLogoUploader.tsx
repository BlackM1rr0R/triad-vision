import { useRef, useState } from 'react';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { registerCopy } from '@/i18n';
import { pagesPublicImages } from '@/i18n/pagesPublicImages';
import type { CompanyLogo } from './types';

registerCopy(pagesPublicImages);

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Upload / replace / remove the company logo: admin company drawer (`/admin/companies/:id/logo`) and employer portal
 * profile (`/company/me/logo`). POST multipart `file` → `{ logo }` or `{ company: { logo } }`; DELETE removes it.
 * Client-side type / size check; the server re-encodes (WebP ≤ 512 px, transparency kept, no SVG).
 */
export const CompanyLogoUploader = ({
  endpoint,
  logo,
  name,
  note,
  onChange,
}: {
  endpoint: string;
  logo: CompanyLogo | null | undefined;
  name: string;
  note?: string;
  onChange: (logo: CompanyLogo | null) => void;
}) => {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  const upload = async (file: File) => {
    if (!ACCEPT.includes(file.type)) return void toast.error(t(file.type === 'image/svg+xml' ? 'publicImages.svgNotAllowed' : 'publicImages.badType'));
    if (file.size > MAX_BYTES) return void toast.error(t('publicImages.tooLarge'));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file); // no client-side JPEG compression: it would drop the transparency
      const { data } = await api.post<{ logo?: CompanyLogo | null; company?: { logo?: CompanyLogo | null } }>(endpoint, fd);
      setBroken(false);
      onChange(data.logo ?? data.company?.logo ?? null);
      toast.success(t('publicImages.companyLogo.saved'));
    } catch (err) {
      toastError(err, t('publicImages.companyLogo.failed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(endpoint);
      onChange(null);
      toast.success(t('publicImages.companyLogo.removed'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-1.5">
        {logo?.url && !broken ? (
          <img src={logo.url} alt={t('publicImages.logoAlt', { name })} className="max-h-full max-w-full object-contain" onError={() => setBroken(true)} />
        ) : (
          <ImageOff className="size-5 text-subtle" aria-label={t('publicImages.companyLogo.none')} />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
            {logo ? t('publicImages.companyLogo.replace') : t('publicImages.companyLogo.upload')}
          </button>
          {logo && (
            <button type="button" className="btn-ghost btn-sm text-danger-fg" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-3.5" /> {t('publicImages.companyLogo.remove')}
            </button>
          )}
        </div>
        <p className="text-xs text-muted">{t('publicImages.companyLogo.hint')}</p>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
    </div>
  );
};
