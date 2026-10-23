import type { ReactNode } from 'react';
import { ConfirmDialog as UiConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Portal confirmation dialog: adapter over the design-system ConfirmDialog (role="alertdialog"). */
export const ConfirmDialog = ({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <UiConfirmDialog
    open={open}
    title={title}
    message={children}
    confirmLabel={confirmLabel}
    tone={danger ? 'danger' : 'primary'}
    busy={busy}
    onConfirm={onConfirm}
    onClose={onClose}
    zIndex={100}
  />
);

export default ConfirmDialog;
