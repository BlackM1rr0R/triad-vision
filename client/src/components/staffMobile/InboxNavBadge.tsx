import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { pagesStaffMobile } from '@/i18n/pagesStaffMobile';
import { useMyWork } from '@/components/today/api';

registerCopy(pagesStaffMobile);

/** Unanswered client messages on the "Mesajlar" nav item (same cached "my work" query as the phone tab bar). */
export const InboxNavBadge = ({ collapsed }: { collapsed: boolean }) => {
  const { t } = useTranslation();
  const { data } = useMyWork('mine');
  const n = data?.counts.byKind.client_message ?? 0;
  if (!n) return null;
  const label = t('smob.inbox.navBadge', { count: n });
  return (
    <span
      title={label}
      aria-label={label}
      className={clsx(
        'grid min-w-5 place-items-center rounded-full bg-danger px-1.5 code-id text-[11px] leading-[18px] font-medium text-white tabular-nums',
        collapsed ? 'absolute top-0.5 right-0.5 min-w-4 text-[10px] leading-4' : 'ml-auto',
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
};
