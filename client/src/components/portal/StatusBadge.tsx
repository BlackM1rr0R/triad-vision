import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { STATUS_TONE } from '@/lib/caseStatus';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import type { CaseStatus, DocStatus } from '@/lib/types';

/** Case status pill (shared by the client portal and the admin panel). */
export const StatusBadge = ({ status, className }: { status: CaseStatus; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('badge max-w-full whitespace-normal sm:whitespace-nowrap', STATUS_TONE[status], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {t(`portal.status.${status}`)}
    </span>
  );
};

const DOC_TONE: Record<DocStatus, string> = toneClasses(STATUS_TONES.document);

const DOC_ICON = { PENDING: Clock, ACCEPTED: CheckCircle2, REJECTED: XCircle } as const;

/** Document review status pill. */
export const DocStatusBadge = ({ status, className }: { status: DocStatus; className?: string }) => {
  const { t } = useTranslation();
  const Icon = DOC_ICON[status];
  return (
    <span className={clsx('badge whitespace-nowrap', DOC_TONE[status], className)}>
      <Icon className="size-3.5" aria-hidden />
      {t(`portal.docs.status.${status}`)}
    </span>
  );
};

export default StatusBadge;
