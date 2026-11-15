import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import i18n from 'i18next';
import { CalendarClock, Flame, Hourglass, Inbox, PartyPopper, PlaneLanding, Stamp, WifiOff } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesTvDisplay } from '@/i18n/pagesTvDisplay';
import {
  fetchTvData,
  forgetTvToken,
  msUntilBakuReload,
  playChime,
  readTvStream,
  readTvToken,
  TvAuthError,
  type TvApprovedEvent,
  type TvPanelKey,
  type TvPayload,
} from '@/lib/tvDisplay';

registerCopy(pagesTvDisplay);

/**
 * Office TV mode (/admin/tv): a full-screen dashboard for the wall TV. No controls: it refreshes itself, follows
 * the realtime stream, rotates overflowing lists, keeps the screen awake and reloads once a day. Shown in
 * Azerbaijani whatever the device language. Data comes already minimised from the API (first name + initial).
 *
 * Access: the read-only display token from Admin → TV mode (URL fragment, then localStorage), else the staff
 * session of the signed-in browser.
 */

const t = (key: string, opts?: Record<string, unknown>) => i18n.getFixedT('az')(`tvd.tv.${key}`, opts) as string;

const TZ = 'Asia/Baku';
const timeFmt = new Intl.DateTimeFormat('az', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayFmt = new Intl.DateTimeFormat('az', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const dateLongFmt = new Intl.DateTimeFormat('az', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hhmm = (iso: string | Date) => timeFmt.format(new Date(iso));

const DATA_POLL_MS = 60_000;
const STALE_STREAM_MS = 70_000; // the server pings every 25 s
const CELEBRATION_MS = 10_000;

type Phase = 'loading' | 'ready' | 'noToken' | 'revoked';

// ─── Connection: data polling + event stream ───────────────────────────

const useTvFeed = (token: string | null, onApproved: (e: TvApprovedEvent) => void) => {
  const [data, setData] = useState<TvPayload | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [online, setOnline] = useState(true);
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;
  const stopped = useRef(false);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof TvAuthError) {
        stopped.current = true;
        if (token && err.code === 'TV_TOKEN_REVOKED') {
          forgetTvToken();
          setPhase('revoked');
        } else {
          if (token) forgetTvToken();
          setPhase('noToken');
        }
        return true;
      }
      return false;
    },
    [token],
  );

  const load = useCallback(async () => {
    if (stopped.current) return;
    try {
      const next = await fetchTvData(token);
      setData(next);
      setPhase('ready');
    } catch (err) {
      if (!fail(err)) setOnline(false);
    }
  }, [token, fail]);

  // Polling (the stream only carries events; numbers are refreshed here).
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), DATA_POLL_MS);
    const back = () => void load();
    window.addEventListener('online', back);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', back);
    };
  }, [load]);

  // Stream with backoff reconnect and a watchdog for silently dead connections.
  useEffect(() => {
    let cancelled = false;
    let ctrl: AbortController | null = null;
    let backoff = 1000;
    let lastAlive = Date.now();
    let retry = 0;
    const watchdog = window.setInterval(() => {
      if (ctrl && Date.now() - lastAlive > STALE_STREAM_MS) ctrl.abort();
    }, 10_000);
    const connect = async () => {
      if (cancelled || stopped.current) return;
      ctrl = new AbortController();
      lastAlive = Date.now();
      try {
        await readTvStream(token, ctrl.signal, {
          onOpen: () => {
            backoff = 1000;
            setOnline(true);
            void load();
          },
          onAlive: () => {
            lastAlive = Date.now();
          },
          onEvent: (type, payload) => {
            if (type === 'tv.approved') {
              approvedRef.current(payload as TvApprovedEvent);
              void load();
            } else if (type === 'tv.refresh') void load();
          },
        });
      } catch (err) {
        if (fail(err)) return;
      }
      if (cancelled || stopped.current) return;
      setOnline(false);
      retry = window.setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };
    void connect();
    const online = () => {
      if (ctrl) ctrl.abort();
    };
    window.addEventListener('online', online);
    return () => {
      cancelled = true;
      window.clearInterval(watchdog);
      window.clearTimeout(retry);
      window.removeEventListener('online', online);
      ctrl?.abort();
    };
  }, [token, load, fail]);

  return { data, phase, online };
};

