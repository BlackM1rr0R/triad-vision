import axios, { AxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

/** Machine-readable error code returned by the server ({ error: 'CODE' }), or 'NETWORK'. */
export const errorCode = (err: unknown): string => {
  if (err instanceof AxiosError) {
    const code = (err.response?.data as { error?: string } | undefined)?.error;
    if (code) return code;
    if (err.response?.status === 413) return 'FILE_TOO_LARGE';
    return 'NETWORK';
  }
  return 'UNKNOWN';
};

export const fileUrl = (docId: string, download = false) => `/api/files/${docId}${download ? '?download=1' : ''}`;

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
