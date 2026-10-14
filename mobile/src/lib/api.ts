import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { File, Paths, UploadType } from 'expo-file-system';
import { API_URL } from './config';
import { ApiError, codeFromStatus } from './errors';

const TOKEN_KEY = 'tv_token';

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const tokenStore = {
  async load() {
    try {
      token = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      token = null;
    }
    return token;
  },
  async save(next: string) {
    token = next;
    await SecureStore.setItemAsync(TOKEN_KEY, next);
  },
  async clear() {
    token = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  },
  get: () => token,
};

/** Registered by the auth provider: any 401 from an authenticated request logs the user out. */
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export const authHeaders = (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
  headers: { 'x-client': 'mobile', Accept: 'application/json' },
});

api.interceptors.request.use((cfg) => {
  if (token) cfg.headers.set('Authorization', `Bearer ${token}`);
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only a request that carried our token can mean "session expired".
    const hadToken = !!err?.config?.headers?.Authorization;
    if (err?.response?.status === 401 && hadToken && token) onUnauthorized?.();
    return Promise.reject(err);
  },
);

export const fileUrl = (docId: string) => `${API_URL}/files/${encodeURIComponent(docId)}`;

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').slice(-120) || 'file';

/**
 * Multipart upload with progress, using expo-file-system's native uploader.
 * The local file is first copied under its display name so the server stores the right original name.
 */
export const uploadFile = async (opts: {
  path: string;
  uri: string;
  name: string;
  mimeType: string;
  fields?: Record<string, string>;
  onProgress?: (fraction: number) => void;
}): Promise<unknown> => {
  const staged = new File(Paths.cache, `upload-${Date.now()}-${safeName(opts.name)}`);
  const source = new File(opts.uri);
  let uploadFrom = source;
  try {
    await source.copy(staged);
    uploadFrom = staged;
  } catch {
    // Copy can fail for content:// URIs on some Android versions — upload the original instead.
  }
  try {
    const res = await uploadFrom.upload(`${API_URL}${opts.path}`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: opts.mimeType,
      parameters: opts.fields,
      headers: { ...authHeaders(), 'x-client': 'mobile', Accept: 'application/json' },
      onProgress: opts.onProgress
        ? ({ bytesSent, totalBytes }) => totalBytes > 0 && opts.onProgress!(Math.min(1, bytesSent / totalBytes))
        : undefined,
    });
    if (res.status === 401 && token) onUnauthorized?.();
    if (res.status >= 400) throw new ApiError(res.status, codeFromStatus(res.status, res.body));
    try {
      return JSON.parse(res.body);
    } catch {
      return null;
    }
  } finally {
    if (uploadFrom === staged) {
      try {
        staged.delete();
      } catch {
        /* ignore */
      }
    }
  }
};