// ─── TV device behaviour: wake lock, hidden cursor, daily reload, scale ─

const useTvDevice = () => {
  useEffect(() => {
    const html = document.documentElement;
    const prev = { fontSize: html.style.fontSize, cursor: document.body.style.cursor, overflow: document.body.style.overflow };
    // Everything is sized in rem: 1920 px wide → ~21 px, 4K → 42 px, small screens never below 14 px.
    html.style.fontSize = 'clamp(14px, 1.1vw, 44px)';
    document.body.style.cursor = 'none';
    document.body.style.overflow = 'hidden';

    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') lock = await nav.wakeLock.request('screen');
      } catch {
        /* not supported / not allowed: the TV's own settings decide */
      }
    };
    void wake();
    const onVisible = () => document.visibilityState === 'visible' && void wake();
    document.addEventListener('visibilitychange', onVisible);

    // A TV browser rarely starts in full screen; the first remote / mouse press asks for it (no visible control).
    const fullscreen = () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener('pointerdown', fullscreen, { once: true });
    window.addEventListener('keydown', fullscreen, { once: true });

    const reload = window.setTimeout(() => window.location.reload(), msUntilBakuReload());
    return () => {
      html.style.fontSize = prev.fontSize;
      document.body.style.cursor = prev.cursor;
      document.body.style.overflow = prev.overflow;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', fullscreen);
      window.removeEventListener('keydown', fullscreen);
      window.clearTimeout(reload);
      void lock?.release().catch(() => undefined);
    };
  }, []);
};

const useNow = (everyMs = 1000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
};

/** Increments every `seconds`: drives the page rotation of every overflowing list. */
const useTick = (seconds: number) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), Math.max(5, seconds) * 1000);
    return () => window.clearInterval(id);
  }, [seconds]);
  return tick;
};

// ─── Layout pieces ─────────────────────────────────────────────────────

const Panel = ({ title, icon: Icon, count, sub, tone, children, className }: { title: string; icon: typeof Inbox; count?: number | null; sub?: ReactNode; tone: string; children: ReactNode; className?: string }) => (
  <section className={clsx('flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6', className)}>
    <header className="mb-4 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={clsx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', tone)}>
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold text-white">{title}</h2>
          {sub && <div className="truncate text-lg text-slate-300">{sub}</div>}
        </div>
      </div>
      {count !== undefined && count !== null && <div className="text-6xl font-black leading-none tabular-nums text-white">{count}</div>}
    </header>
    <div className="relative min-h-0 flex-1">{children}</div>
  </section>
);

/**
 * A list that pages itself: measures how many rows fit, and when there are more, shows the next page every
 * rotation tick (with page dots). Rows have a fixed height so the measurement is exact.
 */
