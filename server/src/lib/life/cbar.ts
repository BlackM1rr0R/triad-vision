import type { Prisma } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { outsideImpersonation } from '../privacy/impersonationContext.js';

/**
 * Official EUR → AZN rate of the Central Bank of Azerbaijan (CBAR), for the "Life in Germany" simulator.
 *
 * Source: the daily XML bulletin https://www.cbar.az/currencies/DD.MM.YYYY.xml (free, no key). Requested for a
 * weekend / holiday it answers with the last business day's bulletin; its `ValCurs Date` attribute is the date the
 * rate applies to, which we store and show. Only the SERVER calls CBAR (never the browser), at most once per Baku
 * calendar day; the result is kept in Setting `cbarEurAzn` { rate, date, fetchedAt }. When CBAR is unreachable
 * the last stored rate is used with its date (stale: true); a failed fetch is not retried for an hour. Tests
 * replace the fetcher (setCbarFetch); in the test env the default makes no network request.
 */

export const CBAR_SETTING_KEY = 'cbarEurAzn';
const TIMEOUT_MS = 6_000;
const RETRY_AFTER_FAIL_MS = 60 * 60 * 1000;
/** A rate older than this (days) is flagged as stale even if CBAR answered (long holidays, a frozen bulletin). */
const STALE_AFTER_DAYS = 5;
const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000; // Asia/Baku is UTC+4 all year (no DST since 2016)

export interface CbarRate {
  /** 1 EUR = rate AZN */
  rate: number;
  /** YYYY-MM-DD the bulletin applies to */
  date: string;
  /** ISO time of the successful fetch */
  fetchedAt: string;
}
export interface EurAzn extends CbarRate {
  /** true: CBAR could not be reached now (last known rate) or the rate is older than a few days */
  stale: boolean;
  source: 'CBAR';
}

/** Today's date in Baku as DD.MM.YYYY (the bulletin URL) and YYYY-MM-DD. */
export const bakuDay = (now = new Date()) => {
  const d = new Date(now.getTime() + BAKU_OFFSET_MS).toISOString().slice(0, 10);
  const [y, m, day] = d.split('-');
  return { iso: d, cbar: `${day}.${m}.${y}` };
};

export const cbarUrl = (now = new Date()) => `https://www.cbar.az/currencies/${bakuDay(now).cbar}.xml`;

/**
 * Parses a CBAR bulletin: `<ValCurs Date="13.11.2026" …> … <Valute Code="EUR"><Nominal>1</Nominal>…<Value>1.8805</Value>`.
 * Returns null when the document has no usable EUR rate or date (HTML error page, empty bulletin, nonsense value).
 */
export const parseCbarXml = (xml: string, code = 'EUR'): { rate: number; date: string } | null => {
  if (typeof xml !== 'string' || !xml.includes('<ValCurs')) return null;
  const dm = /<ValCurs\b[^>]*\bDate="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!dm) return null;
  const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  const block = new RegExp(`<Valute\\b[^>]*\\bCode="${code}"[^>]*>([\\s\\S]*?)</Valute>`).exec(xml)?.[1];
  if (!block) return null;
  const nominal = Number((/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/.exec(block)?.[1] ?? '1').replace(',', '.'));
  const value = Number((/<Value>\s*([\d.,]+)\s*<\/Value>/.exec(block)?.[1] ?? '').replace(',', '.'));
  if (!Number.isFinite(value) || !Number.isFinite(nominal) || nominal <= 0 || value <= 0) return null;
  const rate = Math.round((value / nominal) * 1_000_000) / 1_000_000;
  // Sanity bounds for EUR: it has traded between ~1.1 and ~2.5 AZN since the 2006 manat redenomination.
  if (code === 'EUR' && (rate < 0.5 || rate > 10)) return null;
  return { rate, date };
};

type Fetcher = (url: string) => Promise<string>;
const defaultFetch: Fetcher = async (url) => {
  if (config.isTest) throw new Error('NO_NETWORK_IN_TESTS');
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/xml,text/xml' } });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.text();
};
let fetcher: Fetcher = defaultFetch;
let lastFailAt = 0;
let memo: { at: number; value: EurAzn | null } | null = null;
const MEMO_MS = 10 * 60 * 1000;

