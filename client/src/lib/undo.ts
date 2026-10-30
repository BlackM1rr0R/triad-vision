import { toast } from 'sonner';
import i18n from '@/i18n';
import { toastError } from '@/components/admin/labels';
import { getImpersonation } from '@/lib/api';

/**
 * "Geri al" toasts for admin actions that feel irreversible. Two strategies, chosen per action (safest first):
 *
 *  - delayedCommit: nothing is sent yet; the UI shows the result at once (optimistic) and the request runs when
 *    the 10 s window ends. Undo simply cancels it — the server, the client and their notifications never see it.
 *    Used where the server side has no clean reverse (workflow steps that notify the client, deleting a task).
 *  - undoToast: the action ran; undo calls a compensating request (restore from the bin, the previous assignee).
 *
 * Leaving the page with pending delayed commits: `beforeunload` only asks (if the user stays, the commits keep
 * waiting and "Geri al" still works); the actual flush happens on `pagehide`, when the page is really going away.
 * Requests started on pagehide can be aborted by the browser, so commits that describe their request (`keepalive`)
 * are sent with `fetch(…, { keepalive: true })`, which outlives the page; others fall back to their own commit.
 */

export const UNDO_MS = 10_000;

/** A plain description of the commit request, so it can be sent with fetch keepalive when the page closes. */
export interface KeepaliveRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** API path as given to the axios client, e.g. `/admin/bulk/cases/status` (the `/api` prefix is added). */
  url: string;
  body?: unknown;
}

type Pending = { run: () => Promise<void>; timer: number; keepalive?: KeepaliveRequest };
const pending = new Map<string, Pending>();
let seq = 0;

const t = (key: string, opts?: Record<string, unknown>) => String(i18n.t(key, opts));

/** Sends a request that survives the page unloading. Same auth as the axios client: the session cookie
 *  (credentials: 'include') and the same-origin Origin header the server's CSRF guard checks; plus X-Locale. */
export const sendKeepalive = (req: KeepaliveRequest) => {
  if (getImpersonation()) return; // read-only view: mutating calls never leave the browser
  const headers: Record<string, string> = {};
  const ui = typeof document !== 'undefined' ? document.documentElement.lang.slice(0, 2) : '';
  const lang = ui === 'tr' || ui === 'uk' ? 'en' : ui;
  if (lang) headers['X-Locale'] = lang;
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    void fetch(`/api${req.url}`, {
      method: req.method,
      keepalive: true,
      credentials: 'include',
      headers,
      ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
    }).catch(() => undefined);
  } catch {
    /* fetch unavailable / body too large for keepalive: nothing more can be done while the page closes */
  }
};

/** Flushes every pending commit at once (page closing). */
export const flushPendingForUnload = () => {
  for (const [id, p] of [...pending]) {
    window.clearTimeout(p.timer);
    pending.delete(id);
    toast.dismiss(id);
    if (p.keepalive) sendKeepalive(p.keepalive);
    else void p.run();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingForUnload);
  // Only ask: flushing here would commit even when the user then clicks "Stay" (and undo would silently fail).
  window.addEventListener('beforeunload', (e) => {
    if (!pending.size) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/** Number of actions still waiting for their undo window to end (tests, "leave page" guards). */
export const pendingUndoCount = () => pending.size;

export interface DelayedCommitOptions {
  /** Toast text, e.g. "3 müraciət ləğv ediləcək". */
  message: string;
  /** The real request; runs after `delayMs` (or at once when the page closes). */
  commit: () => Promise<unknown>;
  /** The same request as data, sent with fetch keepalive if the page closes during the undo window. */
  keepalive?: KeepaliveRequest;
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
    if (!p) {
      // The window already ended (sonner can keep a hovered / background toast on screen longer than the timer).
      toast.dismiss(id);
      toast(t('sp.undo.tooLate'));
      return false;
    }
    window.clearTimeout(p.timer);
    pending.delete(id);
    o.rollback?.();
    toast.dismiss(id);
    toast(t('sp.undo.undone'));
    return true;
  };
  const timer = window.setTimeout(() => {
    pending.delete(id);
    // sonner pauses its timer on hover / hidden tab: take the "Geri al" toast away the moment the commit fires.
    toast.dismiss(id);
    void run();
  }, delay);
  pending.set(id, { run, timer, keepalive: o.keepalive });
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
