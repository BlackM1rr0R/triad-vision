import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, MessageSquareReply } from 'lucide-react';
import type { CaseStatus } from '@/lib/types';
import { fullName } from '@/components/admin/labels';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { SwipeRow } from './SwipeRow';
import { StatusSheet } from './StatusSheet';
import { useIsPhone } from './useIsPhone';

registerCopy(pagesStaffMobile);

/**
 * Cases list card on phones: swipe right = reply (the caller's reply UI, e.g. the quick drawer's composer), swipe
 * left = status sheet; the same two actions as large buttons under the card. Tablets / desktops: the card as is.
 */
export const MobileCaseSwipe = ({
  c,
  onReply,
  children,
}: {
  c: { id: string; number: string; status: CaseStatus; client: { firstName: string; lastName: string } };
  onReply: () => void;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [status, setStatus] = useState(false);
  if (!phone) return <>{children}</>;
  return (
    <>
      <SwipeRow
        right={{ label: t('smob.cases.reply'), icon: MessageSquareReply, tone: 'primary', onTrigger: onReply }}
        left={{ label: t('smob.cases.status'), icon: ArrowRightLeft, tone: 'neutral', onTrigger: () => setStatus(true) }}
      >
        {children}
      </SwipeRow>
      <div className="mt-1.5 grid grid-cols-2 gap-2" aria-label={`${c.number} · ${fullName(c.client)}`} role="group">
        <button type="button" className="btn-secondary min-h-11 justify-center" onClick={onReply}>
          <MessageSquareReply className="size-4" aria-hidden /> {t('smob.cases.reply')}
        </button>
        <button type="button" className="btn-secondary min-h-11 justify-center" onClick={() => setStatus(true)}>
          <ArrowRightLeft className="size-4" aria-hidden /> {t('smob.cases.status')}
        </button>
      </div>
      <StatusSheet open={status} onClose={() => setStatus(false)} caseId={c.id} number={c.number} status={c.status} />
    </>
  );
};
