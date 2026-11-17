/**
 * Supermarket game rules (pure, deterministic): the shopping list of a round (seeded, so a shared link replays it),
 * the empties for the deposit machine, picking on the shelves, the score and the receipt (Kassenbon) lines with
 * the VAT split (A = 7 %, B = 19 %).
 */
import { seededRandom, shuffle } from '@/lib/games/common';
import { BAG_PRICE, CONFUSABLE, EMPTIES, PRODUCTS, PRODUCT_BY_ID, type Empty, type Product } from './items';

export const ROUND_SECONDS = 180;
export const MIN_LIST = 5;
export const MAX_LIST = 8;
export const EMPTIES_PER_ROUND = 4;
export const FOUND_POINTS = 100;
export const WRONG_PENALTY = 20;
export const PFAND_POINTS = 20;
export const OWN_BAG_POINTS = 20;
/** Points per second left when the whole list was found. */
export const TIME_BONUS_PER_SECOND = 2;

export const newSeed = () => 1 + Math.floor(Math.random() * 999_999);
export const parseSeed = (v: string | null): number | null => {
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 ? n : null;
};

export interface Round {
  seed: number;
  list: Product[];
  empties: Empty[];
}

/** A round: 5–8 list items (at least two with look-alikes on the shelves, from different aisles where possible) and 4 empties. */
export const buildRound = (seed: number): Round => {
  const rnd = seededRandom(seed);
  const size = MIN_LIST + Math.floor(rnd() * (MAX_LIST - MIN_LIST + 1));
  const tricky = shuffle(Object.keys(CONFUSABLE), rnd);
  const picked: Product[] = [];
  const take = (p: Product | undefined) => {
    if (!p || picked.some((x) => x.id === p.id)) return;
    // never two look-alikes of each other on one list (e.g. Sprudel and still): the game would be ambiguous
    if (picked.some((x) => CONFUSABLE[x.id]?.includes(p.id) || CONFUSABLE[p.id]?.includes(x.id))) return;
    picked.push(p);
  };
  for (const id of tricky) {
    if (picked.length >= 2) break;
    take(PRODUCT_BY_ID.get(id));
  }
  for (const p of shuffle(PRODUCTS, rnd)) {
    if (picked.length >= size) break;
    take(p);
  }
  const empties = shuffle(EMPTIES, rnd).slice(0, EMPTIES_PER_ROUND);
  // at least one empty without Pfand, so the "not every bottle has a deposit" lesson comes up
  if (!empties.some((e) => e.pfand === 0)) {
    const none = EMPTIES.find((e) => e.pfand === 0 && !empties.includes(e));
    if (none) empties[empties.length - 1] = none;
  }
  return { seed, list: shuffle(picked, rnd), empties };
};

export type PickResult = { kind: 'found'; product: Product } | { kind: 'again'; product: Product } | { kind: 'wrong'; product: Product; meant: Product | null };

/** Picking a product from the shelf: on the list (found / already in the cart) or wrong (with the list item it was probably mistaken for). */
export const pick = (list: readonly Product[], cart: readonly string[], productId: string): PickResult | null => {
  const product = PRODUCT_BY_ID.get(productId);
  if (!product) return null;
  if (list.some((p) => p.id === productId)) return cart.includes(productId) ? { kind: 'again', product } : { kind: 'found', product };
  const meant =
    list.find((l) => !cart.includes(l.id) && (CONFUSABLE[l.id]?.includes(productId) || CONFUSABLE[productId]?.includes(l.id))) ??
    list.find((l) => !cart.includes(l.id) && l.aisle === product.aisle) ??
    null;
  return { kind: 'wrong', product, meant };
};

export type Bag = 'own' | 'paper' | 'plastic';

export interface Summary {
  found: number;
  listSize: number;
  wrong: number;
  pfandRight: number;
  secondsLeft: number;
  bag: Bag | null;
  points: number;
}

export const summarize = (a: { found: number; listSize: number; wrong: number; pfandRight: number; secondsLeft: number; bag: Bag | null }): Summary => {
  const complete = a.found >= a.listSize;
  const raw =
    a.found * FOUND_POINTS -
    a.wrong * WRONG_PENALTY +
    a.pfandRight * PFAND_POINTS +
    (a.bag === 'own' ? OWN_BAG_POINTS : 0) +
    (complete ? Math.max(0, Math.round(a.secondsLeft)) * TIME_BONUS_PER_SECOND : 0);
  return { ...a, points: Math.max(0, raw) };
};

export const maxPoints = (listSize: number) => listSize * FOUND_POINTS + EMPTIES_PER_ROUND * PFAND_POINTS + OWN_BAG_POINTS + ROUND_SECONDS * TIME_BONUS_PER_SECOND;

export interface ReceiptLine {
  text: string;
  amount: number;
  /** VAT code on the receipt: A = 7 %, B = 19 %; none for the deposit voucher. */
  code: 'A' | 'B' | null;
}

export interface Receipt {
  lines: ReceiptLine[];
  total: number;
  /** Gross, net and tax per VAT code (positive lines only). */
  vat: { code: 'A' | 'B'; rate: number; gross: number; net: number; tax: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The Kassenbon of the found products, their Pfand, the paper bag and the deposit voucher (Leergutbon) from the machine. */
export const buildReceipt = (products: readonly Product[], bag: Bag | null, voucher: number): Receipt => {
  const lines: ReceiptLine[] = [];
  for (const p of products) {
    const code = p.vat === 7 ? 'A' : 'B';
    lines.push({ text: `${p.de} ${p.unit}`, amount: p.price, code });
    if (p.pfand) lines.push({ text: `  Pfand ${p.pfand.toFixed(2).replace('.', ',')}`, amount: p.pfand, code });
  }
  if (bag === 'paper') lines.push({ text: 'Papiertragetasche', amount: BAG_PRICE, code: 'B' });
  if (voucher > 0) lines.push({ text: 'Leergutbon', amount: -r2(voucher), code: null });
  const vat = (['A', 'B'] as const)
    .map((code) => {
      const rate = code === 'A' ? 7 : 19;
      const gross = r2(lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0));
      const net = r2(gross / (1 + rate / 100));
      return { code, rate, gross, net, tax: r2(gross - net) };
    })
    .filter((v) => v.gross > 0);
  const total = r2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, total, vat };
};

/** Change in cash: the smallest note that covers the total, and what comes back. */
export const NOTES_EUR = [5, 10, 20, 50] as const;
export const cashFor = (total: number) => {
  const given = NOTES_EUR.find((n) => n >= total) ?? Math.ceil(total / 50) * 50;
  return { given, change: r2(given - total) };
};
