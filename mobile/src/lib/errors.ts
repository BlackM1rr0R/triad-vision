/**
 * Maps any thrown value (axios error, fetch/upload result, plain Error) to a stable,
 * machine-readable code. The server answers errors as { error: 'CODE' }.
 */
export type ErrorCode = string;

interface AxiosLike {
  isAxiosError?: boolean;
  response?: { status?: number; data?: unknown };
  code?: string;
  message?: string;
}

const codeFromBody = (data: unknown): string | undefined => {
  if (!data) return undefined;
  if (typeof data === 'string') {
    try {
      return codeFromBody(JSON.parse(data));
    } catch {
      return undefined;
    }
  }
  if (typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    return (data as { error: string }).error;
  }
  return undefined;
};

export const codeFromStatus = (status: number | undefined, body?: unknown): ErrorCode => {
  const fromBody = codeFromBody(body);
  if (fromBody) return fromBody;
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 413) return 'FILE_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status && status >= 500) return 'SERVER';
  return 'UNKNOWN';
};

export const errorCode = (err: unknown): ErrorCode => {
  if (!err) return 'UNKNOWN';
  if (err instanceof ApiError) return err.code;
  const e = err as AxiosLike;
  if (e.isAxiosError || e.response) {
    if (e.response) return codeFromStatus(e.response.status, e.response.data);
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') return 'TIMEOUT';
    return 'NETWORK';
  }
  if (e.message && /network request failed|network error/i.test(e.message)) return 'NETWORK';
  return 'UNKNOWN';
};

export const isUnauthorized = (err: unknown) => {
  const e = err as AxiosLike;
  return e?.response?.status === 401 || (err instanceof ApiError && err.status === 401);
};

/** Error thrown by non-axios requests (multipart uploads). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
  ) {
    super(code);
  }
}

/**
 * i18n key candidates for an error code, most specific first.
 * The web translations already contain portal.errors.* and auth.errors.*; mobile adds m.errors.*.
 */
export const errorKeys = (code: ErrorCode): string[] => [
  `portal.errors.${code}`,
  `auth.errors.${code}`,
  `m.errors.${code}`,
  'm.errors.UNKNOWN',
];
