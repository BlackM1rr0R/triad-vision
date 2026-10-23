import type { ReactNode } from 'react';
import { Modal as UiModal } from '@/components/ui/Modal';

/** Dialog shell of the settlement page (mounted only while open): adapter over the design-system Modal. */
export const Modal = ({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) => (
  <UiModal open onClose={onClose} title={title} footer={footer} size={wide ? 'xl' : 'md'} zIndex={80}>
    {children}
  </UiModal>
);
