import { az } from './apartment/az';
import { de } from './apartment/de';
import { en } from './apartment/en';
import { ru } from './apartment/ru';
import { tr } from './apartment/tr';
import { uk } from './apartment/uk';

/**
 * Virtual German apartment (/german-apartment): UI copy and the texts of every hotspot (title, explanation, tip,
 * common mistake) in all six site languages. Keys under apt.*. Hotspot positions: lib/apartment/hotspots.ts.
 */
export const pagesApartment = { az, de, en, ru, tr, uk };
