import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { formatBytes } from '@/lib/api';
import { contentUrl } from './api';
import { ItemIcon } from './fileIcons';
import type { DriveItem } from './types';

/**
 * Quick look of the explorer (macOS-style): Space on the focused / selected file opens an overlay with the
 * image or the PDF, ← → step through the previewable files of the folder, Space / Esc close it. Hovering a
 * file with a mouse for a moment shows a small peek card (never on touch screens, never for client documents). Both read the existing
 * GET /api/drive/nodes/:id/content (inline, VIEW access, the same access log as opening the file).
 */

export type QuickKind = 'image' | 'pdf';

/** Which files the quick look can show (the server marks inline-viewable files as `previewable`). */
export const quickKind = (item: Pick<DriveItem, 'kind' | 'previewable' | 'mimeType'>): QuickKind | null => {
  if (item.kind !== 'FILE' || !item.previewable || !item.mimeType) return null;
  if (item.mimeType.startsWith('image/')) return 'image';
  if (item.mimeType === 'application/pdf') return 'pdf';
  return null;
};

export const isQuickPreviewable = (item: Pick<DriveItem, 'kind' | 'previewable' | 'mimeType'>) => quickKind(item) !== null;

/** The neighbour in the previewable list (wraps around); null when there is nothing else to show. */
export const stepPreview = (ids: readonly string[], currentId: string, delta: 1 | -1): string | null => {
  if (ids.length < 2) return null;
  const i = ids.indexOf(currentId);
  if (i < 0) return ids[0];
  return ids[(i + delta + ids.length) % ids.length];
};

const Body = ({ item, compact = false }: { item: DriveItem; compact?: boolean }) => {
  const kind = quickKind(item);
  if (kind === 'image') {
    return (
      <img
        src={contentUrl(item.id)}
        alt={item.name}
        draggable={false}
        className={clsx('mx-auto rounded-lg object-contain', compact ? 'max-h-60 max-w-full' : 'max-h-full max-w-full')}
      />
    );
  }
  if (kind === 'pdf') {
    return (
      <iframe
        title={item.name}
        src={`${contentUrl(item.id)}#toolbar=${compact ? 0 : 1}&navpanes=0&view=FitH`}
        className={clsx('w-full rounded-lg border border-line bg-white', compact ? 'pointer-events-none h-60' : 'h-full')}
      />
    );
  }
  return null;
};

export const QuickPreview = ({
  items,
  currentId,
  onChange,
  onClose,
}: {
  /** The files of the current view, in display order (non-previewable ones are skipped). */
  items: readonly DriveItem[];
  currentId: string | null;
  onChange: (item: DriveItem) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const list = items.filter(isQuickPreviewable);
  const ids = list.map((i) => i.id);
  const item = list.find((i) => i.id === currentId) ?? null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  const step = useCallback(
    (delta: 1 | -1) => {
      if (!currentId) return;
      const next = stepPreview(ids, currentId, delta);
      const found = next ? list.find((i) => i.id === next) : null;
      if (found) onChange(found);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentId, ids.join('|')],
  );

  // Keys while open: captured before the explorer's own handler (which would move the selection).
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        step(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [item, onClose, step]);

  // Focus moves into the dialog and back to the explorer when it closes.
  const open = !!item;
  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => restore.current?.focus?.();
  }, [open]);

  if (!item || typeof document === 'undefined') return null;
  const index = ids.indexOf(item.id);

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-scrim p-2 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={t('drive.quick.title', { name: item.name })} onClick={onClose}>
      <div
        className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--tv-shadow-raised)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <ItemIcon item={item} className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
            <p className="text-xs text-muted">
              {formatBytes(item.size ?? 0)}
              {ids.length > 1 && ` · ${t('drive.quick.counter', { n: index + 1, total: ids.length })}`}
            </p>
          </div>
          {ids.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('drive.quick.prev')}>
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => step(1)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('drive.quick.next')}>
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
          <a
            href={contentUrl(item.id)}
            target="_blank"
            rel="noopener"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            aria-label={t('drive.quick.openTab')}
            title={t('drive.quick.openTab')}
          >
            <ExternalLink className="size-[18px]" />
          </a>
          <button ref={closeRef} type="button" onClick={onClose} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('drive.dialogs.close')}>
            <X className="size-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto bg-sunken p-2 sm:p-4">
          <Body key={item.id} item={item} />
        </div>
        <p className="hidden border-t border-line px-3 py-1.5 text-center text-[11px] text-muted sm:block">{t('drive.quick.hint')}</p>
      </div>
    </div>,
    document.body,
  );
};

// ─── Hover peek ─────────────────────────────────────────────────────────

export const PEEK_DELAY_MS = 550;
const PEEK_W = 288;

/** Only real mice hover: touch screens and pens never get the peek card. */
const finePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Places the card beside the anchor, flipped to the left / clamped into the viewport. */
export const peekPosition = (rect: { left: number; right: number; top: number }, viewport: { width: number; height: number }, size = { w: PEEK_W, h: 320 }) => {
  const gap = 10;
  let left = rect.right + gap;
  if (left + size.w > viewport.width - 8) left = rect.left - gap - size.w;
  left = Math.max(8, Math.min(left, viewport.width - size.w - 8));
  const top = Math.max(8, Math.min(rect.top, viewport.height - size.h - 8));
  return { left, top };
};

/**
 * Hover preview of the explorer rows / tiles: `enter` arms a short timer, `leave` / `cancel` disarm it.
 * Disabled for drags (the drop highlight has priority) and on coarse pointers.
 */
export const useHoverPeek = (enabled: boolean) => {
  const [peek, setPeek] = useState<{ item: DriveItem; left: number; top: number } | null>(null);
  const timer = useRef(0);
  const fine = useRef(finePointer());

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    setPeek(null);
  }, []);

  const enter = useCallback(
    (e: ReactPointerEvent, item: DriveItem) => {
      // Client documents are not peeked: every open of one is a VIEW in the client's access log, and passing the
      // mouse over a folder of PDFs must not fill it. Space / the quick look stays a deliberate, logged view.
      if (!enabled || !fine.current || e.pointerType !== 'mouse' || e.buttons !== 0 || !isQuickPreviewable(item) || item.documentId) return;
      const el = e.currentTarget as HTMLElement;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (!el.isConnected) return;
        const pos = peekPosition(el.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
        setPeek({ item, ...pos });
      }, PEEK_DELAY_MS);
    },
    [enabled],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);

  const node =
    peek && typeof document !== 'undefined'
      ? createPortal(
          <div
            aria-hidden
            className="pointer-events-none fixed z-[70] rounded-xl border border-line bg-card p-2 shadow-[var(--tv-shadow-raised)]"
            style={{ left: peek.left, top: peek.top, width: PEEK_W }}
          >
            <Body item={peek.item} compact />
            <p className="mt-1.5 truncate px-1 text-xs font-medium text-ink">{peek.item.name}</p>
          </div>,
          document.body,
        )
      : null;

  return { enter, leave: cancel, cancel, node };
};
