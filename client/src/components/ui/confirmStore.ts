import type { ReactNode } from 'react';

/**
 * Promise-based confirmations without per-component state: `if (!(await confirmDialog({ … }))) return;`.
 * Requests queue up here; <ConfirmHost /> (mounted once in main.tsx) shows the first one with the
 * design-system ConfirmDialog (alertdialog, focus trap, Esc = cancel, danger styling). Pure module (no React
 * runtime import) so the queue logic is unit-tested from server/tests/unit/confirmStore.test.ts.
 */

export type ConfirmOptions = {
  /** Heading; defaults to ui.confirmDlg.title ("Are you sure?"). */
  title?: ReactNode;
  /** Body text; name the affected item here (e.g. "Delete “Q3 report”?"). */
  message?: ReactNode;
  /** Confirm button text; defaults to ui.confirmDlg.delete for danger, ui.confirm otherwise. */
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** "danger" (default) = red confirm button + warning icon; "primary" for non-destructive questions. */
  tone?: 'danger' | 'primary';
  /** Type-to-confirm text for the most destructive actions. */
  confirmText?: string;
};

export type ConfirmRequest = ConfirmOptions & { id: number };

type Entry = { req: ConfirmRequest; resolve: (ok: boolean) => void };

let queue: Entry[] = [];
let snapshot: ConfirmRequest | null = null;
let seq = 0;
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = queue[0]?.req ?? null;
  for (const l of [...listeners]) l();
};

/** Ask the user; resolves true on confirm, false on cancel / Esc / backdrop. Requests are shown one at a time. */
export const confirmDialog = (options: ConfirmOptions = {}): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    queue = [...queue, { req: { ...options, id: ++seq }, resolve }];
    emit();
  });

/** Settles a request (called by ConfirmHost). Unknown / already settled ids are ignored. */
export const settleConfirm = (id: number, ok: boolean) => {
  const entry = queue.find((e) => e.req.id === id);
  if (!entry) return;
  queue = queue.filter((e) => e !== entry);
  emit();
  entry.resolve(ok);
};

/** Cancels every open request (e.g. the host unmounts). */
export const cancelAllConfirms = () => {
  const all = queue;
  queue = [];
  emit();
  for (const e of all) e.resolve(false);
};

/** useSyncExternalStore pair: the request currently on screen (stable object identity per request). */
export const subscribeConfirm = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const currentConfirm = (): ConfirmRequest | null => snapshot;
export const pendingConfirmCount = () => queue.length;
