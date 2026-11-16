import { ANMELDUNG } from './anmeldung';
import { BANK } from './bank';
import { DOCTOR } from './doctor';
import { HEATING } from './heating';
import { WORK } from './work';
import type { Scene } from '../types';

/** The simulator scenes in the order shown on /german-simulator. */
export const SCENES: Scene[] = [ANMELDUNG, BANK, DOCTOR, WORK, HEATING];

export const sceneById = (id: string | null | undefined) => SCENES.find((s) => s.id === id) ?? null;
