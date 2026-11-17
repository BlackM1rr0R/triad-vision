import { ANMELDUNG } from './anmeldung';
import { BANK } from './bank';
import { DOCTOR } from './doctor';
import { FLAT_SCAM } from './flatScam';
import { HEATING } from './heating';
import { VIEWING } from './viewing';
import { WORK } from './work';
import type { Scene } from '../types';

/** The simulator scenes in the order shown on /german-simulator. */
export const SCENES: Scene[] = [ANMELDUNG, BANK, DOCTOR, WORK, HEATING, VIEWING, FLAT_SCAM];

/** Scenes also played on /apartment-viewing. */
export const APARTMENT_SCENES: Scene[] = [VIEWING, FLAT_SCAM];

export const sceneById = (id: string | null | undefined) => SCENES.find((s) => s.id === id) ?? null;
