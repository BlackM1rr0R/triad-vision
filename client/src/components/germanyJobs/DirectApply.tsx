import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ExternalLink, FileDown, FileText, Info, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobs } from '@/i18n/pagesGermanyJobs';
import { buttonClass } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { blobErrorCode, useBlobDownload } from '@/components/cv/CvDownloadButton';
import { downloadBlob, filenameFrom } from '@/components/cv/types';
import type { GermanyJobType } from '@/lib/germanyJobs';

registerCopy(pagesGermanyJobs);

/** What the helpers need of an external listing (search result, saved job, alert e-mail link). */
export interface DirectListing {
  url: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  type?: GermanyJobType;
}

/** rel of every link to an external listing: no referrer, no opener, no endorsement. */
export const EXTERNAL_REL = 'noopener noreferrer nofollow';

/**
 * Applying to an external listing (owner decision): the candidate applies to the employer directly with their own CV;
 * Triad Vision is not an intermediary there. "Elanı aç və müraciət et" opens the listing in a new tab.
 */
export const DirectApplyButton = ({ url, size, className }: { url: string; size?: 'sm'; className?: string }) => {
  const { t } = useTranslation();
  return (
    <a href={url} target="_blank" rel={EXTERNAL_REL} className={buttonClass({ size, className })}>
      {t('gj.card.applyDirect')} <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only">{t('gj.card.newTab')}</span>
    </a>
  );
};

/** "Müraciəti işəgötürənə özünüz göndərirsiniz. Triad Vision bu elanlarda vasitəçi deyil." */
export const DirectApplyNote = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <p className={clsx('flex items-start gap-1.5 text-xs text-muted', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('gj.direct.note')}
    </p>
  );
};

/**
 * Free helpers next to a listing: signed-in clients download their Lebenslauf (CV builder PDF, server /api/cv/pdf)
 * and a generic Anschreiben for this listing (template engine, server POST /api/germany-jobs/cover-letter.pdf;
 * nothing is stored); guests get the way to register / the CV builder. Other roles see nothing.
 */
export const DirectApplyHelpers = ({ listing, className }: { listing: DirectListing; className?: string }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const cv = useBlobDownload();
  const [letterBusy, setLetterBusy] = useState(false);

  if (user && user.role !== 'CLIENT') return null;
  if (!user) {
    return (
      <p className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted', className)}>
        <span>{t('gj.direct.guest')}</span>
        <Link to="/register" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
          <UserPlus className="size-3.5" aria-hidden /> {t('gj.direct.register')}
        </Link>
      </p>
    );
  }

  const letter = async () => {
    setLetterBusy(true);
    try {
      const res = await api.post<Blob>(
        '/germany-jobs/cover-letter.pdf',
        { title: listing.title || undefined, company: listing.company || undefined, location: listing.location || undefined, type: listing.type },
        { responseType: 'blob' },
      );
      downloadBlob(res.data, filenameFrom(res.headers['content-disposition'] as string | undefined, 'Anschreiben.pdf'));
    } catch (err) {
      const code = await blobErrorCode(err);
      const key = [`cvb.errors.${code}`, `letters.errors.${code}`].find((k) => i18n.exists(k));
      toast.error(key ? t(key) : t('common.error'));
    } finally {
      setLetterBusy(false);
    }
  };

  const small = 'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink/80 hover:border-brand-400 disabled:opacity-60';
  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <button type="button" className={small} disabled={cv.busy} onClick={() => void cv.run('/cv/pdf', 'Lebenslauf.pdf', { template: 'lebenslauf', lang: 'de' })}>
        {cv.busy ? <Spinner className="size-3.5" /> : <FileDown className="size-3.5" aria-hidden />} {t('gj.direct.cv')}
      </button>
      <button type="button" className={small} disabled={letterBusy} onClick={() => void letter()} title={t('gj.direct.letterHint')}>
        {letterBusy ? <Spinner className="size-3.5" /> : <FileText className="size-3.5" aria-hidden />} {t('gj.direct.letter')}
      </button>
      <Link to="/account/cv" className="text-xs font-semibold text-link hover:underline">
        {t('gj.direct.cvBuilder')}
      </Link>
    </div>
  );
};
