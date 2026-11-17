import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { PartyPopper } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesWelcomePoster } from '@/i18n/pagesWelcomePoster';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesWelcomePoster);

/** Downloads GET /api/company/workers/:caseId/welcome-poster.pdf (own, approved, not-left workers only). */
export const WelcomePosterButton = ({ caseId, className = 'btn-secondary btn-sm' }: { caseId: string; className?: string }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/company/workers/${encodeURIComponent(caseId)}/welcome-poster.pdf`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `welcome-${caseId.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(t('welcomePoster.error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={() => void download()} disabled={busy} aria-busy={busy}>
      {busy ? <Spinner className="size-4" /> : <PartyPopper className="size-4" aria-hidden />} {t('welcomePoster.button')}
    </button>
  );
};

/** Card at the top of the arrival checklist drawer: what the poster contains + download. */
export const WelcomePosterCard = ({ caseId, name, className }: { caseId: string; name?: string; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div className={clsx('rounded-xl border border-line bg-sunken p-3', className)}>
      <p className="text-sm font-semibold text-ink">{t('welcomePoster.title', { name: name ?? '' })}</p>
      <p className="mt-0.5 text-xs text-muted">{t('welcomePoster.text')}</p>
      <WelcomePosterButton caseId={caseId} className="btn-secondary btn-sm mt-2" />
    </div>
  );
};

/** Short hint with the download on the FIRST_DAY checklist item. */
export const WelcomePosterHint = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] leading-snug text-muted">
      {t('welcomePoster.hint')} <WelcomePosterButton caseId={caseId} className="inline-flex min-h-8 items-center gap-1 font-semibold text-link hover:underline" />
    </p>
  );
};
