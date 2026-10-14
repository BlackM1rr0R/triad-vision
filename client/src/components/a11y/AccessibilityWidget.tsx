import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Accessibility, Ear, Eye, Minus, Monitor, Moon, Orbit, Pause, Play, Plus, RotateCcw, Square, Sun, Volume2, X } from 'lucide-react';
import clsx from 'clsx';
import { DEFAULT_PREFS, resetPrefs, setPrefs, usePrefs, type ColorMode, type FontScale, type LetterSpacing, type LineHeight, type Prefs, type Theme } from '@/lib/prefs';
import { pause, readPage, resume, setHoverReading, setLang, setRate, speechSupported, stop, useSpeechState, voiceIsFallback } from './speech';

const FONT_STEPS: FontScale[] = [100, 112, 125, 150];
const LINE_STEPS: LineHeight[] = [1, 1.5, 2];
const SPACING_STEPS: LetterSpacing[] = [0, 0.05, 0.1];
const RATE_STEPS = [0.75, 1, 1.25, 1.5];

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// ─── Small controls ─────────────────────────────────────────────────────────

const Toggle = ({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span id={id} className="block text-sm font-medium text-navy-900">
          {label}
        </span>
        {hint && <span className="mt-0.5 block text-xs leading-snug text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span className="sr-only">{checked ? t('a11y.on') : t('a11y.off')}</span>
        <span aria-hidden className={clsx('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
};

const Stepper = <T,>({ label, value, steps, format, onChange }: { label: string; value: T; steps: T[]; format: (v: T) => string; onChange: (v: T) => void }) => {
  const { t } = useTranslation();
  const idx = Math.max(0, steps.indexOf(value));
  const btn = 'grid size-9 shrink-0 place-items-center rounded-lg border border-line text-navy-900 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm font-medium text-navy-900">{label}</span>
      <span className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={idx === 0} onClick={() => onChange(steps[idx - 1])} aria-label={`${label}: ${t('a11y.vision.decrease')}`}>
          <Minus className="size-4" aria-hidden />
        </button>
        <output className="min-w-[3.75rem] text-center text-sm font-semibold text-navy-900 tabular-nums" aria-live="polite" aria-label={label}>
          {format(value)}
        </output>
        <button type="button" className={btn} disabled={idx === steps.length - 1} onClick={() => onChange(steps[idx + 1])} aria-label={`${label}: ${t('a11y.vision.increase')}`}>
          <Plus className="size-4" aria-hidden />
        </button>
      </span>
    </div>
  );
};

const Segmented = <T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) => (
  <div className="py-1.5">
    <span className="mb-1.5 block text-sm font-medium text-navy-900">{label}</span>
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-xl bg-surface p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition',
            value === o.value ? 'bg-card text-brand-700 shadow-sm ring-1 ring-line' : 'text-muted hover:text-navy-900',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

const Group = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
  <section className="border-t border-line pt-4 first:border-t-0 first:pt-0" aria-label={title}>
    <h3 className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-brand-700 uppercase">
      <span className="grid size-6 place-items-center rounded-md bg-brand-100 text-brand-700" aria-hidden>
        {icon}
      </span>
      {title}
    </h3>
    <div className="divide-y divide-line/60">{children}</div>
  </section>
);

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

// ─── Panel ──────────────────────────────────────────────────────────────────

const Panel = ({ onClose, panelClass, titleId }: { onClose: () => void; panelClass?: string; titleId: string }) => {
  const { t, i18n } = useTranslation();
  const prefs = usePrefs();
  const speech = useSpeechState();
  const ref = useRef<HTMLDivElement>(null);
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const fallbackVoice = speechSupported && voiceIsFallback(lang);

  // Focus the panel on open, trap Tab inside, Esc closes.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const first = node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click outside closes.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (ref.current && !ref.current.contains(el) && !el?.closest('[data-a11y-button]')) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const themeOptions: { value: Theme; label: string; icon: ReactNode }[] = [
    { value: 'light', label: t('a11y.theme.light'), icon: <Sun className="size-3.5" aria-hidden /> },
    { value: 'dark', label: t('a11y.theme.dark'), icon: <Moon className="size-3.5" aria-hidden /> },
    { value: 'system', label: t('a11y.theme.system'), icon: <Monitor className="size-3.5" aria-hidden /> },
  ];
  const colorOptions: { value: ColorMode; label: string }[] = [
    { value: 'normal', label: t('a11y.vision.colorNormal') },
    { value: 'gray', label: t('a11y.vision.colorGray') },
    { value: 'invert', label: t('a11y.vision.colorInvert') },
  ];

  const ctl = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-navy-900 transition hover:border-brand-400 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-lenis-prevent
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={clsx(
        'fixed inset-x-2 bottom-2 z-[90] flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-[0_30px_80px_-20px_rgba(5,15,36,0.55)] outline-none sm:inset-x-auto sm:right-6 sm:w-[24rem]',
        panelClass,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 id={titleId} className="flex items-center gap-2 font-display text-base font-bold text-navy-900">
          <Accessibility className="size-5 text-brand-600" aria-hidden />
          {t('a11y.title')}
          <kbd className="rounded border border-line px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted">Alt+A</kbd>
        </h2>
        <button type="button" onClick={onClose} aria-label={t('a11y.close')} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-navy-900">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
        <Group icon={<Eye className="size-3.5" />} title={t('a11y.groups.vision')}>
          <Segmented label={t('a11y.theme.label')} value={prefs.theme} options={themeOptions} onChange={(theme) => setPrefs({ theme })} />
          <Toggle label={t('a11y.vision.contrast')} checked={prefs.contrast} onChange={(contrast) => setPrefs({ contrast })} />
          <Stepper label={t('a11y.vision.fontSize')} value={prefs.fontScale} steps={FONT_STEPS} format={(v) => `${v}%`} onChange={(fontScale) => setPrefs({ fontScale })} />
          <Stepper label={t('a11y.vision.lineHeight')} value={prefs.lineHeight} steps={LINE_STEPS} format={(v) => (v === 1 ? t('a11y.vision.normal') : `${v.toFixed(1)}×`)} onChange={(lineHeight) => setPrefs({ lineHeight })} />
          <Stepper
            label={t('a11y.vision.letterSpacing')}
            value={prefs.letterSpacing}
            steps={SPACING_STEPS}
            format={(v) => (v === 0 ? t('a11y.vision.normal') : `+${v.toFixed(2)}em`)}
            onChange={(letterSpacing) => setPrefs({ letterSpacing })}
          />
          <Toggle label={t('a11y.vision.readableFont')} checked={prefs.readableFont} onChange={(readableFont) => setPrefs({ readableFont })} />
          <Toggle label={t('a11y.vision.bigCursor')} checked={prefs.bigCursor} onChange={(bigCursor) => setPrefs({ bigCursor })} />
          <Toggle label={t('a11y.vision.links')} checked={prefs.highlightLinks} onChange={(highlightLinks) => setPrefs({ highlightLinks })} />
          <Toggle label={t('a11y.vision.hideImages')} checked={prefs.hideImages} onChange={(hideImages) => setPrefs({ hideImages })} />
          <Segmented label={t('a11y.vision.colorMode')} value={prefs.colorMode} options={colorOptions} onChange={(colorMode) => setPrefs({ colorMode })} />
          <Toggle label={t('a11y.vision.ruler')} checked={prefs.ruler} onChange={(ruler) => setPrefs({ ruler })} />
          <Toggle label={t('a11y.vision.focus')} checked={prefs.focusRing} onChange={(focusRing) => setPrefs({ focusRing })} />
        </Group>

        <Group icon={<Orbit className="size-3.5" />} title={t('a11y.groups.motion')}>
          <Toggle label={t('a11y.motion.stop')} hint={t('a11y.motion.hint')} checked={prefs.noMotion} onChange={(noMotion) => setPrefs({ noMotion })} />
        </Group>

        <Group icon={<Volume2 className="size-3.5" />} title={t('a11y.groups.speech')}>
          {speechSupported ? (
            <>
              <Toggle label={t('a11y.speech.toggle')} hint={t('a11y.speech.hint')} checked={prefs.speech} onChange={(on) => setPrefs({ speech: on })} />
              <div className="py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" className={ctl} onClick={() => readPage(document.querySelector('main'))}>
                    <Play className="size-3.5" aria-hidden /> {t('a11y.speech.readPage')}
                  </button>
                  {speech.status === 'reading' && (
                    <button type="button" className={ctl} onClick={pause}>
                      <Pause className="size-3.5" aria-hidden /> {t('a11y.speech.pause')}
                    </button>
                  )}
                  {speech.status === 'paused' && (
                    <button type="button" className={ctl} onClick={resume}>
                      <Play className="size-3.5" aria-hidden /> {t('a11y.speech.resume')}
                    </button>
                  )}
                  <button type="button" className={ctl} onClick={stop} disabled={speech.status === 'idle'}>
                    <Square className="size-3.5" aria-hidden /> {t('a11y.speech.stop')}
                  </button>
                </div>
                {speech.status !== 'idle' && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900" aria-live="polite">
                    <span className="font-semibold">{t('a11y.speech.reading')}:</span> {speech.current}…
                  </p>
                )}
              </div>
              <Stepper label={t('a11y.speech.rate')} value={prefs.speechRate} steps={RATE_STEPS} format={(v) => `${v}×`} onChange={(speechRate) => setPrefs({ speechRate })} />
              {fallbackVoice && <p className="py-2 text-xs leading-snug text-muted">{t('a11y.speech.noVoice')}</p>}
            </>
          ) : (
            <p className="py-2 text-xs leading-snug text-muted">{t('a11y.speech.unsupported')}</p>
          )}
          <div className="py-2">
            <p className="text-sm font-medium text-navy-900">{t('a11y.speech.keyboard')}</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">{t('a11y.speech.keyboardHint')}</p>
          </div>
        </Group>

        <Group icon={<Ear className="size-3.5" />} title={t('a11y.groups.hearing')}>
          <p className="py-2 text-xs leading-snug text-muted">
            {t('a11y.hearing.info')}{' '}
            <Link to="/contact" onClick={onClose} className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
              {t('a11y.hearing.contactLink')}
            </Link>
          </p>
          <Toggle label={t('a11y.hearing.visualAlerts')} hint={t('a11y.hearing.visualAlertsHint')} checked={prefs.visualAlerts} onChange={(visualAlerts) => setPrefs({ visualAlerts })} />
        </Group>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface/70 px-4 py-3">
        <Link to="/accessibility" onClick={onClose} className="text-xs font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700">
          {t('a11y.statement')}
        </Link>
        <button type="button" onClick={() => resetPrefs()} className={ctl} disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS)}>
          <RotateCcw className="size-3.5" aria-hidden /> {t('a11y.reset')}
        </button>
      </div>
    </motion.div>
  );
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
          <AnimatePresence>{open && <Panel key="a11y-panel" onClose={close} panelClass={panelClass} titleId={titleId} />}</AnimatePresence>
          {prefs.ruler && <ReadingRuler />}
        </div>,
        document.body,
      )}
    </div>
  );
};
