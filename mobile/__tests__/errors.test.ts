import { ApiError, codeFromStatus, errorCode, errorKeys, isUnauthorized } from '@/lib/errors';

const axiosError = (status?: number, data?: unknown, code?: string) => ({
  isAxiosError: true,
  code,
  message: 'Request failed',
  response: status ? { status, data } : undefined,
});

describe('API error mapping', () => {
  it('uses the server error code from the body', () => {
    expect(errorCode(axiosError(409, { error: 'ACTIVE_CASE_EXISTS' }))).toBe('ACTIVE_CASE_EXISTS');
    expect(errorCode(axiosError(401, { error: 'INVALID_CREDENTIALS' }))).toBe('INVALID_CREDENTIALS');
    expect(errorCode(axiosError(400, { error: 'VALIDATION', issues: [] }))).toBe('VALIDATION');
  });

  it('falls back to HTTP status codes', () => {
    expect(errorCode(axiosError(413, '<html>'))).toBe('FILE_TOO_LARGE');
    expect(errorCode(axiosError(401))).toBe('UNAUTHENTICATED');
    expect(errorCode(axiosError(404, {}))).toBe('NOT_FOUND');
    expect(errorCode(axiosError(429))).toBe('RATE_LIMITED');
    expect(errorCode(axiosError(502))).toBe('SERVER');
  });

  it('detects network failures and timeouts', () => {
    expect(errorCode(axiosError(undefined, undefined, 'ERR_NETWORK'))).toBe('NETWORK');
    expect(errorCode(axiosError(undefined, undefined, 'ECONNABORTED'))).toBe('TIMEOUT');
    expect(errorCode(new Error('Network request failed'))).toBe('NETWORK');
  });

  it('parses JSON bodies returned as strings (native uploads)', () => {
    expect(codeFromStatus(409, '{"error":"UPLOAD_NOT_ALLOWED"}')).toBe('UPLOAD_NOT_ALLOWED');
    expect(codeFromStatus(400, 'not json')).toBe('UNKNOWN');
  });

  it('keeps ApiError codes', () => {
    expect(errorCode(new ApiError(0, 'CAMERA_DENIED'))).toBe('CAMERA_DENIED');
  });

  it('handles unknown values', () => {
    expect(errorCode(undefined)).toBe('UNKNOWN');
    expect(errorCode(new Error('boom'))).toBe('UNKNOWN');
  });

  it('recognises 401s', () => {
    expect(isUnauthorized(axiosError(401))).toBe(true);
    expect(isUnauthorized(new ApiError(401, 'UNAUTHENTICATED'))).toBe(true);
    expect(isUnauthorized(axiosError(403))).toBe(false);
  });

  it('looks up translations from most to least specific', () => {
    expect(errorKeys('EMAIL_TAKEN')).toEqual(['portal.errors.EMAIL_TAKEN', 'auth.errors.EMAIL_TAKEN', 'm.errors.EMAIL_TAKEN', 'm.errors.UNKNOWN']);
  });
});
