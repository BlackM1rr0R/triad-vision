/**
 * Speaker profiles of the listening scripts: browsers expose a few German voices (often only one), so speakers are
 * told apart by voice where possible and always by pitch and rate. Voice names give a gender hint on common
 * systems (Windows "Katja"/"Conrad", macOS "Anna"/"Markus", Google "Deutsch" …). Pure: unit-tested.
 */
import type { VoiceKey } from './types';

export interface VoiceProfile {
  gender: 'f' | 'm';
  pitch: number;
  rate: number;
  /** Which of the matching voices to take (so two women sound different when two female voices exist). */
  variant: number;
}

export const VOICE_PROFILES: Record<VoiceKey, VoiceProfile> = {
  w1: { gender: 'f', pitch: 1.15, rate: 1, variant: 0 },
  w2: { gender: 'f', pitch: 0.98, rate: 1.04, variant: 1 },
  m1: { gender: 'm', pitch: 0.78, rate: 0.95, variant: 0 },
  m2: { gender: 'm', pitch: 0.9, rate: 1.03, variant: 1 },
  ann: { gender: 'f', pitch: 1.02, rate: 0.9, variant: 2 },
};

const FEMALE = ['katja', 'hedda', 'anna', 'petra', 'helena', 'marlene', 'vicki', 'amala', 'seraphina', 'louisa', 'elke', 'gisela', 'klara', 'sabine', 'tanja', 'female', 'frau'];
const MALE = ['conrad', 'stefan', 'markus', 'yannick', 'hans', 'killian', 'florian', 'jonas', 'ralf', 'bernd', 'viktor', 'christoph', 'male', 'mann'];

export interface VoiceLike {
  name: string;
  lang: string;
}

const isGerman = (v: VoiceLike) => v.lang.toLowerCase().replace('_', '-').startsWith('de');
const genderOf = (v: VoiceLike): 'f' | 'm' | null => {
  const n = v.name.toLowerCase();
  if (FEMALE.some((x) => n.includes(x))) return 'f';
  if (MALE.some((x) => n.includes(x))) return 'm';
  return null;
};

/** The voice for a speaker: a German voice of the speaker's gender if known, else any German voice; null if none. */
export const pickVoice = <V extends VoiceLike>(voices: readonly V[], profile: VoiceProfile): V | null => {
  const german = voices.filter(isGerman);
  if (!german.length) return null;
  // de-DE first, then other German variants (de-AT, de-CH).
  german.sort((a, b) => Number(!a.lang.startsWith('de-DE') && !a.lang.startsWith('de_DE')) - Number(!b.lang.startsWith('de-DE') && !b.lang.startsWith('de_DE')));
  const same = german.filter((v) => genderOf(v) === profile.gender);
  const pool = same.length ? same : german;
  return pool[profile.variant % pool.length];
};
