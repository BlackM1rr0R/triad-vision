/**
 * Legacy import path. The canonical dialog lives in the design system (components/ui/Modal); this file
 * only re-exports it so the ~60 admin screens keep working unchanged.
 */
export { Modal, type ModalProps } from '@/components/ui/Modal';
export { useOverlay } from '@/components/ui/overlay';
