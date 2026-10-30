import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellRing } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesSite } from '@/i18n/pagesSite';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { currentPushSubscription, disablePush, enablePush, pushSupported } from '@/lib/pwa';

registerCopy(pagesSite); // site.push.* (denied / unavailable)
registerCopy(pagesPortalExtras);

/**
 * Browser notifications on THIS device (Web Push subscription), next to the account-wide "push" preference in
 * Profile › Notifications and on the portal notification pages. Renders nothing where Web Push is unsupported.
 */
export const BrowserPushSwitch = ({ className, disabled }: { className?: string; disabled?: boolean }) => {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!pushSupported()) return;
    void currentPushSubscription().then((s) => setOn(!!s && Notification.permission === 'granted'));
  }, []);
  if (!pushSupported() || on === null) return null;
  return (
    <div className={clsx('flex items-center justify-between gap-3 rounded-xl border border-line p-4', className)}>
      <label htmlFor={id} className="flex min-w-0 items-start gap-3">
        <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{t('px.notif.browserPush')}</span>
          <span className="mt-0.5 block text-xs text-muted">{t('px.notif.browserPushHint')}</span>
        </span>
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="size-6 shrink-0 accent-primary"
        checked={on}
        disabled={busy || disabled}
        onChange={async (e) => {
          setBusy(true);
          try {
            if (e.target.checked) {
              const r = await enablePush().catch(() => 'unavailable' as const);
              setOn(r === 'enabled');
              if (r === 'denied') toast.error(t('site.push.denied'));
              else if (r === 'unavailable') toast.error(t('site.push.unavailable'));
            } else {
              await disablePush();
              setOn(false);
            }
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
};
