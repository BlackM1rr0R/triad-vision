/**
 * Pure naming of client folders of cases a referral partner brought (ReferralPartner.isReferrer): the folder stays in
 * Anträge/<Visumart>/<Kategorie> and its name ends with " · Ref <partner name>". German partner firms are not
 * referrers (their folders live under Partner/<name>). No I/O.
 */
import { cleanName } from './names.js';

const MARK = ' · Ref ';
const TAIL = / · Ref [^·]+$/;

/** "Vorname Nachname · Pass-Nr. X" → "… · Ref <partner>" (unchanged without a partner name). */
export const withReferrer = (base: string, partnerName: string | null | undefined) => {
  const p = (partnerName ?? '').trim();
  if (!p) return base;
  return cleanName(`${stripReferrer(base)}${MARK}${p}`);
};

/** The folder name without a trailing " · Ref <partner>". */
export const stripReferrer = (name: string) => name.replace(TAIL, '').trim();

/** The referring partner named in a folder name (null when there is none). */
export const referrerOf = (name: string) => {
  const m = TAIL.exec(name);
  return m ? m[0].slice(MARK.length).trim() || null : null;
};
