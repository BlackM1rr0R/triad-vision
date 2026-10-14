import type { NextFunction, Request, Response } from 'express';
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
  const multerCode = code;
  if (multerCode === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'FILE_TOO_LARGE' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'INTERNAL' });
};
