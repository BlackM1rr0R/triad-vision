import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, Download, Share, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesSite } from '@/i18n/pagesSite';
import { useAuth } from '@/lib/auth';
import { getImpersonation } from '@/lib/api';
import { applyUpdate, enablePush, isIos, isStandalone, pushSupported, pwaState, promptInstall, subscribePwa, syncPush } from '@/lib/pwa';
import { Sheet } from './Sheet';
import { ProblemButton } from './ProblemReport';

registerCopy(pagesSite);

/**
 * Site-wide extras, loaded lazily once the page is idle (main.tsx): the "New version available" toast,
 * the "Ana ekrana əlavə et" install banner (Android prompt / iOS instructions), the push-notification prompt
 * after login and the "Problem bildir" button. Nothing here shows on the very first visit.
 */

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};
const DAY = 86_400_000;
const snoozed = (key: string) => Number(store.get(key) ?? 0) > Date.now();
const snooze = (key: string, days = 30) => store.set(key, String(Date.now() + days * DAY));

/** Visits counted once per browser session; banners wait for the second one. */
const visitCount = () => {
  let n = Number(store.get('tv_visits') ?? 0);
  try {
    if (!sessionStorage.getItem('tv_visit')) {
      sessionStorage.setItem('tv_visit', '1');
      n += 1;
      store.set('tv_visits', String(n));
    }
  } catch {
    /* storage blocked */
  }
  return n;
};

const QUIET = ['/sign/', '/share/', '/survey/', '/workspace/sheet/', '/workspace/pdf/', '/angebot/'];

const usePwa = () => useSyncExternalStore(subscribePwa, () => `${!!pwaState().waiting}|${!!pwaState().installEvent}`);

const HOME_BY_ROLE: Record<string, string> = { CLIENT: '/account', COMPANY: '/company', AGENT: '/agent', STAFF: '/admin', ADMIN: '/admin', SUPER_ADMIN: '/admin' };

const Banner = ({ icon, title, text, children, onClose, closeLabel }: { icon: ReactNode; title: string; text: string; children: ReactNode; onClose: () => void; closeLabel: string }) => (
  <div role="region" aria-label={title} className="fixed inset-x-3 bottom-3 z-[46] mx-auto max-w-md rounded-3xl border border-line bg-card p-4 text-ink shadow-[var(--tv-shadow-raised)] sm:right-6 sm:bottom-6 sm:left-auto sm:mx-0">
    <div className="flex items-start gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sky">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{text}</p>
        <div className="mt-3 flex flex-wrap gap-2">{children}</div>
      </div>
      <button type="button" onClick={onClose} aria-label={closeLabel} className="-m-1.5 grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  </div>
);

export default function SiteExtras() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const pwa = usePwa();
  const [visits] = useState(visitCount);
  const [delayPassed, setDelayPassed] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const quiet = QUIET.some((p) => pathname.startsWith(p)) || !!getImpersonation();

  useEffect(() => {
    const id = window.setTimeout(() => setDelayPassed(true), 12_000);
    return () => window.clearTimeout(id);
  }, []);

  // Update flow: a new service worker is waiting.
  useEffect(() => {
    if (!pwa.startsWith('true')) return;
    toast(t('site.pwa.updateTitle'), { id: 'pwa-update', duration: Infinity, action: { label: t('site.pwa.updateAction'), onClick: applyUpdate } });
  }, [pwa, t]);

  // Launched from the home screen (start_url /?source=pwa): straight to the user's own area.
  const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current || pathname !== '/' || !new URLSearchParams(search).has('source') || !user) return;
    redirected.current = true;
    const home = HOME_BY_ROLE[user.role];
    if (home) navigate(home, { replace: true });
  }, [pathname, search, user, navigate]);

  // A browser that already allowed notifications follows whoever logs in on it.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!user || synced.current === user.id) return;
    synced.current = user.id;
    void syncPush();
  }, [user]);

  const ready = visits >= 2 && delayPassed && !quiet;
  const canPrompt = pwa.endsWith('true');
  const showInstall = ready && !isStandalone() && !hidden.install && !snoozed('tv_install_snooze') && (canPrompt || isIos());
  const showPush =
    ready && !showInstall && !!user && !hidden.push && !snoozed('tv_push_snooze') && pushSupported() && typeof Notification !== 'undefined' && Notification.permission === 'default';

  const closeInstall = () => {
    snooze('tv_install_snooze');
    setHidden((h) => ({ ...h, install: true }));
  };
  const closePush = () => {
    snooze('tv_push_snooze');
    setHidden((h) => ({ ...h, push: true }));
  };

  return (
    <>
      <ProblemButton />
      {showInstall && (
        <Banner icon={<Download className="size-5" aria-hidden />} title={t('site.pwa.installTitle')} text={t('site.pwa.installText')} onClose={closeInstall} closeLabel={t('site.pwa.close')}>
          {canPrompt ? (
            <button
              type="button"
              className="btn-primary btn-sm min-h-11"
              onClick={async () => {
                const outcome = await promptInstall();
                if (outcome !== 'accepted') closeInstall();
                else setHidden((h) => ({ ...h, install: true }));
              }}
            >
              {t('site.pwa.installAction')}
            </button>
          ) : (
            <button type="button" className="btn-primary btn-sm min-h-11" onClick={() => setIosOpen(true)}>
              {t('site.pwa.iosHow')}
            </button>
          )}
          <button type="button" className="btn-sm min-h-11 rounded-full px-3.5 text-sm font-semibold text-muted hover:bg-sunken" onClick={closeInstall}>
            {t('site.pwa.later')}
          </button>
        </Banner>
      )}
      {showPush && (
        <Banner icon={<Bell className="size-5" aria-hidden />} title={t('site.push.promptTitle')} text={t('site.push.promptText')} onClose={closePush} closeLabel={t('site.pwa.close')}>
          <button
            type="button"
            className="btn-primary btn-sm min-h-11"
            onClick={async () => {
              setHidden((h) => ({ ...h, push: true }));
              try {
                const r = await enablePush();
                if (r === 'enabled') toast.success(t('site.push.enabled'));
                else if (r === 'denied') toast.error(t('site.push.denied'));
                else toast.error(t('site.push.unavailable'));
              } catch {
                toast.error(t('site.push.unavailable'));
              }
            }}
          >
            {t('site.push.enable')}
          </button>
          <button type="button" className="btn-sm min-h-11 rounded-full px-3.5 text-sm font-semibold text-muted hover:bg-sunken" onClick={closePush}>
            {t('site.push.later')}
          </button>
        </Banner>
      )}
      <Sheet open={iosOpen} onClose={() => setIosOpen(false)} title={t('site.pwa.iosTitle')} closeLabel={t('site.pwa.close')}>
        <ol className="space-y-3">
          {(t('site.pwa.iosSteps', { returnObjects: true }) as string[]).map((step, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken font-semibold text-ink">{i + 1}</span>
              <span className="pt-1">
                {step}
                {i === 0 && <Share className="ml-1 inline size-4 align-text-bottom text-primary" aria-hidden />}
              </span>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
