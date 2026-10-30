import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Promise-based confirmation queue (client/src/components/ui/confirmStore.ts) behind confirmDialog() /
 * useConfirm(), which replaced window.confirm. The module is pure and loaded by URL so the server type-check
 * does not pull client sources in.
 */

type Req = { id: number; title?: unknown; message?: unknown; tone?: 'danger' | 'primary' };
type Store = {
  confirmDialog: (o?: Partial<Req>) => Promise<boolean>;
  settleConfirm: (id: number, ok: boolean) => void;
  cancelAllConfirms: () => void;
  subscribeConfirm: (l: () => void) => () => void;
  currentConfirm: () => Req | null;
  pendingConfirmCount: () => number;
};

let s: Store;
beforeAll(async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../client/src/components/ui/confirmStore.ts');
  s = (await import(pathToFileURL(file).href)) as Store;
});

describe('confirmStore', () => {
  it('resolves true on confirm and false on cancel, one request on screen at a time (FIFO)', async () => {
    const a = s.confirmDialog({ message: 'Delete “A”?' });
    const b = s.confirmDialog({ message: 'Delete “B”?', tone: 'primary' });
    expect(s.pendingConfirmCount()).toBe(2);
    const first = s.currentConfirm()!;
    expect(first.message).toBe('Delete “A”?');
    s.settleConfirm(first.id, true);
    await expect(a).resolves.toBe(true);

    const second = s.currentConfirm()!;
    expect(second.message).toBe('Delete “B”?');
    expect(second.tone).toBe('primary');
    s.settleConfirm(second.id, false);
    await expect(b).resolves.toBe(false);
    expect(s.currentConfirm()).toBeNull();
    expect(s.pendingConfirmCount()).toBe(0);
  });

  it('ignores double settles and unknown ids', async () => {
    const p = s.confirmDialog();
    const id = s.currentConfirm()!.id;
    s.settleConfirm(id, false);
    s.settleConfirm(id, true);
    s.settleConfirm(99999, true);
    await expect(p).resolves.toBe(false);
  });

  it('keeps a stable snapshot per request (useSyncExternalStore) and notifies subscribers', async () => {
    let calls = 0;
    const off = s.subscribeConfirm(() => calls++);
    const p = s.confirmDialog({ title: 'x' });
    expect(calls).toBe(1);
    expect(s.currentConfirm()).toBe(s.currentConfirm());
    s.settleConfirm(s.currentConfirm()!.id, true);
    expect(calls).toBe(2);
    off();
    await p;
    const q = s.confirmDialog();
    expect(calls).toBe(2);
    s.cancelAllConfirms();
    await expect(q).resolves.toBe(false);
  });

  it('cancelAllConfirms resolves every queued request with false', async () => {
    const all = [s.confirmDialog(), s.confirmDialog(), s.confirmDialog()];
    s.cancelAllConfirms();
    await expect(Promise.all(all)).resolves.toEqual([false, false, false]);
    expect(s.currentConfirm()).toBeNull();
  });
});
