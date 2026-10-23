import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** Workspace / mail modal: adapter over the design-system Modal (Escape closes only the top-most layer). */
export const Dialog = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) => {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} footer={footer} size={size} zIndex={80} closeLabel={t('mail.actions.close')}>
      {children}
    </Modal>
  );
};

export const Confirm = ({ open, onClose, onConfirm, title, message, confirmLabel, loading, danger = true }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: ReactNode; confirmLabel?: string; loading?: boolean; danger?: boolean }) => {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={title}
      message={message ? <span className="text-muted">{message}</span> : undefined}
      confirmLabel={confirmLabel ?? t('mail.actions.delete')}
      cancelLabel={t('mail.actions.cancel')}
      tone={danger ? 'danger' : 'primary'}
      loading={loading}
    />
  );
};
