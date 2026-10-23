import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { commandPaletteCopy } from '@/i18n/commandPalette';
import { hasOpenOverlay } from '@/components/ui/overlay';
import { Tooltip } from '@/components/ui/Tooltip';
import { isMacPlatform, isTypingTarget } from './keys';

registerCopy(commandPaletteCopy);

/**
 * Staff command palette entry points. Mount `<CommandPaletteHotkey />` once per staff layout (admin, workspace):
 * it owns the Ctrl+K / Cmd+K and "/" shortcuts and renders the (lazy) dialog. `<CommandPaletteButton />` opens it
 * from anywhere through a window event, so buttons and the host need no shared context.
 *
 * The public site has its own SearchPalette (SiteLayout); staff layouts don't mount it, so only this one
 * answers Ctrl+K there.
 */

const OPEN_EVENT = 'tv:command-palette-open';
const loadPalette = () => import('./CommandPalette');
const LazyPalette = lazy(loadPalette);

export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));
/** Warm the chunk (hover / focus on a trigger) so the dialog opens instantly. */
export const preloadCommandPalette = () => void loadPalette().catch(() => undefined);

export const CommandPaletteHotkey = () => {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const show = () => {
      setMounted(true);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMounted(true);
        setOpen((v) => !v);
      } else if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target) && !hasOpenOverlay()) {
        // Pages with their own "/" (workspace Contacts, Tasks) handle it on document first and prevent the default.
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <LazyPalette open={open} onClose={() => setOpen(false)} />
    </Suspense>
  );
};

/** The shortcut as shown on this platform ("⌘K" on Apple devices). */
export const useShortcutLabel = () => {
  const { t } = useTranslation();
  return isMacPlatform() ? '⌘K' : t('cmd.shortcut');
};

type ButtonProps = {
  /**
   * header: a search field look on sm+ (icon only below), for light headers.
   * rail: a full-width sidebar row; with `compact` only the icon (with a tooltip).
   */
  variant?: 'header' | 'rail';
  compact?: boolean;
  /** Dark sidebars (admin navy rail). */
  dark?: boolean;
  className?: string;
};

export const CommandPaletteButton = ({ variant = 'header', compact = false, dark = false, className }: ButtonProps) => {
  const { t } = useTranslation();
  const shortcut = useShortcutLabel();
  const label = t('cmd.button');
  const common = {
    type: 'button' as const,
    onClick: openCommandPalette,
    onPointerEnter: preloadCommandPalette,
    onFocus: preloadCommandPalette,
    'aria-keyshortcuts': 'Control+K Meta+K /',
    'aria-haspopup': 'dialog' as const,
  };
  const kbd = (
    <kbd className={clsx('rounded border px-1.5 py-0.5 font-sans text-[11px] leading-none font-semibold', dark ? 'border-white/15 text-white/50' : 'border-line bg-surface text-muted')}>{shortcut}</kbd>
  );

  if (variant === 'rail') {
    const btn = (
      <button
        {...common}
        aria-label={compact ? label : undefined}
        className={clsx(
          'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
          dark ? 'text-white/60 hover:bg-white/5 hover:text-white' : 'text-muted hover:bg-surface hover:text-ink',
          compact && 'justify-center px-0',
          className,
        )}
      >
        <Search className={clsx('size-[18px] shrink-0', dark && 'text-white/50')} aria-hidden />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            {kbd}
          </>
        )}
      </button>
    );
    return compact ? (
      <Tooltip content={`${label} (${shortcut})`} side="right">
        {btn}
      </Tooltip>
    ) : (
      btn
    );
  }

  return (
    <button
      {...common}
      aria-label={label}
      title={`${label} (${shortcut})`}
      className={clsx(
        'flex h-10 shrink-0 items-center gap-2 rounded-lg text-ink/70 transition hover:text-ink',
        'w-10 justify-center hover:bg-surface sm:w-auto sm:min-w-[13rem] sm:justify-start sm:border sm:border-line sm:bg-field sm:px-3 sm:hover:border-brand-400 sm:hover:bg-field',
        className,
      )}
    >
      <Search className="size-[18px] shrink-0 sm:size-4" aria-hidden />
      <span className="hidden flex-1 text-left text-sm text-muted sm:inline">{t('cmd.searchHint')}</span>
      <span className="hidden sm:inline">{kbd}</span>
    </button>
  );
};
