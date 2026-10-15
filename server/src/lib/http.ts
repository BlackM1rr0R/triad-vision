import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis, redisEnabled } from './redis.js';
import { ZodError, type z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
export const notFound = (code = 'NOT_FOUND') => new HttpError(404, code);
export const forbidden = (code = 'FORBIDDEN') => new HttpError(403, code);
export const conflict = (code: string, message?: string) => new HttpError(409, code, message);

export const parse = <S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> => schema.parse(data);

let limiterSeq = 0;

/**
 * Rate limiter that answers with the same JSON error shape as everything else. With REDIS_URL the
 * counters live in Redis (shared by every API instance, survive restarts); otherwise in memory.
 */
export const limiter = (opts: Partial<RateLimitOptions> & { windowMs: number; limit: number }) => {
  const prefix = `rl:${limiterSeq++}:`;
  const store = redisEnabled() && redis() ? new RedisStore({ prefix, sendCommand: (...args: string[]) => redis()!.call(...(args as [string, ...string[]])) as Promise<never> }) : undefined;
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
    },
    ...(store ? { store } : {}),
    ...opts,
  });
};

/** Gives every request an id (echoed in X-Request-Id) so a 500 in the log can be matched to a client report. */
export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

/** Authenticated API responses must never land in a shared cache. Public routes override this. */
export const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION', issues: err.issues });
    return;
  }
  const code = (err as { code?: string })?.code;
  if (code === 'P2002') {
    res.status(409).json({ error: 'DUPLICATE' });
    return;
  }
  if (code === 'P2025') {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  if (code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'FILE_TOO_LARGE' });
    return;
  }
  if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
    res.status(400).json({ error: 'UNEXPECTED_FILE' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE' });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'INVALID_JSON' });
    return;
  }
  const requestId = (res.locals as { requestId?: string } | undefined)?.requestId;
  console.error(`[${requestId ?? '-'}]`, err);
  res.status(500).json({ error: 'INTERNAL', ...(requestId ? { requestId } : {}) });
};
