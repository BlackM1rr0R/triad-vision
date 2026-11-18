import { lazy, Suspense, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, m as motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';

// The menu content (tool titles, featured list request) is its own chunk: loaded on first hover / focus / open.
const loadPanel = () => import('./ToolsMenuPanel');
const Panel = lazy(loadPanel);
const MobilePanel = lazy(() => loadPanel().then((m) => ({ default: m.MobileToolsContent })));

const EASE = [0.22, 1, 0.36, 1] as const;

/** Mobile menu group content: "all tools" + the featured tools (lazy). */
export const MobileToolsMenu = () => (
  <Suspense fallback={<div className="h-24" aria-hidden />}>
    <MobilePanel />
  </Suspense>
);

/**
 * Desktop header item "Tools": a disclosure button with the featured tools (admin order, Tool analytics → Featured
 * tools) and a link to all tools — built like the audience menus (plain links, opens on hover / click / Arrow
 * down, Escape closes and returns focus).
 */
export const ToolsMenu = ({
  open,
  onOpen,
  onClose,
  active,
  className,
  activeClass,
  underline,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  active: boolean;
  className: string;
  activeClass: string;
  underline: (on: boolean) => ReactNode;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (focusFirst.current) {
      focusFirst.current = false;
      // The panel may still be loading: try for a moment.
      let tries = 0;
      const focus = () => {
        const a = panel.current?.querySelector<HTMLElement>('a');
        if (a) a.focus();
        else if (tries++ < 20) window.setTimeout(focus, 50);
      };
      requestAnimationFrame(focus);
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusFirst.current = true;
      if (open) panel.current?.querySelector<HTMLElement>('a')?.focus();
      else onOpen();
    }
  };

  return (
    <div
      ref={root}
      className="relative"
      onMouseEnter={() => {
        window.clearTimeout(leaveTimer.current);
        void loadPanel();
        onOpen();
      }}
      onMouseLeave={() => {
        leaveTimer.current = window.setTimeout(onClose, 160);
      }}
      onFocus={() => void loadPanel()}
      onBlur={(e) => {
        if (!root.current?.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? onClose() : onOpen())}
        onKeyDown={onKeyDown}
        className={clsx(className, active && activeClass)}
      >
        {t('siteNav.tools')}
        <ChevronDown className={clsx('size-3.5 opacity-60 transition-transform', open && 'rotate-180')} aria-hidden />
        {underline(active || open)}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            id={id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute top-full left-0 z-10 w-[34rem] pt-2"
          >
            <Suspense fallback={<div className="h-48 rounded-2xl border border-line bg-raised shadow-[var(--tv-shadow-raised)]" aria-hidden />}>
              <Panel />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
