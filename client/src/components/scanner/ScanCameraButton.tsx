import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanLine } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesScanner } from '@/i18n/pagesScanner';
import { hasCamera, isTouchDevice } from '@/lib/scanner/client';

registerCopy(pagesScanner);

// The scanner (camera UI, corner editor, worker bridge) is its own chunk, loaded on first use.
const DocumentScanner = lazy(() => import('./DocumentScanner'));

/**
 * "Scan with camera" button for upload spots. Phones and tablets always see it (without the camera API the
 * scanner falls back to the system camera); desktops only when a camera is connected. `onPages` receives the
 * processed JPEG pages and returns false to keep the scanner open (e.g. the upload failed).
 */
export function ScanCameraButton({
  onPages,
  disabled,
  progress,
  title,
  className = 'btn-secondary btn-sm',
}: {
  onPages: (files: File[]) => Promise<boolean | void>;
  disabled?: boolean;
  progress?: number | null;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(() => isTouchDevice());
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (available) return;
    let alive = true;
    void hasCamera().then((yes) => alive && yes && setAvailable(true));
    return () => {
      alive = false;
    };
  }, [available]);

  if (!available) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={t('scanner.buttonHint')}
        onPointerEnter={() => setLoaded(true)}
        onFocus={() => setLoaded(true)}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <ScanLine className="size-4" aria-hidden />
        {t('scanner.button')}
      </button>
      {loaded && (
        <Suspense fallback={null}>
          <DocumentScanner open={open} onClose={() => setOpen(false)} onDone={onPages} progress={progress} title={title} />
        </Suspense>
      )}
    </>
  );
}
