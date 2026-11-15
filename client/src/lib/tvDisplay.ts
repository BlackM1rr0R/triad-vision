/**
 * Office TV mode (client side): payload types, display-token storage, the SSE reader and the chime.
 *
 * The wall TV opens /admin/tv#token=tvd_…: the token lives in the URL fragment (never sent to a server or a log),
 * is moved to localStorage on the first load and removed from the address bar. Every request sends it as
 * `Authorization: Bearer`, so the stream is read with fetch (EventSource cannot send headers). Without a token
 * the page uses the signed-in staff session instead (preview on an office PC).
 */

export type TvPanelKey = 'agenda' | 'inquiries' | 'waiting' | 'approved' | 'arrivals';

export interface TvSettings {
  panels: TvPanelKey[];
  rotationSeconds: number;
  celebration: boolean;
  sound: boolean;
}

export interface TvPayload {
  generatedAt: string;
  day: string;
  month: string;
  settings: TvSettings;
  panels: Partial<{
    agenda: { embassy: number; interviews: number; items: { kind: 'embassy' | 'interview'; at: string; client: string | null; owner: string | null }[] };
    inquiries: { today: number; companies: number; people: number; hot: number; recent: { kind: 'company' | 'person'; name: string | null; at: string; hot: boolean }[] };
    waiting: { count: number; byStatus: Record<string, number>; oldestDays: number | null; oldest: { client: string | null; owner: string | null; status: string; since: string; days: number }[] };
    approved: { count: number; items: { client: string | null; profession: string | null; city: string | null; at: string | null }[] };
    arrivals: { count: number; items: { client: string | null; at: string; city: string | null; arrived: boolean }[] };
  }>;
}

export interface TvApprovedEvent {
  key: string;
  client: string | null;
  profession: string | null;
  city: string | null;
  at: string;
}

const STORE_KEY = 'tv-display-token';
const TOKEN_RE = /^tvd_[A-Za-z0-9_-]{43}$/;

/** Takes the token from the fragment (then stores it and cleans the address bar), else from storage. */
export const readTvToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
  if (fromHash && TOKEN_RE.test(fromHash)) {
    try {
      localStorage.setItem(STORE_KEY, fromHash);
    } catch {
      /* private mode: the token stays for this load only */
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  try {
    const stored = localStorage.getItem(STORE_KEY);
    return stored && TOKEN_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const forgetTvToken = () => {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
};

/** A 401 from the TV endpoints: the token is unknown / revoked, or (staff mode) the session is gone. */
export class TvAuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const tvEndpoints = (token: string | null) =>
  token
    ? { data: '/api/tv/data', stream: '/api/tv/stream', init: { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit' as const } }
    : { data: '/api/admin/tv-display/data', stream: '/api/admin/tv-display/stream', init: { credentials: 'include' as const } };

const authError = async (res: Response) => {
  const code = await res
    .json()
    .then((b: { error?: string }) => b.error ?? 'UNAUTHENTICATED')
    .catch(() => 'UNAUTHENTICATED');
  return new TvAuthError(code);
};

export const fetchTvData = async (token: string | null): Promise<TvPayload> => {
  const ep = tvEndpoints(token);
  const res = await fetch(ep.data, { ...ep.init, cache: 'no-store' });
  if (res.status === 401 || res.status === 403) throw await authError(res);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as TvPayload;
};

/**
 * Reads the TV event stream until it ends or `signal` aborts. Calls `onOpen` once connected and `onEvent` per
 * event; every chunk (heartbeats included) calls `onAlive`, so the caller can detect a silently dead connection.
 */
export const readTvStream = async (
  token: string | null,
  signal: AbortSignal,
  handlers: { onOpen: () => void; onAlive: () => void; onEvent: (type: string, data: unknown) => void },
) => {
  const ep = tvEndpoints(token);
  const res = await fetch(ep.stream, { ...ep.init, cache: 'no-store', signal, headers: { ...('headers' in ep.init ? ep.init.headers : {}), Accept: 'text/event-stream' } });
  if (res.status === 401 || res.status === 403) throw await authError(res);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  handlers.onOpen();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    handlers.onAlive();
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let type = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) type = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue;
      try {
        handlers.onEvent(type, JSON.parse(data.join('\n')));
      } catch {
        /* a malformed event is skipped */
      }
    }
  }
};

/** Milliseconds until the next 04:00 Baku time (daily reload: fresh code, fresh memory). */
export const msUntilBakuReload = (now = new Date()) => {
  const OFFSET = 4 * 60 * 60 * 1000;
  const baku = new Date(now.getTime() + OFFSET);
  let next = Date.UTC(baku.getUTCFullYear(), baku.getUTCMonth(), baku.getUTCDate(), 4) - OFFSET;
  if (next <= now.getTime() + 60_000) next += 24 * 60 * 60 * 1000;
  return next - now.getTime();
};

let audio: AudioContext | null = null;

/** A short rising chime (C–E–G–C), synthesised: no audio file. Silently does nothing when audio is blocked. */
export const playChime = () => {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume?.();
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.16;
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {
    /* audio not allowed */
  }
};
