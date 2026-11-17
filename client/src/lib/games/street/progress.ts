/**
 * Progress badges of the virtual street (/german-street), read from the localStorage keys the games already write
 * (all through lib/games/common, prefix "tv.games."):
 *   simulator.best  {sceneId: percent}   (/german-simulator)
 *   price.best      number               (/price-game)
 *   waste.best      number | null        (/waste-sorting)
 *   signs.best      number | null, signs.known string[]   (/traffic-signs)
 *   pron.best       {sentenceId: percent} (/pronunciation)
 *   mockExam.<set>  {done: {module: date}} (/german-mock-exam, sets a1-1 / b1-1)
 *   ticket.best     number               (/ticket-machine)
 *   supermarket.best number              (/supermarket-game)
 * plus street.visited (places whose panel was opened). Pure: the reader is passed in, so the tests need no storage.
 */
import { loadProgress, saveProgress } from '@/lib/games/common';
import { PLACES, type BuildingId } from './buildings';

export type Reader = <T>(key: string, fallback: T) => T;
export type PlaceState = 'done' | 'visited' | 'new';

export const VISITED_KEY = 'street.visited';
export const TICKET_BEST_KEY = 'ticket.best';
export const SUPERMARKET_BEST_KEY = 'supermarket.best';

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const hasNumber = (o: unknown, k: string) => isObj(o) && num(o[k]);
const nonEmpty = (o: unknown) => isObj(o) && Object.values(o).some((v) => num(v) || typeof v === 'string');

/** Places whose existing game can be "completed"; the others (work scenes, pharmacy, post) only get "visited". */
const RULES: Partial<Record<BuildingId, (read: Reader) => boolean>> = {
  buergeramt: (r) => hasNumber(r<unknown>('simulator.best', {}), 'anmeldung'),
  bank: (r) => hasNumber(r<unknown>('simulator.best', {}), 'bank'),
  arztpraxis: (r) => hasNumber(r<unknown>('simulator.best', {}), 'doctor'),
  wohnhaus: (r) => hasNumber(r<unknown>('simulator.best', {}), 'heating'),
  baeckerei: (r) => {
    const v = r<unknown>('price.best', 0);
    return num(v) && (v as number) > 0;
  },
  muell: (r) => num(r<unknown>('waste.best', null)),
  schilder: (r) => {
    const known = r<unknown>('signs.known', []);
    return num(r<unknown>('signs.best', null)) || (Array.isArray(known) && known.length > 0);
  },
  sprachschule: (r) => nonEmpty(r<unknown>('pron.best', {})) || ['a1-1', 'b1-1'].some((s) => {
    const saved = r<unknown>(`mockExam.${s}`, null);
    return isObj(saved) && nonEmpty(saved.done);
  }),
  bahnhof: (r) => {
    const v = r<unknown>(TICKET_BEST_KEY, 0);
    return num(v) && (v as number) > 0;
  },
  supermarkt: (r) => {
    const v = r<unknown>(SUPERMARKET_BEST_KEY, 0);
    return num(v) && (v as number) > 0;
  },
};

/** True for places whose badge can turn "done". */
export const isTrackable = (id: BuildingId) => !!RULES[id];

/** The badge of every place. */
export const streetStates = (read: Reader): Record<BuildingId, PlaceState> => {
  const visitedRaw = read<unknown>(VISITED_KEY, []);
  const visited = new Set(Array.isArray(visitedRaw) ? visitedRaw.filter((x): x is string => typeof x === 'string') : []);
  return Object.fromEntries(
    PLACES.map((p) => {
      let done = false;
      try {
        done = !!RULES[p.id]?.(read);
      } catch {
        done = false;
      }
      return [p.id, done ? 'done' : visited.has(p.id) ? 'visited' : 'new'];
    }),
  ) as Record<BuildingId, PlaceState>;
};

/** "3 of 10": completed places among the trackable ones, and places visited or completed among all. */
export const streetSummary = (states: Record<BuildingId, PlaceState>) => {
  const ids = Object.keys(states) as BuildingId[];
  return {
    done: ids.filter((id) => states[id] === 'done').length,
    trackable: ids.filter(isTrackable).length,
    seen: ids.filter((id) => states[id] !== 'new').length,
    total: ids.length,
  };
};

/** Browser reader (lib/games/common: errors and server render give the fallback). */
export const storageReader: Reader = (key, fallback) => loadProgress(key, fallback);

/** Remembers that a place's panel was opened (best effort). */
export const markVisited = (id: BuildingId) => {
  const list = loadProgress<unknown>(VISITED_KEY, []);
  const arr = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  if (!arr.includes(id)) saveProgress(VISITED_KEY, [...arr, id]);
};
