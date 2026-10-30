import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * "Could not load" block with a retry button, for any surface (portal, company, staff). A failed query must
 * show this instead of an endless spinner or a misleading "nothing here yet".
 *
 *   if (q.isError) return <ErrorState onRetry={() => void q.refetch()} />;
 *
 * (Admin screens can keep components/admin/ui ErrorBlock, which also names the server's error code.)
 */
export const ErrorState = ({ onRetry, message, compact = false, className }: { onRetry?: () => void; message?: string; compact?: boolean; className?: string }) => {
  const { t } = useTranslation();
  return (
    <div
      className={clsx('flex flex-col items-center justify-center gap-3 rounded-xl border border-danger-border bg-danger-bg/60 px-4 text-center', compact ? 'py-6' : 'py-10', className)}
      role="alert"
    >
      <AlertCircle className="size-6 text-danger-fg" aria-hidden />
      <p className="text-sm font-medium text-danger-fg">{message ?? t('ui.loadFailed')}</p>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden /> {t('ui.retry')}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