const RotatingList = <T,>({ items, tick, empty, row }: { items: T[]; tick: number; empty: string; row: (item: T, i: number) => ReactNode }) => {
  const box = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(6);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const rowPx = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.6; // h-[3.6rem] rows
      const dots = 1.6 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      setPerPage(Math.max(1, Math.floor((el.clientHeight - dots) / rowPx)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = tick % pages;
  const shown = items.slice(page * perPage, page * perPage + perPage);
  return (
    <div ref={box} className="absolute inset-0 flex flex-col">
      {items.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-2xl text-slate-400">{empty}</p>
      ) : (
        <ul key={page} className="tv-fade flex-1 space-y-0">
          {shown.map((item, i) => (
            <li key={i} className="flex h-[3.6rem] items-center gap-4 border-b border-white/5 last:border-0">
              {row(item, page * perPage + i)}
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex h-[1.6rem] items-center justify-center gap-2" aria-hidden>
          {Array.from({ length: pages }, (_, i) => (
            <span key={i} className={clsx('h-2.5 rounded-full transition-all', i === page ? 'w-8 bg-white' : 'w-2.5 bg-white/30')} />
          ))}
        </div>
      )}
    </div>
  );
};

const Who = ({ name, owner }: { name: string | null; owner?: string | null }) => (
  <div className="min-w-0 flex-1">
    <div className="truncate text-2xl font-semibold text-white">{name ?? '—'}</div>
    {owner !== undefined && <div className="truncate text-base text-slate-400">{owner ? `${t('owner')}: ${owner}` : ' '}</div>}
  </div>
);

const Time = ({ children }: { children: ReactNode }) => <span className="w-[5.5rem] shrink-0 text-2xl font-bold tabular-nums text-sky-300">{children}</span>;

// ─── Panels ────────────────────────────────────────────────────────────

const PanelView = ({ k, data, tick, tall }: { k: TvPanelKey; data: TvPayload; tick: number; tall: boolean }) => {
  const p = data.panels;
  const cls = tall ? 'row-span-2' : undefined;
  switch (k) {
    case 'agenda': {
      const a = p.agenda;
      if (!a) return null;
      return (
        <Panel title={t('today')} icon={CalendarClock} tone="bg-violet-500/20 text-violet-200" count={a.items.length} sub={`${t('embassy')}: ${a.embassy} · ${t('interview')}: ${a.interviews}`} className={cls}>
          <RotatingList
            items={a.items}
            tick={tick}
            empty={t('agendaEmpty')}
            row={(i) => (
              <>
                <Time>{hhmm(i.at)}</Time>
                <span className={clsx('shrink-0 rounded-full px-3 py-1 text-base font-semibold', i.kind === 'embassy' ? 'bg-violet-500/25 text-violet-100' : 'bg-sky-500/25 text-sky-100')}>
                  {i.kind === 'embassy' ? t('embassy') : t('interview')}
                </span>
                <Who name={i.client} owner={i.owner} />
              </>
            )}
          />
        </Panel>
      );
    }
    case 'inquiries': {
      const q = p.inquiries;
      if (!q) return null;
      return (
        <Panel
          title={t('inquiries')}
          icon={Inbox}
          tone="bg-sky-500/20 text-sky-200"
          count={q.today}
          sub={`${t('inquiriesSub')} · ${q.companies} ${t('companies')} · ${q.people} ${t('people')}${q.hot ? ` · ${q.hot} ${t('hot')}` : ''}`}
          className={cls}
        >
          <RotatingList
            items={q.recent}
            tick={tick}
            empty={t('inquiriesEmpty')}
            row={(r) => (
              <>
                <Time>{hhmm(r.at)}</Time>
                <Who name={r.name ?? (r.kind === 'company' ? t('companies') : t('people'))} />
                {r.hot && <Flame className="h-7 w-7 shrink-0 text-orange-400" aria-label={t('hot')} />}
              </>
            )}
          />
        </Panel>
      );
    }
    case 'waiting': {
      const w = p.waiting;
      if (!w) return null;
      return (
        <Panel title={t('waiting')} icon={Hourglass} tone="bg-amber-500/20 text-amber-200" count={w.count} sub={w.oldestDays !== null ? t('oldest', { n: w.oldestDays }) : t('waitingSub')} className={cls}>
          <RotatingList
            items={w.oldest}
            tick={tick}
            empty={t('waitingEmpty')}
            row={(r) => (
              <>
                <span className={clsx('w-[5.5rem] shrink-0 text-2xl font-bold tabular-nums', r.days >= 3 ? 'text-rose-300' : 'text-amber-200')}>{t('days', { n: r.days })}</span>
                <Who name={r.client} owner={r.owner} />
                <span className="shrink-0 text-base text-slate-300">{t(`status.${r.status}`)}</span>
              </>
            )}
          />
        </Panel>
      );
    }
    case 'approved': {
      const ap = p.approved;
      if (!ap) return null;
      return (
        <Panel title={t('approved')} icon={Stamp} tone="bg-emerald-500/20 text-emerald-200" count={ap.count} className={cls}>
          <RotatingList
            items={ap.items}
            tick={tick}
            empty={t('approvedEmpty')}
            row={(r) => (
              <>
                <PartyPopper className="h-7 w-7 shrink-0 text-emerald-300" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-2xl font-semibold text-white">{r.client ?? '—'}</div>
                  <div className="truncate text-base text-slate-300">{[r.profession, r.city].filter(Boolean).join(' · ') || ' '}</div>
                </div>
                {r.at && <span className="shrink-0 text-lg tabular-nums text-slate-400">{dayFmt.format(new Date(r.at))}</span>}
              </>
            )}
          />
        </Panel>
      );
    }
    case 'arrivals': {
      const ar = p.arrivals;
      if (!ar) return null;
      return (
        <Panel title={t('arrivals')} icon={PlaneLanding} tone="bg-teal-500/20 text-teal-200" count={ar.count} className={cls}>
          <RotatingList
            items={ar.items}
            tick={tick}
            empty={t('arrivalsEmpty')}
            row={(r) => (
              <>
                <span className="w-[7.5rem] shrink-0 text-xl font-bold tabular-nums text-teal-200">{dayFmt.format(new Date(r.at))}</span>
                <Who name={r.client} />
                <span className="shrink-0 text-lg text-slate-300">{r.arrived ? `✓ ${t('arrived')}` : (r.city ?? '')}</span>
              </>
            )}
          />
        </Panel>
      );
    }
  }
};

// ─── Celebration ───────────────────────────────────────────────────────

const COLORS = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa', '#ffffff', '#f87171'];

const Confetti = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const resize = () => {
      el.width = window.innerWidth;
      el.height = window.innerHeight;
    };
    resize();
    const W = () => el.width;
    const H = () => el.height;
    const parts = Array.from({ length: 220 }, () => ({
      x: Math.random() * W(),
      y: -Math.random() * H(),
      w: 8 + Math.random() * 10,
      h: 10 + Math.random() * 14,
      vy: 2 + Math.random() * 4,
      vx: -1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: -0.15 + Math.random() * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    let raf = 0;
    const frame = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of parts) {
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.y / 40);
        p.rot += p.vr;
        if (p.y > H() + 20) {
          p.y = -20;
          p.x = Math.random() * W();
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0" aria-hidden />;
};

const Celebration = ({ e }: { e: TvApprovedEvent }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-emerald-700 via-emerald-900 to-slate-950" role="alert" aria-live="assertive">
    <Confetti />
    <div className="tv-pop relative px-8 text-center">
      <div className="text-[7rem] font-black leading-none text-white drop-shadow-lg">{t('celebrate')}</div>
      <div className="mt-10 text-[4.5rem] font-extrabold leading-tight text-amber-200">{e.client ?? ''}</div>
      {(e.profession || e.city) && (
        <div className="mt-6 text-[2.8rem] font-semibold text-emerald-50">
          {[e.profession, e.city ? t('celebrateTo', { city: e.city }) : null].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  </div>
);

// ─── Page ──────────────────────────────────────────────────────────────

const Message = ({ title, text }: { title: string; text: string }) => (
  <div className="flex h-full flex-col items-center justify-center gap-6 px-16 text-center">
    <WifiOff className="h-20 w-20 text-slate-500" aria-hidden />
    <h1 className="text-5xl font-bold text-white">{title}</h1>
    <p className="max-w-4xl text-2xl text-slate-300">{text}</p>
  </div>
);

export default function TvDisplay() {
  const token = useMemo(() => readTvToken(), []);
  const [queue, setQueue] = useState<TvApprovedEvent[]>([]);
  const settingsRef = useRef<TvPayload['settings'] | null>(null);
  const seen = useRef(new Set<string>());

  const onApproved = useCallback((e: TvApprovedEvent) => {
    if (!e?.key || seen.current.has(e.key)) return;
    seen.current.add(e.key);
    if (settingsRef.current && !settingsRef.current.celebration) return;
    setQueue((q) => [...q, e].slice(-20));
  }, []);

  const { data, phase, online } = useTvFeed(token, onApproved);
  settingsRef.current = data?.settings ?? null;
  useTvDevice();
  const now = useNow();
  const tick = useTick(data?.settings.rotationSeconds ?? 20);

  // One celebration at a time, ~10 s each; the chime (if switched on) when each one starts.
  const current = queue[0] ?? null;
  useEffect(() => {
    if (!current) return;
    if (settingsRef.current?.sound) playChime();
    const id = window.setTimeout(() => setQueue((q) => q.slice(1)), CELEBRATION_MS);
    return () => window.clearTimeout(id);
  }, [current]);

  useEffect(() => {
    const prev = document.title;
    document.title = `${t('title')} · Triad Vision`;
    return () => {
      document.title = prev;
    };
  }, []);

  const panels = (data?.settings.panels ?? []).filter((k) => data?.panels[k]);
  const n = panels.length;
  const cols = n <= 1 ? 1 : n === 2 ? 2 : 3;
  const twoRows = n >= 4;
  // With 4–5 panels the first one (normally "today") takes the full left column.
  const tallFirst = twoRows && n === 5;

  return (
    <div lang="az" className="fixed inset-0 flex select-none flex-col bg-slate-950 text-slate-100" style={{ cursor: 'none' }}>
      <style>{`
        .tv-fade { animation: tvFade .6s ease-out; }
        .tv-pop { animation: tvPop .7s cubic-bezier(.2,1.4,.4,1); }
        @keyframes tvFade { from { opacity: 0; transform: translateY(.4rem); } to { opacity: 1; transform: none; } }
        @keyframes tvPop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .tv-fade, .tv-pop { animation: none; } }
      `}</style>
      <header className="flex items-center justify-between gap-6 px-8 pb-4 pt-6">
        <div className="flex items-baseline gap-4">
          <span className="text-3xl font-black tracking-tight text-white">Triad Vision</span>
          <span className="text-xl text-slate-400">{t('title')}</span>
        </div>
        <div className="flex items-center gap-6">
          {!online && phase === 'ready' && (
            <span className="flex items-center gap-2 rounded-full bg-rose-500/20 px-4 py-2 text-lg font-semibold text-rose-200">
              <WifiOff className="h-5 w-5" aria-hidden />
              {t('offline')}
            </span>
          )}
          <div className="text-right">
            <div className="text-5xl font-black tabular-nums leading-none text-white">{timeFmt.format(now)}</div>
            <div className="mt-1 text-xl capitalize text-slate-300">{dateLongFmt.format(now)}</div>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 px-8 pb-6">
        {phase === 'noToken' ? (
          <Message title={t('noToken')} text={t('noTokenText')} />
        ) : phase === 'revoked' ? (
          <Message title={t('revoked')} text={t('revokedText')} />
        ) : !data ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white" aria-hidden />
          </div>
        ) : (
          <div className="grid h-full gap-6" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: twoRows ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
            {panels.map((k, i) => (
              <PanelView key={k} k={k} data={data} tick={tick} tall={tallFirst && i === 0} />
            ))}
          </div>
        )}
      </main>

      {data && (
        <footer className="px-8 pb-3 text-right text-sm text-slate-500" aria-hidden>
          {t('updated', { time: hhmm(data.generatedAt) })}
        </footer>
      )}

      {current && <Celebration key={current.key} e={current} />}
    </div>
  );
}
