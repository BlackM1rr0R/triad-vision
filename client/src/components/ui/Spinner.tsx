import clsx from 'clsx';
import { useTranslation } from 'react-i18next';

/**
 * Inline spinner (inherits the text colour; size via className, e.g. "size-4").
 * Decorative by default; pass `label` to announce it as a loading status.
 */
export const Spinner = ({ className, label }: { className?: string; label?: string }) => (
  <span
    className={clsx('inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    {...(label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true })}
  />
);

/** Centred page-level loader. */
export const PageLoader = () => {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-[50vh] place-items-center text-brand-600">
      <Spinner className="size-10 border-4" label={t('ui.loading')} />
    </div>
  );
};
