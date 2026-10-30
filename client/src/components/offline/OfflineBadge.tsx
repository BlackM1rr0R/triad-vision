import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { WifiOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { initOffline, OFFLINE_PAGE, useOfflineIndex } from '@/lib/offlineDocs';
import { useOnline } from './useOffline';

/**
 * Client portal: loads the offline index once per login (drops expired items and anything of another user) and,
 * while the device is offline, shows a strip "İnternet yoxdur — oflayn saxlanmış sənədlər açıla bilər" with a link
 * to the static offline page.
 */
export const OfflineBadge = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const online = useOnline();
  const idx = useOfflineIndex();

  useEffect(() => {
    void initOffline(user?.id ?? null);
  }, [user?.id]);

  if (online) return null;
  return (
    <div className={clsx('flex flex-wrap items-center gap-2 rounded-2xl border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-fg', className)} role="status">
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t('cplus.offline.offlineNow')}</span>
      {idx && (
        <a href={OFFLINE_PAGE} className="font-semibold underline underline-offset-2">
          {t('cplus.offline.open')}
        </a>
      )}
    </div>
  );
};

export default OfflineBadge;
