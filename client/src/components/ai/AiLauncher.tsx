import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { ChatPanel } from './index';

/*
 * "AI köməkçi" button for clients on /account/* (rendered by AccountLayout). It sits to the left of
 * the site's floating stack (WhatsApp at the bottom, accessibility and back-to-top above it), aligned
 * with its bottom edge, and opens the chat in a slide-over (full screen on phones). The chat code is
 * only downloaded on the first open. Copy is inline so the account bundle does not pull the AI texts.
 */
const COPY = {
  az: { open: 'AI köməkçi', dialog: 'AI köməkçi' },
  de: { open: 'KI-Assistent', dialog: 'KI-Assistent' },
  en: { open: 'AI assistant', dialog: 'AI assistant' },
  ru: { open: 'AI-помощник', dialog: 'AI-помощник' },
} as const;

export default function AiLauncher() {
  const { i18n } = useTranslation();
  const copy = COPY[(i18n.resolvedLanguage?.slice(0, 2) ?? 'az') as keyof typeof COPY] ?? COPY.az;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { data } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: async () => (await api.get<{ scopes: { CLIENT: boolean } }>('/ai/status')).data,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    // Keep the page behind the slide-over from scrolling on phones.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!data?.scopes.CLIENT) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-bnav-lift
        className={clsx(
          'fixed right-[5.25rem] bottom-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-contrast shadow-[var(--tv-shadow-raised)] transition-colors hover:bg-primary-hover sm:right-[5.75rem] sm:bottom-6 sm:px-5',
          open && 'pointer-events-none opacity-0',
        )}
      >
        <Sparkles className="size-5 shrink-0" aria-hidden />
        <span>{copy.open}</span>
      </button>

      {mounted && (
        <div className={clsx('fixed inset-0 z-[60]', !open && 'pointer-events-none invisible')} aria-hidden={!open}>
          <button type="button" tabIndex={-1} className={clsx('absolute inset-0 bg-scrim transition-opacity', open ? 'opacity-100' : 'opacity-0')} aria-label="close" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={copy.dialog}
            className={clsx(
              'absolute inset-0 flex flex-col bg-card shadow-2xl transition-transform duration-300 sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[27rem] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-line',
              open ? 'translate-x-0' : 'translate-x-[110%]',
            )}
          >
            <ChatPanel scope="CLIENT" compact onClose={() => setOpen(false)} className="h-full" />
          </div>
        </div>
      )}
    </>
  );
}
