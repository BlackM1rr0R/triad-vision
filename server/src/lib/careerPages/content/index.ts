import type { CareerCopy, CareerLocale } from '../types.js';
import { AZ } from './az.js';
import { RU } from './ru.js';
import { TR } from './tr.js';
import { EN } from './en.js';
import { DE } from './de.js';

/** Career page texts per written language (lib/careerPages/types.ts). */
export const CAREER_COPY: Record<CareerLocale, CareerCopy> = { az: AZ, ru: RU, tr: TR, en: EN, de: DE };
