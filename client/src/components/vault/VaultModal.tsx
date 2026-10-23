import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';

/** Modal shell used by the vault dialogs: adapter over the design-system Modal. `busy` blocks every way of closing. */
export const VaultModal = ({
  open,
  title,
  onClose,
  children,
  footer,
  busy,
  wide,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  wide?: boolean;
}) => (
  <Modal open={open} onClose={onClose} title={title} footer={footer} busy={busy} size={wide ? 'lg' : 'md'} zIndex={100}>
    {children}
  </Modal>
);

export default VaultModal;
