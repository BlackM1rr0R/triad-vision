import type { Places } from './api';

/** Pure: numbers of the places bar; null for a single place or when the counts are unknown. */
export const placesBar = (v: Places) => {
  if (v.filled === undefined || v.free === undefined || !(v.positions > 1)) return null;
  const positions = v.positions;
  const free = Math.max(0, Math.min(positions, v.free));
  const filled = positions - free;
  return { positions, free, filled, percent: Math.round((filled / positions) * 100), full: free === 0, low: free > 0 && free / positions <= 0.34 };
};
