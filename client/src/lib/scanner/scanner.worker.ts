// Web Worker of the document scanner: edge detection and page processing (warp + enhancement) off the main
// thread. Created by lib/scanner/client.ts with `new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' })`.
import { runJob, type ScanRequest } from './jobs';

type Incoming = { id: number; req: ScanRequest };
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Incoming>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    const result = runJob(req);
    ctx.postMessage({ id, ok: true, result }, result.type === 'process' ? [result.data.buffer] : []);
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: (err as Error)?.message ?? 'SCAN_FAILED' });
  }
};
