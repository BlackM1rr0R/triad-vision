import type { ReactNode } from 'react';
import { Modal } from './Modal';

/**
 * "Click to open details" dialog of the public site: adapter over the design-system Modal
 * (bottom sheet on phones, centred card above; plain dimmed backdrop, no blur).
 */
export const DetailModal = ({
  open,
  onClose,
  title,
  eyebrow,
  icon,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <Modal
    open={open}
    onClose={onClose}
    title={<span className="font-display text-xl font-extrabold">{title}</span>}
    eyebrow={eyebrow}
    icon={icon ? <span className="grid size-12 place-items-center rounded-xl bg-brand-600 text-white">{icon}</span> : undefined}
    footer={footer || undefined}
    size="md"
    zIndex={90}
    bodyClassName="leading-relaxed text-muted"
  >
    {children}
  </Modal>
);
