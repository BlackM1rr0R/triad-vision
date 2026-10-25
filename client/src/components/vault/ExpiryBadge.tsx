import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CalendarClock } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { VaultDoc } from './api';

/** Expiry badge of a vault document: expired / expires in N days / valid until … (nothing without a date). */
export const ExpiryBadge = ({ doc, className }: { doc: Pick<VaultDoc, 'expiry' | 'expiresAt'>; className?: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { status, daysLeft } = doc.expiry;
  if (status === 'none' || !doc.expiresAt) return null;
  const tone =
    status === 'expired'
      ? 'bg-danger-bg text-danger-fg'
      : status === 'soon'
        ? 'bg-warning-bg text-warning-fg'
        : 'bg-sunken text-muted';
  const label =
    status === 'expired' ? t('vault.expiry.expired') : status === 'soon' ? t('vault.expiry.soon', { count: daysLeft ?? 0 }) : t('vault.expiry.valid', { date: date(doc.expiresAt) });
  return (
    <span className={clsx('badge inline-flex items-center gap-1 whitespace-nowrap', tone, className)}>
      <CalendarClock className="size-3.5" aria-hidden />
      {label}
    </span>
  );
};

export default ExpiryBadge;
