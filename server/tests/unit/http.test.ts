import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z, ZodError } from 'zod';
import { badRequest, conflict, errorHandler, forbidden, HttpError, notFound, parse } from '../../src/lib/http.js';

const fakeRes = () => {
  const res = { statusCode: 0, body: undefined as unknown };
  const r = {
    status(code: number) {
      res.statusCode = code;
      return r;
    },
    json(body: unknown) {
      res.body = body;
      return r;
    },
  };
  return { res, r: r as unknown as Response };
};

const handle = (err: unknown) => {
  const { res, r } = fakeRes();
  errorHandler(err, {} as Request, r, (() => undefined) as NextFunction);
  return res;
};

afterEach(() => vi.restoreAllMocks());

describe('HttpError helpers', () => {
  it.each([
    [badRequest('BAD', 'details'), 400, 'BAD', 'details'],
    [notFound(), 404, 'NOT_FOUND', 'NOT_FOUND'],
    [notFound('CASE_NOT_FOUND'), 404, 'CASE_NOT_FOUND', 'CASE_NOT_FOUND'],
    [forbidden(), 403, 'FORBIDDEN', 'FORBIDDEN'],
    [conflict('DUP'), 409, 'DUP', 'DUP'],
  ])('%s', (err, status, code, message) => {
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status, code, message });
  });
});

describe('errorHandler', () => {
  it('maps HttpError to its status and code', () => {
    expect(handle(new HttpError(418, 'TEAPOT', 'short and stout'))).toEqual({
      statusCode: 418,
      body: { error: 'TEAPOT', message: 'short and stout' },
    });
  });

  it('maps ZodError to 400 VALIDATION with issues', () => {
    let zerr: unknown;
    try {
      z.object({ a: z.string() }).parse({ a: 1 });
    } catch (e) {
      zerr = e;
    }
    expect(zerr).toBeInstanceOf(ZodError);
    const res = handle(zerr);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'VALIDATION', issues: [expect.objectContaining({ path: ['a'] })] });
  });

  it('maps Prisma P2002 (unique) to 409 DUPLICATE', () => {
    expect(handle(Object.assign(new Error('x'), { code: 'P2002' }))).toEqual({ statusCode: 409, body: { error: 'DUPLICATE' } });
  });

  it('maps Prisma P2025 (record not found) to 404', () => {
    expect(handle(Object.assign(new Error('x'), { code: 'P2025' }))).toEqual({ statusCode: 404, body: { error: 'NOT_FOUND' } });
  });

  it('maps multer LIMIT_FILE_SIZE to 413', () => {
    expect(handle(new MulterError('LIMIT_FILE_SIZE', 'file'))).toEqual({ statusCode: 413, body: { error: 'FILE_TOO_LARGE' } });
  });

  it.each([new Error('boom'), 'string error', null, undefined, Object.assign(new Error('x'), { code: 'P2003' })])(
    'maps anything else to 500 INTERNAL without leaking details (%s)',
    (err) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(handle(err)).toEqual({ statusCode: 500, body: { error: 'INTERNAL' } });
      expect(spy).toHaveBeenCalledWith(expect.any(String), err);
    },
  );
});

describe('parse', () => {
  const schema = z.object({ n: z.coerce.number().int(), s: z.string().trim().default('d') });

  it('returns the parsed (coerced/defaulted) value', () => {
    expect(parse(schema, { n: '42', s: '  x ' })).toEqual({ n: 42, s: 'x' });
    expect(parse(schema, { n: 1 })).toEqual({ n: 1, s: 'd' });
  });

  it('throws ZodError on invalid input', () => {
    expect(() => parse(schema, { n: 'abc' })).toThrow(ZodError);
    expect(() => parse(schema, undefined)).toThrow(ZodError);
  });
});
