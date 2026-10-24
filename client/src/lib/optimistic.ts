import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Optimistic updates for react-query mutations: the cache changes at once, is rolled back when the server
 * says no, and is refreshed from the server afterwards either way.
 *
 *   const m = useMutation({
 *     mutationFn: (id: string) => api.post(`/x/${id}/done`),
 *     ...optimistic(qc, {
 *       key: ['x'],
 *       update: (prev: XList | undefined, id) => prev && { ...prev, items: prev.items.map(…) },
 *       onError: apiError,          // toast
 *       invalidate: [OVERVIEW_KEY], // other queries the change affects
 *     }),
 *   });
 *
 * `key` may be a function of the variables (per-case lists). Several keys can be patched at once with `patches`.
 */

type Patch<V> = { key: QueryKey | ((vars: V) => QueryKey); update: (prev: never, vars: V) => unknown };

export type OptimisticContext = { snapshots: [QueryKey, unknown][] };

export function optimistic<TData = unknown, V = void>(
  qc: QueryClient,
  opts: {
    key: QueryKey | ((vars: V) => QueryKey);
    update: (prev: TData | undefined, vars: V) => TData | undefined;
    /** Extra caches to patch in the same step (e.g. an unread badge kept in another query). */
    patches?: Patch<V>[];
    /** Called after the rollback (show a toast). */
    onError?: (err: unknown, vars: V) => void;
    /** Further keys to refetch once the request has settled. */
    invalidate?: QueryKey[];
    /** Skip refetching the patched keys after success (the optimistic state is already exact). */
    keepOnSuccess?: boolean;
  },
) {
  const resolve = (k: QueryKey | ((vars: V) => QueryKey), vars: V) => (typeof k === 'function' ? k(vars) : k);
  const all = (): Patch<V>[] => [{ key: opts.key, update: opts.update as Patch<V>['update'] }, ...(opts.patches ?? [])];
  return {
    onMutate: async (vars: V): Promise<OptimisticContext> => {
      const list = all().map((p) => ({ key: resolve(p.key, vars), update: p.update }));
      await Promise.all(list.map((p) => qc.cancelQueries({ queryKey: p.key })));
      const snapshots: [QueryKey, unknown][] = [];
      for (const p of list) {
        // every cached query under the key (prefix match), so ['notifications'] also covers its variants
        for (const [k, data] of qc.getQueriesData({ queryKey: p.key })) {
          snapshots.push([k, data]);
          qc.setQueryData(k, (prev: unknown) => (prev === undefined ? prev : p.update(prev as never, vars)));
        }
      }
      return { snapshots };
    },
    onError: (err: unknown, vars: V, ctx: OptimisticContext | undefined) => {
      ctx?.snapshots.forEach(([k, data]) => qc.setQueryData(k, data));
      opts.onError?.(err, vars);
    },
    onSettled: (_d: unknown, err: unknown, vars: V) => {
      const keys = [...(err || !opts.keepOnSuccess ? all().map((p) => resolve(p.key, vars)) : []), ...(opts.invalidate ?? [])];
      keys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    },
  };
}

/** Temporary id for an optimistic item (e.g. a chat message not yet stored). */
export const tempId = () => `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const isTempId = (id: string | undefined | null) => !!id && id.startsWith('tmp-');
