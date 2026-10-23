import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Accessibility } from 'lucide-react';
import { usePrefs, type Prefs } from '@/lib/prefs';
import { setHoverReading, setLang, setRate } from './speech';

// The panel (all the controls) loads on first open; the button and the global effects stay in the shell.
const loadPanel = () => import('./AccessibilityPanel');
const Panel = lazy(loadPanel);

// ─── Side effects of individual prefs ───────────────────────────────────────

/** Translucent band following the pointer (`a11y-ruler`). */
const ReadingRuler = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) ref.current.style.transform = `translateY(${e.clientY}px)`;
    };
    window.addEventListener('mousemove', move, { passive: true });
    return () => window.removeEventListener('mousemove', move);
  }, []);
  return <div ref={ref} className="a11y-ruler-band" aria-hidden />;
};

/** Flashes the screen edge when a toast (sonner) appears (`a11y-visual-alerts`). */
const useVisualAlerts = (on: boolean) => {
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const flash = () => {
      const html = document.documentElement;
      html.classList.remove('a11y-flash');
      void html.offsetWidth; // restart the animation
      html.classList.add('a11y-flash');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => html.classList.remove('a11y-flash'), 2200);
    };
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of Array.from(m.addedNodes)) {
          if (n instanceof Element && (n.matches('[data-sonner-toast]') || n.querySelector('[data-sonner-toast]'))) {
            flash();
            return;
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      window.clearTimeout(timer);
      document.documentElement.classList.remove('a11y-flash');
    };
  }, [on]);
};

/** Keeps the speech engine in sync with the preferences and the UI language. */
const useSpeechSync = (prefs: Prefs, lang: string) => {
  useEffect(() => {
    setRate(prefs.speechRate);
  }, [prefs.speechRate]);
  useEffect(() => {
    setLang(lang);
  }, [lang]);
  useEffect(() => {
    setHoverReading(prefs.speech);
    return () => setHoverReading(false);
  }, [prefs.speech]);
};

// ─── Widget (button + panel + global effects) ───────────────────────────────

/**
 * Floating accessibility button and panel. Render inside a floating-actions stack (public site) or
 * on its own (`standalone`, admin panel). Alt+A toggles the panel from anywhere.
 */
export const AccessibilityWidget = ({ standalone = false, panelClass }: { standalone?: boolean; panelClass?: string }) => {
  const { t, i18n } = useTranslation();
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useVisualAlerts(prefs.visualAlerts);
  useSpeechSync(prefs, i18n.resolvedLanguage ?? 'az');

  // Alt+A opens / closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => {
    setOpen(false);
    btnRef.current?.focus({ preventScroll: true });
  };

  const button = (
    <motion.button
      ref={btnRef}
      type="button"
      data-a11y-button
      aria-label={t('a11y.open')}
      title={t('a11y.open')}
      aria-haspopup="dialog"
      aria-expanded={open}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 1.6, type: 'spring' }}
      whileHover={{ scale: 1.08 }}
      onClick={() => (open ? close() : setOpen(true))}
      onPointerEnter={() => void loadPanel()}
      onFocus={() => void loadPanel()}
      className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-xl shadow-brand-600/40 hover:bg-brand-700"
    >
      <Accessibility className="size-7" aria-hidden />
    </motion.button>
  );

  return (
    <div data-a11y-widget>
      {standalone ? <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">{button}</div> : button}
      {/* Portal: the floating-actions stack is its own stacking context (z-40), which would put the panel under the site header. */}
      {createPortal(
        <div data-a11y-widget>
          <AnimatePresence>
            {open && (
              <Suspense key="a11y-panel" fallback={null}>
                <Panel onClose={close} panelClass={panelClass} titleId={titleId} />
              </Suspense>
            )}
          </AnimatePresence>
          {prefs.ruler && <ReadingRuler />}
        </div>,
        document.body,
      )}
    </div>
  );
};
