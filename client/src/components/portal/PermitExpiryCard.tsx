import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { IdCard } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesPermits } from '@/i18n/pagesPermits';
import { PermitChip, type PermitItem } from '@/components/postArrival/PermitPanel';
import type { ExpiryTone } from '@/components/expiry/Expiry';

registerCopy(pagesPermits);

// GET /api/account/permits (server lib/permits/service.ts clientPermits)
interface Item {
  item: PermitItem;
  expiresAt: string;
  daysLeft: number;
  tone: ExpiryTone;
}

/**
 * Portal home after the visa: residence permit / EU Blue Card, health insurance and passport with the
 * days left (the reminders link here, #permits). Renders nothing while there is no date.
 */
export const PermitExpiryCard = () => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const q = useQuery({ queryKey: ['account', 'permits'], queryFn: async () => (await api.get<{ items: Item[] }>('/account/permits')).data.items });
  const items = q.data ?? [];
  if (!items.length) return null;
  return (
    <section id="permits" className="card scroll-mt-24 p-5 sm:p-6" aria-labelledby="permits-title">
      <h2 id="permits-title" className="type-card-title flex items-center gap-2">
        <IdCard className="size-5 text-link" aria-hidden /> {t('permits.portal.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('permits.portal.intro')}</p>
      <ul className="mt-4 divide-y divide-line">
        {items.map((i) => (
          <li key={`${i.item}-${i.expiresAt}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{t(`permits.items.${i.item}`)}</span>
              <span className="block text-xs text-muted">{t('permits.until', { date: date(i.expiresAt) })}</span>
            </span>
            <PermitChip tone={i.tone} days={i.daysLeft} />
            {i.item === 'passport' && (
              <Link to="/account/profile" className="w-full text-xs text-link hover:underline">
                {t('permits.portal.profile')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default PermitExpiryCard;
