import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { asChecks } from './api';

/**
 * Server check result shown right after an upload, with clear next steps
 * ("Please upload a sharper photo of your passport photo page").
 */
export const CheckResultNotice = ({ checks, onDismiss, className }: { checks: unknown; onDismiss?: () => void; className?: string }) => {
  const { t } = useTranslation();
  const c = asChecks(checks);
  if (!c) return null;
  const hasIssues = c.issues.length > 0;

  return (
    <div
      role="status"
      className={clsx(
        'relative rounded-lg border px-3 py-2.5 pr-9 text-sm',
        c.level === 'error'
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
          : c.level === 'warn'
            ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200',
        className,
      )}
    >
      <p className="flex items-center gap-2 font-semibold">
        {c.level === 'error' ? <XCircle className="size-4 shrink-0" aria-hidden /> : c.level === 'warn' ? <AlertTriangle className="size-4 shrink-0" aria-hidden /> : <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
        {hasIssues ? t('vault.check.resultIssues') : t('vault.check.resultOk')}
      </p>
      {hasIssues && (
        <ul className="mt-1.5 list-disc space-y-1 pl-6 leading-relaxed">
          {c.issues.map((i) => (
            <li key={i.code}>{t(`vault.check.server.${i.code}`, i.params)}</li>
          ))}
        </ul>
      )}
      {c.pending && (
        <p className="mt-1.5 flex items-center gap-2 text-xs opacity-90">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t('vault.check.pending')}
        </p>
      )}
      {hasIssues && <p className="mt-1.5 text-xs opacity-80">{t('vault.check.replaceHint')}</p>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="absolute top-2 right-2 grid size-6 place-items-center rounded opacity-70 hover:opacity-100" aria-label={t('common.close')}>
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
};

export default CheckResultNotice;
