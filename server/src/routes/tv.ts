import { Router, type Request, type Response } from 'express';
import { limiter } from '../lib/http.js';
import { buildTvPayload } from '../lib/tvDisplay/data.js';
import { subscribeTv } from '../lib/tvDisplay/events.js';
import { requireTvToken, trackTvStream } from '../lib/tvDisplay/tokens.js';
import type { RealtimeEvent } from '../lib/messaging/realtime.js';

/**
 * Office TV mode — /api/tv (no session: a revocable read-only display token, lib/tvDisplay/tokens.ts).
 *
 *   GET /data    the TV dashboard payload (minimised: first name + initial only)
 *   GET /stream  Server-Sent Events: tv.approved, tv.refresh (+ heartbeats)
 *
 * The token opens nothing else: these two routes are the only ones that read it, and the session middleware
 * rejects it everywhere (it is not a session JWT). Rate limited per IP.
 */
export const tvRouter = Router();

const tvLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });
tvRouter.use(tvLimiter);

tvRouter.get('/data', requireTvToken, async (_req, res) => {
  res.json(await buildTvPayload());
});

const HEARTBEAT_MS = 25_000;

/** Shared SSE loop for the token stream and the staff preview stream (routes/admin/tvDisplay.ts). */
export const tvStream = (req: Request, res: Response, onOpen?: (close: () => void) => () => void) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  req.socket?.setKeepAlive?.(true);
  req.socket?.setTimeout?.(0);
  const write = (chunk: string) => {
    res.write(chunk);
    (res as Response & { flush?: () => void }).flush?.();
  };
  let seq = 0;
  write(`retry: 5000\n: connected ${new Date().toISOString()}\n\n`);
  const off = subscribeTv((ev: RealtimeEvent) => {
    seq += 1;
    write(`id: ${seq}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
  });
  const heartbeat = setInterval(() => write(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
  let closed = false;
  let untrack = () => {};
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    off();
    untrack();
  };
  if (onOpen) untrack = onOpen(() => {
    cleanup();
    res.end();
  });
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
};

tvRouter.get('/stream', requireTvToken, (req, res) => {
  tvStream(req, res, (close) => trackTvStream(req.tvToken!.id, close));
});
