import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyDay } from '@/i18n/pagesGermanyDay';
import { BadgesPanel } from '@/components/portal/BadgesPanel';

registerCopy(pagesGermanyDay);

/** /account/badges — every badge of the client, locked and unlocked (components/portal/BadgesPanel). Private. */
export default function AccountBadges() {
  const { t } = useTranslation();
  usePageTitle(t('badges.title'));
  return (
    <div className="mx-auto max-w-5xl">
      <BadgesPanel />
    </div>
  );
}
