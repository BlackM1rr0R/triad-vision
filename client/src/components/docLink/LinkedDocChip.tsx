import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesDocLink } from '@/i18n/pagesDocLink';
import type { CaseDocument } from '@/lib/types';

registerCopy(pagesDocLink);

/**
 * "Added automatically: from the initial documents" on a linked case document (server lib/docLink: one upload for
 * a requirement the initial and the embassy list both have). Nothing for an ordinary upload. `staff` adds whether
 * the copy still follows its source's review.
 */
export const LinkedDocChip = ({ doc, staff = false, className }: { doc: Pick<CaseDocument, 'linkedFromStage' | 'linkDetached'>; staff?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const from = doc.linkedFromStage;
  if (from !== 'INITIAL' && from !== 'EMBASSY') return null;
  const title = staff ? (doc.linkDetached ? t('dlink.admin.detachedHint') : t('dlink.admin.follows')) : t('dlink.hint');
  return (
    <span className={clsx('badge max-w-full gap-1 bg-info-bg text-info-fg', className)} title={title}>
      <Link2 className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{t(`dlink.from.${from}`)}</span>
      {staff && doc.linkDetached && <span className="whitespace-nowrap opacity-80">· {t('dlink.admin.detached')}</span>}
    </span>
  );
};
