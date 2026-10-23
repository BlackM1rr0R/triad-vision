import { useEffect, useId, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Modal } from './Modal';
import { Button } from './Button';

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  /** Body text. `children` is rendered below it (extra fields, lists). */
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** "danger" (default) = red confirm + warning icon; "primary" = brand confirm. */
  tone?: 'danger' | 'primary';
  /** Legacy boolean form of `tone` (portal/mail dialogs). */
  danger?: boolean;
  /** Request running: spinner on confirm, nothing closes. `busy` is an alias. */
  loading?: boolean;
  busy?: boolean;
  /** Destructive "type to confirm": the confirm button stays disabled until this exact text is typed. */
  confirmText?: string;
  /** Hide the icon tile. */
  hideIcon?: boolean;
  zIndex?: number;
};

/**
 * Confirmation dialog (role="alertdialog"). Focus starts on the confirm button (or the type-to-confirm field).
 *
 *   <ConfirmDialog open={!!target} onClose={() => setTarget(null)} onConfirm={remove} loading={del.isPending}
 *     title="Delete file?" message="This cannot be undone." confirmLabel="Delete" confirmText={target?.name} />
 */
export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel,
  tone,
  danger,
  loading,
  busy,
  confirmText,
  hideIcon = false,
  zIndex,
}: ConfirmDialogProps) => {
  const { t } = useTranslation();
  const isBusy = !!(loading || busy);
  const resolvedTone = tone ?? (danger === false ? 'primary' : 'danger');
  const [typed, setTyped] = useState('');
  const inputId = useId();
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked = !!confirmText && typed.trim() !== confirmText.trim();
  const Icon = resolvedTone === 'danger' ? AlertTriangle : HelpCircle;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={isBusy}
      size="sm"
      role="alertdialog"
      zIndex={zIndex}
      title={title}
      icon={
        hideIcon ? undefined : (
          <span className={clsx('grid size-9 place-items-center rounded-full', resolvedTone === 'danger' ? 'bg-danger-bg text-danger-fg' : 'bg-brand-100 text-brand-700')}>
            <Icon className="size-4" aria-hidden />
          </span>
        )
      }
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isBusy}>
            {cancelLabel ?? t('ui.cancel')}
          </Button>
          <Button
            variant={resolvedTone === 'danger' ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={isBusy}
            disabled={blocked}
            data-autofocus={confirmText ? undefined : true}
          >
            {confirmLabel ?? t('ui.confirm')}
          </Button>
        </>
      }
    >
      {(message || children || confirmText) && (
        <div className="space-y-3 text-sm leading-relaxed text-ink/80">
          {message && <div>{message}</div>}
          {children}
          {confirmText && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!blocked && !isBusy) onConfirm();
              }}
            >
              <label htmlFor={inputId} className="label">
                {t('ui.typeToConfirm', { text: '\u0000' })
                  .split('\u0000')
                  .map((part, i) => (i === 0 ? part : [<strong key={i} className="font-bold text-ink">{confirmText}</strong>, part]))}
              </label>
              <input id={inputId} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-autofocus />
            </form>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ConfirmDialog;
