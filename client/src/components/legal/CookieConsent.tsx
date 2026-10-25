import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Cookie, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { CONSENT_OPEN_EVENT, getConsent, setConsent } from '@/lib/consent';
import { registerCopy } from '@/i18n';
import { cookieConsentCopy } from '@/i18n/cookieConsent';

registerCopy(cookieConsentCopy);

/** Version of the published cookie policy ('1' until one is published). Changing it asks everyone again. */
const fetchCookieVersion = async (): Promise<string> => {
  try {
    const res = await fetch('/api/legal/cookies', { credentials: 'include' });
    if (!res.ok) return '1';
    const data = (await res.json()) as { document?: { version?: string } };
    return data.document?.version ?? '1';
  } catch {
    return '1';
  }
};
/** One request per page load, shared by the delayed check and an early click. */
let versionRequest: Promise<string> | null = null;
const cookieVersion = () => (versionRequest ??= fetchCookieVersion());

const Toggle = ({ checked, disabled, onChange, labelledBy }: { checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void; labelledBy: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-labelledby={labelledBy}
    disabled={disabled}
    onClick={() => onChange?.(!checked)}
    className={clsx(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed',
      checked ? 'bg-primary' : 'bg-line-strong',
      disabled && 'opacity-60',
    )}
  >
    <span className={clsx('inline-block size-5 rounded-full bg-card shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
  </button>
);

/**
 * Cookie consent banner (replaces the old informational notice). First visit: "Accept all" /
 * "Necessary only" / "Settings" with equal weight (no nudging, EDPB guidelines). The footer link
 * "Cookie settings" re-opens the settings view (lib/consent.ts → openConsentSettings). A new published
 * cookie policy version asks again. Nothing optional is loaded before a choice.
 */
export const CookieConsent = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'banner' | 'settings'>('banner');
  // Set once the visitor chose: a version check still in flight must not reopen the banner.
  const decided = useRef(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    let alive = true;
    // First visit (no choice stored): the banner is part of the first render. Opening it seconds later made
    // it the page's Largest Contentful Paint on phones (a late, large text block). The policy version is
    // still fetched after the page settles; a click before that waits for it (save).
    if (!getConsent()) {
      setView('banner');
      setOpen(true);
    }
    // A moment after the page settles, so the version check never competes with the first paint.
    const id = window.setTimeout(() => {
      void cookieVersion().then((v) => {
        if (!alive || decided.current) return;
        const current = getConsent();
        if (!current || current.v !== v) {
          setAnalytics(current?.analytics ?? false);
          setMarketing(current?.marketing ?? false);
          setView('banner');
          setOpen(true);
        }
      });
    }, 1500);
    const reopen = () => {
      const current = getConsent();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setView('settings');
      setOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, reopen);
    return () => {
      alive = false;
      window.clearTimeout(id);
      window.removeEventListener(CONSENT_OPEN_EVENT, reopen);
    };
  }, []);

  const save = (choice: { analytics: boolean; marketing: boolean }, source: 'COOKIE_BANNER' | 'COOKIE_SETTINGS') => {
    const loggedIn = !!user;
    decided.current = true;
    setOpen(false);
    // Normally the version is known already; on a very quick first-visit click, record it once it arrives.
    void cookieVersion().then((v) => {
      setConsent(choice, { v, source, loggedIn });
    });
  };
  const source = view === 'settings' ? 'COOKIE_SETTINGS' : 'COOKIE_BANNER';

  const categories = [
    { key: 'necessary', checked: true, disabled: true, onChange: undefined },
    { key: 'analytics', checked: analytics, disabled: false, onChange: setAnalytics },
    { key: 'marketing', checked: marketing, disabled: false, onChange: setMarketing },
  ] as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${uid}-title`}
          initial={{ y: 40 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          data-bnav-lift
          className="fixed inset-x-3 bottom-3 z-[60] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-line bg-card p-4 shadow-[var(--tv-shadow-raised)] sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-md sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="hidden size-11 shrink-0 place-items-center rounded-xl chip-soft sm:grid">
              {view === 'settings' ? <ShieldCheck className="size-5" aria-hidden /> : <Cookie className="size-5" aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={`${uid}-title`} className="type-card-title text-ink">
                {view === 'settings' ? t('legalDocs.cookie.settingsTitle') : t('legalDocs.cookie.title')}
              </h2>
              {view === 'banner' && <p className="mt-1.5 text-xs leading-relaxed text-muted">{t('legalDocs.cookie.text')}</p>}
            </div>
          </div>

          {view === 'settings' && (
            <ul className="mt-3 space-y-2">
              {categories.map((c) => (
                <li key={c.key} className="flex items-start gap-3 rounded-2xl border border-line bg-sunken p-3">
                  <div className="min-w-0 flex-1">
                    <p id={`${uid}-${c.key}`} className="text-sm font-semibold text-ink">
                      {t(`legalDocs.cookie.categories.${c.key}.title`)}
                      {c.disabled && <span className="ml-2 text-[11px] font-medium text-muted">{t('legalDocs.cookie.always')}</span>}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{t(`legalDocs.cookie.categories.${c.key}.text`)}</p>
                  </div>
                  <Toggle checked={c.checked} disabled={c.disabled} onChange={c.onChange} labelledBy={`${uid}-${c.key}`} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <Link to="/cookies" className="font-semibold text-link hover:underline">
              {t('legalDocs.cookie.policy')}
            </Link>
            <Link to="/privacy" className="font-semibold text-link hover:underline">
              {t('legalDocs.cookie.privacy')}
            </Link>
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {view === 'settings' ? (
              <>
                <button type="button" className="btn-secondary btn-sm min-h-11" onClick={() => save({ analytics, marketing }, source)}>
                  {t('legalDocs.cookie.save')}
                </button>
                <button type="button" className="btn-primary btn-sm min-h-11" onClick={() => save({ analytics: true, marketing: true }, source)}>
                  {t('legalDocs.cookie.acceptAll')}
                </button>
              </>
            ) : (
              <>
                {/* Equal prominence for "accept" and "reject" (no dark pattern). */}
                <button type="button" className="btn-primary btn-sm min-h-11" onClick={() => save({ analytics: false, marketing: false }, source)}>
                  {t('legalDocs.cookie.necessaryOnly')}
                </button>
                <button type="button" className="btn-primary btn-sm min-h-11" onClick={() => save({ analytics: true, marketing: true }, source)}>
                  {t('legalDocs.cookie.acceptAll')}
                </button>
                <button type="button" className="btn-secondary btn-sm min-h-11 sm:col-span-2" onClick={() => setView('settings')}>
                  {t('legalDocs.cookie.settings')}
                </button>
              </>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
