import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/Modal';

/** Small dialog for the site features: adapter over the design-system Modal (bottom sheet on phones, no blur). */
export const Sheet = ({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <Modal open={open} onClose={onClose} title={title} closeLabel={closeLabel} footer={footer} size="md" zIndex={85}>
    {children}
  </Modal>
);
