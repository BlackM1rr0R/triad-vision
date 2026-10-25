import { Suspense, lazy, useEffect, useRef, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Sparkles, X } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAiAdmin } from '@/i18n/pagesAiAdmin';
import { Spinner } from '@/components/ui/Spinner';

registerCopy(pagesAiAdmin);

/** Where the chat was opened (sent to the assistant as context). */
export interface AiContext {
  nodeId?: string;
  folderId?: string;
  caseId?: string;
  page?: string;
}

interface ChatPanelProps {
  scope: 'CLIENT' | 'ADMIN';
  context?: AiContext;
  compact?: boolean;
  className?: string;
}

/**
 * The assistant's ChatPanel (components/ai/ChatPanel.tsx, built by the AI core) is loaded lazily and only if
 * it exists: import.meta.glob yields no entry for a missing file, so the pages build either way.
 */
const chatModules = import.meta.glob<{ ChatPanel?: ComponentType<ChatPanelProps>; default?: ComponentType<ChatPanelProps> }>('../ai/ChatPanel.tsx');
const chatLoader = Object.values(chatModules)[0];
const LazyChatPanel = chatLoader
  ? lazy(async () => {
      const m = await chatLoader();
      const C = m.ChatPanel ?? m.default;
      if (!C) throw new Error('ChatPanel export missing');
      return { default: C };
    })
  : null;

/** Fired by the ChatPanel after a confirmed AI action finished (detail: { tool?, status?, … }). */
export const AI_ACTION_EVENT = 'ai:action-done';
export interface AiActionDetail {
  tool?: string;
  status?: string;
  actionId?: string;
  [k: string]: unknown;
}

/** Calls `fn` after every confirmed AI action (optionally only for tools matching `filter`). */
export const useAiActionDone = (fn: (detail: AiActionDetail) => void, filter?: RegExp) => {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const onDone = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as AiActionDetail;
      if (filter && detail.tool && !filter.test(detail.tool)) return;
      if (detail.status && /fail|error|reject/i.test(detail.status)) return;
      ref.current(detail);
    };
    window.addEventListener(AI_ACTION_EVENT, onDone);
    return () => window.removeEventListener(AI_ACTION_EVENT, onDone);
  }, [filter]);
};

/** "AI" button of a page header (super admins only — the caller decides). */
export const AdminAiButton = ({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      title={t('aiAdmin.buttonTitle')}
      className={clsx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition',
        open ? 'bg-primary text-primary-contrast hover:brightness-110' : 'text-link hover:bg-primary/[0.06] dark:text-brand-300 dark:hover:bg-navy-800',
        className,
      )}
    >
      <Sparkles className="size-4" /> <span>{t('aiAdmin.button')}</span>
    </button>
  );
};

interface PanelProps {
  open: boolean;
  onClose: () => void;
  context?: AiContext;
  /** Suggestion chip above the chat (e.g. "Bu cədvəllə işlə"); clicking it sends `ai:prefill` to the chat. */
  hint?: string;
  /**
   * dock (default): an aside in the caller's flex row on wide screens; float: fixed to the right edge of the
   * window (pages with a column layout reserve room with `lg:pr-[25rem]`). Below lg both are an overlay.
   */
  variant?: 'dock' | 'float';
  className?: string;
}

/** Right-side panel with the super-admin assistant. */
export const AdminAiPanel = ({ open, onClose, context, hint, variant = 'dock', className }: PanelProps) => {
  const { t } = useTranslation();
  const wide = useWide();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const body = (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Sparkles className="size-4 text-link" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{t('aiAdmin.title')}</h2>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink" aria-label={t('aiAdmin.close')}>
          <X className="size-4" />
        </button>
      </div>
      {hint && (
        <div className="shrink-0 border-b border-line/70 px-3 py-2">
          <button
            type="button"
            className="rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-xs font-semibold text-link hover:bg-primary/10 dark:border-navy-700 dark:bg-navy-800 dark:text-brand-200"
            onClick={() => window.dispatchEvent(new CustomEvent('ai:prefill', { detail: { text: hint, context } }))}
          >
            {hint}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {LazyChatPanel ? (
          <Suspense
            fallback={
              <div className="grid h-full place-items-center">
                <Spinner />
              </div>
            }
          >
            <LazyChatPanel scope="ADMIN" compact context={context} className="h-full" />
          </Suspense>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">{t('aiAdmin.unavailable')}</div>
        )}
      </div>
    </div>
  );

  // One chat instance only: docked on wide screens, an overlay below lg.
  if (wide && variant === 'float') {
    return (
      <aside className={clsx('fixed inset-y-0 right-0 z-40 w-[24rem] border-l border-line shadow-[var(--tv-shadow-raised)]', className)} aria-label={t('aiAdmin.title')}>
        {body}
      </aside>
    );
  }
  return wide ? (
    <aside className={clsx('h-full w-[24rem] shrink-0 border-l border-line 2xl:w-[28rem]', className)} aria-label={t('aiAdmin.title')}>
      {body}
    </aside>
  ) : (
    // TODO(ui): same chat body is docked on lg+ and an overlay below lg (body has its own header / close),
    // so it is not the design-system Drawer yet; it lacks focus trap / Escape. Revisit with the admin layout rework.
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-scrim" onClick={onClose} aria-label={t('aiAdmin.close')} />
      <aside className="absolute inset-y-0 right-0 w-[26rem] max-w-[94vw] border-l border-line shadow-[var(--tv-shadow-raised)]" aria-label={t('aiAdmin.title')}>
        {body}
      </aside>
    </div>
  );
};

const WIDE = '(min-width: 1024px)';
const useWide = () => {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
};
