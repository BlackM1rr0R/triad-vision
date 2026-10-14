import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from './Modal';

export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  children?: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          {tone === 'danger' && <AlertTriangle className="size-4 text-danger" aria-hidden />}
          {title}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose} disabled={loading}>
            {t('admin.common.cancel')}
          </button>
          <button
            type="button"
            data-autofocus
            className={tone === 'danger' ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Spinner className="size-3.5" />}
            {confirmLabel ?? t('admin.common.confirm')}
          </button>
        </>
      }
    >
      {(message || children) && (
        <div className="space-y-3 text-sm text-ink/80">
          {message && <div>{message}</div>}
          {children}
        </div>
      )}
    </Modal>
  );
};
