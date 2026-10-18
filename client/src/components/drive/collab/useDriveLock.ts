import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { registerCopy } from '@/i18n';
import { driveCollabCopy } from '@/i18n/pagesDriveCollab';
import { api } from '@/lib/api';
import { lockUrl } from './api';

// Banner texts (driveCollab.lock.*) for editors that use this hook.
registerCopy(driveCollabCopy);

const HEARTBEAT_MS = 60_000;

export type DriveLockState =
  | { status: 'idle' }
  | { status: 'mine'; lockedAt: string }
  | { status: 'other'; lockedBy: { id: string; name: string }; lockedAt: string }
  | { status: 'error' };

/**
 * Edit lock of a drive file while an editor has it open: acquires on mount, refreshes every minute
 * (the server treats a lock without heartbeat for 5 minutes as stale), and releases on unmount, tab
 * close or navigation (keepalive request). When someone else holds the lock it retries every minute,
 * so a lock that went stale is taken over automatically.
 *
 *   const lock = useDriveLock(nodeId);          // null / undefined = nothing to lock (e.g. a new file)
 *   lock.status === 'other' && <Banner name={lock.lockedBy.name} />
 */
export const useDriveLock = (nodeId: string | null | undefined, opts: { enabled?: boolean } = {}) => {
  const enabled = (opts.enabled ?? true) && !!nodeId;
  const [state, setState] = useState<DriveLockState>({ status: 'idle' });
  const held = useRef<string | null>(null);

  const acquire = useCallback(async (id: string) => {
    try {
      const r = (await api.post<{ lock: { lockedAt: string } | null }>(lockUrl(id).replace(/^\/api/, ''))).data;
      held.current = id;
      setState({ status: 'mine', lockedAt: r.lock?.lockedAt ?? new Date().toISOString() });
    } catch (err) {
      held.current = null;
      const data = err instanceof AxiosError ? (err.response?.data as { error?: string; lockedBy?: { id: string; name: string }; lockedAt?: string } | undefined) : undefined;
      if (data?.error === 'FILE_LOCKED' && data.lockedBy) setState({ status: 'other', lockedBy: data.lockedBy, lockedAt: data.lockedAt ?? '' });
      else setState({ status: 'error' });
    }
  }, []);

  /** Releases without waiting (works while the page unloads). */
  const releaseNow = useCallback((id: string) => {
    if (held.current !== id) return;
    held.current = null;
    try {
      void fetch(lockUrl(id), { method: 'DELETE', credentials: 'include', keepalive: true }).catch(() => undefined);
    } catch {
      /* the lock goes stale on its own */
    }
  }, []);

  useEffect(() => {
    if (!enabled || !nodeId) {
      setState({ status: 'idle' });
      return;
    }
    void acquire(nodeId);
    const timer = window.setInterval(() => void acquire(nodeId), HEARTBEAT_MS);
    const onHide = () => releaseNow(nodeId);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pagehide', onHide);
      releaseNow(nodeId);
    };
  }, [enabled, nodeId, acquire, releaseNow]);

  const release = useCallback(() => {
    if (nodeId) releaseNow(nodeId);
    setState({ status: 'idle' });
  }, [nodeId, releaseNow]);

  const retry = useCallback(() => {
    if (nodeId) void acquire(nodeId);
  }, [nodeId, acquire]);

  return { ...state, release, retry } as DriveLockState & { release: () => void; retry: () => void };
};
