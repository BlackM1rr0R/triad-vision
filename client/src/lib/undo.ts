import { toast } from 'sonner';
import i18n from '@/i18n';
import { toastError } from '@/components/admin/labels';

/**
 * "Geri al" toasts for admin actions that feel irreversible. Two strategies, chosen per action (safest first):
 *
 *  - delayedCommit: nothing is sent yet; the UI shows the result at once (optimistic) and the request runs when
 *    the 10 s window ends. Undo simply cancels it — the server, the client and their notifications never see it.
 *    Used where the server side has no clean reverse (workflow steps that notify the client, deleting a task).
 *  - undoToast: the action ran; undo calls a compensating request (restore from the bin, the previous assignee).
 *
 * Pending delayed commits are flushed when the page is hidden / closed (and the browser asks before closing),
 * so an action the user meant is never silently dropped.
 */

export const UNDO_MS = 10_000;

type Pending = { run: () => Promise<void>; timer: number };
const pending = new Map<string, Pending>();
let seq = 0;

const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(key, opts));

const flushAll = () => {
  for (const [id, p] of [...pending]) {
    window.clearTimeout(p.timer);
    pending.delete(id);
    void p.run();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', (e) => {
    if (!pending.size) return;
    flushAll();
    e.preventDefault();
  });
}

/** Number of actions still waiting for their undo window to end (tests, "leave page" guards). */
export const pendingUndoCount = () => pending.size;

export interface DelayedCommitOptions {
  /** Toast text, e.g. "3 müraciət ləğv ediləcək". */
  message: string;
  /** The real request; runs after `delayMs` (or at once when the page closes). */
  commit: () => Promise<unknown>;
  /** Called after the request succeeded (refetch, success toast). */
  onCommitted?: (result: unknown) => void;
  /** Revert the optimistic UI: on undo and when the request fails. */
  rollback?: () => void;
  /** Shown after a successful commit (optional). */
  successMessage?: string;
  delayMs?: number;
}

/** Runs `commit` after the undo window unless the user clicks "Geri al". Returns a handle to undo / flush in code. */
export const delayedCommit = (o: DelayedCommitOptions) => {
  const id = `u${++seq}`;
  const delay = o.delayMs ?? UNDO_MS;
  const run = async () => {
    try {
      const result = await o.commit();
      if (o.successMessage) toast.success(o.successMessage);
      o.onCommitted?.(result);
    } catch (err) {
      o.rollback?.();
      toastError(err);
    }
  };
  const undo = () => {
    const p = pending.get(id);
    if (!p) return false;
    window.clearTimeout(p.timer);
    pending.delete(id);
    o.rollback?.();
    toast.dismiss(id);
    toast(t('sp.undo.undone'));
    return true;
  };
  const timer = window.setTimeout(() => {
    pending.delete(id);
    void run();
  }, delay);
  pending.set(id, { run, timer });
  toast(o.message, { id, duration: delay, action: { label: t('sp.undo.action'), onClick: () => undo() } });
  return {
    undo,
    flush: () => {
      const p = pending.get(id);
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.delete(id);
      toast.dismiss(id);
      void run();
    },
  };
};

/** Success toast with "Geri al" (10 s) that runs a compensating request. */
export const undoToast = (o: { message: string; undo: () => Promise<unknown>; onUndone?: () => void; durationMs?: number }) => {
  const id = `u${++seq}`;
  let used = false;
  toast.success(o.message, {
    id,
    duration: o.durationMs ?? UNDO_MS,
    action: {
      label: t('sp.undo.action'),
      onClick: () => {
        if (used) return;
        used = true;
        void o
          .undo()
          .then(() => {
            toast.success(t('sp.undo.undone'));
            o.onUndone?.();
          })
          .catch((err) => {
            toastError(err, t('sp.undo.failed'));
          });
      },
    },
  });
  return id;
};
