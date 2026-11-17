import { CITIES, cityBySlug, type City } from '../cities/data';
import { estimate, type Housing } from '../cities/calc';
import { BAKU, BAKU_ITEMS, TRANSFER_COST, TRANSFER_METHODS, type BakuItem, type TransferMethod } from './data';

/**
 * "Money for family" (/send-money-home), pure and deterministic: monthly net salary − living costs in the chosen
 * German city (lib/cities, one adult) at a lifestyle level − own savings goal = what can be sent home; then the
 * transfer cost (estimate) and the amount in AZN at the CBAR rate, translated into typical Azerbaijani figures.
 */

export const LIFESTYLES = ['frugal', 'normal', 'comfortable'] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

/** Housing and the point of the cost range per lifestyle: WG room at the low end, own small flat in the middle / top. */
const STYLE: Record<Lifestyle, { housing: Housing; at: 0 | 0.5 | 1 }> = {
  frugal: { housing: 'wg', at: 0 },
  normal: { housing: 'room1', at: 0.5 },
  comfortable: { housing: 'room1', at: 1 },
};

export interface MoneyHomeInput {
  /** Net salary per month, EUR. */
  net: number;
  city: string;
  style: Lifestyle;
  /** What you want to keep saving in Germany per month, EUR. */
  save: number;
  method: TransferMethod;
}

export const DEFAULT_MONEY_HOME: MoneyHomeInput = { net: 2100, city: 'berlin', style: 'normal', save: 150, method: 'online' };

const r0 = Math.round;

/** "1 234 ₼" with the visitor's digit grouping (no Intl: identical on server and client). */
export const aznText = (n: number, lng: string) => `${(n < 0 ? '−' : '')}${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lng === 'en' ? ',' : lng === 'de' || lng === 'tr' ? '.' : ' ')} ₼`;

/** Monthly living costs of one adult in the city at the lifestyle level (EUR). */
export const livingCosts = (city: City, style: Lifestyle) => {
  const s = STYLE[style];
  const e = estimate(city, { household: 'single', children: 0, housing: s.housing, car: false });
  const at = (k: number) => r0(e.total[0] + (e.total[1] - e.total[0]) * k);
  const rent = e.lines.find((l) => l.key === 'rent')!.range;
  return { total: at(s.at), rent: r0(rent[0] + (rent[1] - rent[0]) * s.at), lines: e.lines };
};

/** Transfer fee range (EUR) for sending `amount` with a method: fixed + percentage, [low, high]. */
export const transferFee = (amount: number, method: TransferMethod): [number, number] => {
  if (amount <= 0) return [0, 0];
  const c = TRANSFER_COST[method];
  return [r0(c.fixed[0] + (amount * c.pct[0]) / 100), r0(c.fixed[1] + (amount * c.pct[1]) / 100)];
};

export interface MoneyHomeResult {
  net: number;
  costs: number;
  rent: number;
  save: number;
  /** What is left to send, EUR (≥ 0). */
  send: number;
  /** Shortfall when costs + savings exceed the net salary, EUR (≥ 0). */
  short: number;
  fee: [number, number];
  /** What arrives, EUR [after the high fee, after the low fee]. */
  arrives: [number, number];
  /** Amount sent (middle of what arrives) in AZN, null without a rate. */
  azn: number | null;
  yearAzn: number | null;
  /** How many of each Baku figure the monthly AZN amount equals (one decimal). */
  equivalents: { key: BakuItem; times: number }[];
}

export const moneyHome = (input: MoneyHomeInput, rate: number | null): MoneyHomeResult => {
  const city = cityBySlug(input.city) ?? CITIES[0];
  const net = Math.max(0, input.net);
  const save = Math.max(0, input.save);
  const living = livingCosts(city, input.style);
  const left = net - living.total - save;
  const send = Math.max(0, r0(left));
  const fee = transferFee(send, input.method);
  const arrives: [number, number] = [Math.max(0, send - fee[1]), Math.max(0, send - fee[0])];
  const arrivesMid = (arrives[0] + arrives[1]) / 2;
  const azn = rate && rate > 0 ? r0(arrivesMid * rate) : null;
  return {
    net,
    costs: living.total,
    rent: living.rent,
    save,
    send,
    short: left < 0 ? r0(-left) : 0,
    fee,
    arrives,
    azn,
    yearAzn: azn == null ? null : azn * 12,
    equivalents: azn == null ? [] : BAKU_ITEMS.map((key) => ({ key, times: Math.round((azn / BAKU[key].azn) * 10) / 10 })),
  };
};

// ─── URL ⇄ input (?net&gross&city&style&save&method) ─────────────────────────

const num = (v: string | null, min: number, max: number) => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};

/**
 * Reads the input from the URL. `gross` (e.g. from the salary calculator) is converted with `netOf` when no `net`
 * is given; the caller passes the site's payroll engine (tax class I) so this module stays free of it.
 */
export const moneyHomeFromParams = (p: URLSearchParams, netOf?: (gross: number) => number): MoneyHomeInput => {
  const d = DEFAULT_MONEY_HOME;
  const gross = num(p.get('gross'), 0, 50_000);
  const net = num(p.get('net'), 0, 30_000) ?? (gross != null && netOf ? r0(netOf(gross)) : d.net);
  const city = cityBySlug(p.get('city'))?.slug ?? d.city;
  const style = (LIFESTYLES as readonly string[]).includes(p.get('style') ?? '') ? (p.get('style') as Lifestyle) : d.style;
  const method = (TRANSFER_METHODS as readonly string[]).includes(p.get('method') ?? '') ? (p.get('method') as TransferMethod) : d.method;
  return { net, city, style, save: num(p.get('save'), 0, 20_000) ?? d.save, method };
};

export const moneyHomeToQuery = (i: MoneyHomeInput) => new URLSearchParams({ net: String(i.net), city: i.city, style: i.style, save: String(i.save), method: i.method }).toString();
