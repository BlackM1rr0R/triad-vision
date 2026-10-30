import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from './ConfirmDialog';
import { cancelAllConfirms, confirmDialog, currentConfirm, settleConfirm, subscribeConfirm, type ConfirmRequest } from './confirmStore';

export { confirmDialog, type ConfirmOptions } from './confirmStore';

/**
 * Hook form of confirmDialog (same function; handy where a component prefers hooks):
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ message: t('x.deleteConfirm', { name }), confirmLabel: t('ui.confirmDlg.delete') }))) return;
 */
export const useConfirm = () => confirmDialog;

/** Renders the queued confirmDialog() requests. Mounted once in main.tsx, above every other overlay. */
export const ConfirmHost = () => {
  const { t } = useTranslation();
  const req = useSyncExternalStore(subscribeConfirm, currentConfirm, currentConfirm);
  // Keep the last request on screen while the dialog plays its exit animation.
  const [last, setLast] = useState<ConfirmRequest | null>(req);
  useEffect(() => {
    if (req) setLast(req);
  }, [req]);
  useEffect(() => () => cancelAllConfirms(), []);

  const view = req ?? last;
  if (!view) return null;
  return (
    <ConfirmDialog
      key={view.id}
      open={!!req}
      onClose={() => req && settleConfirm(req.id, false)}
      onConfirm={() => req && settleConfirm(req.id, true)}
      title={view.title ?? t('ui.confirmDlg.title')}
      message={view.message}
      confirmLabel={view.confirmLabel ?? t('ui.confirm')}
      cancelLabel={view.cancelLabel}
      tone={view.tone ?? 'danger'}
      confirmText={view.confirmText}
      zIndex={120}
    />
  );
};
