import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { toastError } from '@/components/admin/labels';
import { delayedCommit, undoToast } from '@/lib/undo';

/**
 * Optimistic edit of cached list rows: every cached query under `queryKey` is updated at once, the request
 * runs, and on error every snapshot is restored (rollback) with an error toast. On success the lists are
 * refetched in the background (server-side counts, derived columns).
 *
 * Undo ("Geri al", 10 s — lib/undo.ts), chosen per field:
 *  - `undo`: the request runs now; the success toast offers a compensating request (e.g. the previous value).
 *  - `delayed`: the request runs only when the undo window ends (steps without a server-side reverse that
 *    notify the client); undo simply restores the rows and nothing is ever sent.
 */
export const optimisticListEdit = async <T>({
  qc,
  queryKey,
  update,
  request,
  success,
  invalidate = [],
  undo,
  delayed = false,
}: {
  qc: QueryClient;
  queryKey: QueryKey;
  /** Maps one cached query value to its optimistic version (return it unchanged when not affected). */
  update: (old: T) => T;
  request: () => Promise<unknown>;
  success?: string;
  /** Extra query keys to refresh afterwards (dashboard, detail). */
  invalidate?: QueryKey[];
  /** Compensating request offered as "Geri al" after success. */
  undo?: () => Promise<unknown>;
  /** Send the request after the undo window instead of now. */
  delayed?: boolean;
}) => {
  await qc.cancelQueries({ queryKey });
  const snapshots = qc.getQueriesData<T>({ queryKey });
  qc.setQueriesData<T>({ queryKey }, (old) => (old === undefined ? old : update(old)));
  const restore = () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey });
    invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  };
  if (delayed) {
    delayedCommit({ message: success ?? '', commit: request, rollback: restore, onCommitted: refresh });
    return true;
  }
  try {
    await request();
    if (success && undo) {
      undoToast({
        message: success,
        undo: async () => {
          await undo();
          restore();
          refresh();
        },
      });
    } else if (success) toast.success(success);
    refresh();
    return true;
  } catch (err) {
    restore();
    toastError(err);
    return false;
  }
};

const EDIT_EVENT = 'tv:inline-edit';

/** Asks the inline editor of one row / field to open (keyboard "E" on the selected row). */
export const requestInlineEdit = (rowId: string, field?: string) => window.dispatchEvent(new CustomEvent(EDIT_EVENT, { detail: { rowId, field } }));

export const onInlineEditRequest = (cb: (detail: { rowId: string; field?: string }) => void) => {
  const h = (e: Event) => {
    const d = (e as CustomEvent<{ rowId: string; field?: string }>).detail;
    if (d && typeof d.rowId === 'string') cb(d);
  };
  window.addEventListener(EDIT_EVENT, h);
  return () => window.removeEventListener(EDIT_EVENT, h);
};
