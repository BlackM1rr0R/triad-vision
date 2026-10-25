import type { Bag, Currency, Stage } from './types';

const SUFFIX: Record<Currency, string> = { AZN: '₼', EUR: '€' };

/** "3 000 ₼" — whole units (cents only when not whole). */
export const fmtMoney = (cents: number | null | undefined, currency: Currency) => {
  if (cents == null) return '';
  const units = cents / 100;
  const s = Number.isInteger(units) ? units.toLocaleString('de-DE') : units.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} ${SUFFIX[currency]}`;
};

export const fmtBag = (bag: Bag | undefined) => {
  if (!bag) return '';
  return (['AZN', 'EUR'] as Currency[])
    .filter((c) => bag[c])
    .map((c) => fmtMoney(bag[c]!, c))
    .join(' + ');
};

export const addBag = (bag: Bag, currency: Currency, cents: number | null | undefined) => {
  if (!cents) return;
  bag[currency] = (bag[currency] ?? 0) + cents;
};

/** Units typed by a user ("1500", "1 500", "1.500", "12,5") → cents; null when empty; NaN when invalid. */
export const parseUnits = (input: string): number | null => {
  let t = input.replace(/[₼€]|azn|eur|manat|euro/gi, '').replace(/\s/g, '').trim();
  if (!t) return null;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
};

export const unitsText = (cents: number | null | undefined) => (cents == null ? '' : String(cents / 100));

/** Currency typed in an amount ("500 euro", "300 €"), if any. */
export const currencyIn = (input: string): Currency | null => {
  if (/€|eur|euro/i.test(input)) return 'EUR';
  if (/₼|azn|manat/i.test(input)) return 'AZN';
  return null;
};

/** Soft row tints over the card colour: readable in light and dark themes. */
export const STAGE_TINT: Record<Stage, string> = {
  NEW: 'var(--color-info-bg)',
  IN_PROGRESS: 'var(--color-warning-bg)',
  VISA: 'var(--color-success-bg)',
  REFUSED: 'var(--color-danger-bg)',
  CANCELLED: 'var(--color-neutral-bg)',
};

export const STAGE_CHIP: Record<Stage, string> = {
  NEW: 'bg-info-bg text-info-fg',
  IN_PROGRESS: 'bg-warning-bg text-warning-fg',
  VISA: 'bg-success-bg text-success-fg',
  REFUSED: 'bg-danger-bg text-danger-fg',
  CANCELLED: 'bg-muted/15 text-muted',
};

export const STAGE_DOT: Record<Stage, string> = {
  NEW: 'bg-info',
  IN_PROGRESS: 'bg-warning',
  VISA: 'bg-success',
  REFUSED: 'bg-danger',
  CANCELLED: 'bg-subtle',
};

export const tintStyle = (stage: Stage) => ({
  backgroundColor: 'var(--color-card)',
  backgroundImage: `linear-gradient(${STAGE_TINT[stage]}, ${STAGE_TINT[stage]})`,
});
