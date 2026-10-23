import type { ReactNode } from 'react';
import { Modal as UiModal } from '@/components/ui/Modal';

/** Small dialog for the calls / callback UI: adapter over the design-system Modal (bottom sheet on phones, no blur). */
export const Modal = ({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) => (
  <UiModal open={open} onClose={onClose} title={title} size={wide ? 'lg' : 'sm'} zIndex={95} bodyClassName="text-sm">
    {children}
  </UiModal>
);
