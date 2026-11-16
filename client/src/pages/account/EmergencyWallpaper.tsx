import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Smartphone } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesEmergencyWallpaper } from '@/i18n/pagesEmergencyWallpaper';
import type { ArrivalCardData } from '@/lib/germanyDay';
import type { WallpaperFields } from '@/lib/emergencyWallpaper/layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { WallpaperBuilder, WallpaperHowTo } from '@/components/emergencyWallpaper/WallpaperBuilder';

registerCopy(pagesEmergencyWallpaper);

/**
 * /account/emergency-wallpaper — the lock-screen emergency wallpaper, prefilled from the client's own approved case
 * (GET /api/account/germany/arrival-card: employer + phone, German address) and profile (name). Without an
 * approved case only the name is prefilled. Rendering and download happen on the device; nothing is sent back.
 */
export default function AccountEmergencyWallpaper() {
  const { t } = useTranslation();
  usePageTitle(t('ewp.portalTitle'));
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['emergency-wallpaper-card'],
    queryFn: async () => {
      try {
        return (await api.get<{ card: ArrivalCardData }>('/account/germany/arrival-card')).data.card;
      } catch {
        return null; // no approved case yet: nothing to prefill but the name
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const card = q.data ?? null;
  const prefill: Partial<WallpaperFields> = {
    name: card?.holder.name ?? [user?.firstName, user?.lastName].filter(Boolean).join(' '),
    employerName: card?.employer?.name ?? '',
    employerPhone: card?.employer?.phone ?? '',
    address: card?.address.text ?? '',
  };
  const fromCase = !!(card && (prefill.employerName || prefill.employerPhone || prefill.address));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="type-page-title flex items-center gap-2 text-ink">
          <Smartphone className="size-6 text-primary" aria-hidden /> {t('ewp.portalTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('ewp.portalSubtitle')}</p>
      </header>
      {q.isLoading ? <Skeleton className="h-96 rounded-3xl" /> : <WallpaperBuilder key={card?.generatedAt ?? 'none'} prefill={prefill} prefilledNote={fromCase} />}
      <WallpaperHowTo />
    </div>
  );
}