/** Tests: a fake CBAR (null restores the real one); also forgets the in-memory state. */
export const setCbarFetch = (fn: Fetcher | null) => {
  fetcher = fn ?? defaultFetch;
  lastFailAt = 0;
  memo = null;
  inflight = null;
};

const isRate = (v: unknown): v is CbarRate =>
  !!v && typeof v === 'object' && typeof (v as CbarRate).rate === 'number' && typeof (v as CbarRate).date === 'string' && typeof (v as CbarRate).fetchedAt === 'string';

export const storedRate = async (): Promise<CbarRate | null> => {
  const row = await prisma.setting.findUnique({ where: { key: CBAR_SETTING_KEY } });
  return isRate(row?.value) ? (row!.value as unknown as CbarRate) : null;
};

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const withFlags = (r: CbarRate, failed: boolean, now: Date): EurAzn => ({
  ...r,
  stale: failed || daysBetween(r.date, bakuDay(now).iso) > STALE_AFTER_DAYS,
  source: 'CBAR',
});

let inflight: Promise<EurAzn | null> | null = null;

/** One CBAR request (concurrent callers share it); stores the result, falls back to `stored` on failure. */
const refresh = (stored: CbarRate | null, now: Date): Promise<EurAzn | null> => {
  // Process-wide rate cache shared by every visitor: never refreshed inside a "view as client" read-only context.
  inflight ??= outsideImpersonation(async () => {
    let value: EurAzn | null;
    try {
      const parsed = parseCbarXml(await fetcher(cbarUrl(now)));
      if (!parsed) throw new Error('CBAR_UNPARSABLE');
      const next: CbarRate = { ...parsed, fetchedAt: now.toISOString() };
      const json = next as unknown as Prisma.InputJsonValue;
      await prisma.setting.upsert({ where: { key: CBAR_SETTING_KEY }, create: { key: CBAR_SETTING_KEY, value: json }, update: { value: json } });
      lastFailAt = 0;
      value = withFlags(next, false, now);
    } catch {
      lastFailAt = now.getTime();
      value = stored ? withFlags(stored, true, now) : null;
    }
    memo = { at: Date.now(), value };
    return value;
  }).finally(() => {
    inflight = null;
  });
  return inflight;
};

/**
 * Current EUR → AZN rate. Uses the stored rate when it was fetched today (Baku time); otherwise asks CBAR once
 * (`force`: ask now regardless, admin "refresh"). Falls back to the last stored rate; null only when CBAR was
 * never reached. `waitMs`: public pages wait at most this long for CBAR (the server-rendered page has a short
 * budget) and answer with the stored rate meanwhile; the request finishes in the background and is stored.
 */
export const getEurAzn = async (opts: { force?: boolean; now?: Date; waitMs?: number } = {}): Promise<EurAzn | null> => {
  const now = opts.now ?? new Date();
  if (!opts.force && memo && now.getTime() - memo.at < MEMO_MS) return memo.value;
  const stored = await storedRate();
  const fetchedToday = stored ? bakuDay(new Date(stored.fetchedAt)).iso === bakuDay(now).iso : false;
  if (!opts.force && stored && fetchedToday) {
    const value = withFlags(stored, false, now);
    memo = { at: now.getTime(), value };
    return value;
  }
  if (!opts.force && now.getTime() - lastFailAt < RETRY_AFTER_FAIL_MS) return stored ? withFlags(stored, true, now) : null;
  const pending = refresh(stored, now);
  if (!opts.waitMs) return pending;
  const meanwhile = stored ? withFlags(stored, false, now) : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<EurAzn | null>((resolve) => {
    timer = setTimeout(() => resolve(meanwhile), opts.waitMs);
  });
  return Promise.race([pending, timeout]).finally(() => clearTimeout(timer));
};

/** EUR → AZN, rounded to whole manat (null without a rate). */
export const toAzn = (eur: number, rate: number | null | undefined) => (rate ? Math.round(eur * rate) : null);
