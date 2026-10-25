import { lazy, Suspense, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import clsx from 'clsx';
import { isSearchOpen, openSearch, toggleSearch, useSearchPalette } from './searchStore';

export { closeSearch, openSearch, toggleSearch, useSearchPalette } from './searchStore';

// The dialog (index, ranking, results UI) loads on first open; the button and shortcuts are tiny.
const loadDialog = () => import('./SearchDialog');
const PaletteDialog = lazy(loadDialog);

const isTypingTarget = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName));
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);

// ─── Button ─────────────────────────────────────────────────────────────

/** Header search button. `light` = white icon for dark/transparent backgrounds, otherwise navy. */
export const SearchButton = ({ light = false, className }: { light?: boolean; className?: string }) => {
  const { t } = useTranslation();
  const hint = isMac() ? '⌘ K' : t('search.shortcutHint');
  return (
    <button
      type="button"
      onClick={openSearch}
      onPointerEnter={() => void loadDialog()}
      onFocus={() => void loadDialog()}
      aria-label={t('search.button')}
      title={`${t('search.button')} (${hint})`}
      className={clsx(
        'inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full transition-colors duration-300 lg:px-3',
        light ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-sunken',
        className,
      )}
    >
      <Search className="size-5" />
      <kbd
        className={clsx(
          'hidden rounded-md border px-1.5 py-0.5 font-sans text-[11px] leading-none font-semibold whitespace-nowrap lg:inline-block',
          light ? 'border-white/25 text-white/75' : 'border-line text-muted',
        )}
      >
        {hint}
      </kbd>
    </button>
  );
};

// ─── Palette ────────────────────────────────────────────────────────────

/** Site-wide command palette. Mount once (e.g. in the site layout); open with Ctrl/Cmd+K, "/", or `openSearch()`. */
export const SearchPalette = () => {
  const { open } = useSearchPalette();

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleSearch();
      } else if (e.key === '/' && !isSearchOpen() && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <Suspense key="search-palette" fallback={null}>
          <PaletteDialog />
        </Suspense>
      )}
    </AnimatePresence>,
    document.body,
  );
};
