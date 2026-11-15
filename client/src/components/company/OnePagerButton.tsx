import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesMilestoneDocs } from '@/i18n/pagesMilestoneDocs';

registerCopy(pagesMilestoneDocs);

/**
 * "PDF profile" button of the employer portal: downloads the candidate one-pager
 * (/api/company/pool/:code/one-pager.pdf — counts as a profile view — or /api/company/workers/:caseId/one-pager.pdf)
 * in the portal language, with the "prepared for <company>" header.
 */
export function OnePagerButton({ path, fileName, className = 'btn-secondary btn-sm' }: { path: string; fileName: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const lang = (i18n.resolvedLanguage ?? 'de').slice(0, 2);

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api${path}?lang=${encodeURIComponent(lang)}&branding=1`, { credentials: 'same-origin' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? String(res.status));
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      const code = (err as Error).message;
      toast.error(code === 'POOL_DAILY_LIMIT' ? String(t('pool.errors.POOL_DAILY_LIMIT', { defaultValue: t('milestones.onePager.error') })) : String(t('milestones.onePager.error')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy} aria-busy={busy} title={String(t('milestones.onePager.title'))}>
      <FileDown className="size-4" aria-hidden /> {t('milestones.onePager.download')}
    </button>
  );
}

export default OnePagerButton;
