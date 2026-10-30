import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertCircle, Upload } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesClientPlus } from '@/i18n/pagesClientPlus';
import { ScanPage, scanKind } from './ScanPage';
import { MarkBox, PagePager } from './MarkEditor';
import type { ReviewMark } from './marks';

registerCopy(pagesClientPlus);

/**
 * Client view of a rejected scan: the page with the staff's red numbered boxes, the numbered notes, the reject
 * reason and "Yenidən yüklə". Opens on the first marked page; tapping a note jumps to its page.
 */
export const MarkedScan = ({
  src,
  mimeType,
  marks,
  reason,
  onReupload,
  accept,
  className,
}: {
  src: string;
  mimeType: string;
  marks: ReviewMark[];
  reason?: string | null;
  onReupload?: (file: File) => void;
  accept?: string;
  className?: string;
}) => {
  const { t } = useTranslation();
  const firstPage = marks.length ? Math.min(...marks.map((m) => m.page)) : 1;
  const [page, setPage] = useState(firstPage);
  const [pages, setPages] = useState(1);
  const [active, setActive] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showScan = marks.length > 0 && scanKind(mimeType) !== 'unsupported';

  return (
    <div className={clsx('space-y-3 rounded-xl border border-danger-border bg-danger-bg/40 p-3', className)}>
      {reason && (
        <p className="flex gap-2 text-xs leading-relaxed whitespace-pre-line text-danger">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {reason}
        </p>
      )}
      {showScan && (
        <>
          <div>
            <p className="text-sm font-semibold text-ink">{t('cplus.marks.title')}</p>
            <p className="text-xs text-muted">{t('cplus.marks.hint')}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <ScanPage src={src} mimeType={mimeType} page={page} alt={t('cplus.marks.scanAlt')} onPageCount={setPages}>
                {marks.map((m, i) => (m.page === page ? <MarkBox key={i} mark={m} n={i + 1} active={active === i} /> : null))}
              </ScanPage>
              <PagePager page={page} total={pages} onChange={setPage} />
            </div>
            <ol className="space-y-1.5">
              {marks.map((m, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={clsx('flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition', active === i ? 'border-red-400 bg-card' : 'border-line bg-card/70 hover:bg-card')}
                    onClick={() => {
                      setPage(m.page);
                      setActive(i);
                    }}
                  >
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-red-600 text-[11px] font-bold text-white" aria-hidden>
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{t('cplus.marks.mark', { n: i + 1 })}: </span>
                      <span className={m.note ? 'text-ink' : 'text-muted italic'}>{m.note || t('cplus.marks.noNote')}</span>
                      {pages > 1 && <span className="block text-[11px] text-muted">{t('cplus.marks.page', { n: m.page })}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      {onReupload && (
        <div>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            accept={accept ?? 'application/pdf,image/jpeg,image/png'}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (fileRef.current) fileRef.current.value = '';
              if (f) onReupload(f);
            }}
          />
          <button type="button" className="btn-primary btn-sm" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" aria-hidden /> {t('cplus.marks.reupload')}
          </button>
        </div>
      )}
    </div>
  );
};

export default MarkedScan;
