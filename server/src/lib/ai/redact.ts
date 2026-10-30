/**
 * Identifier scrubbing for what the CLIENT assistant sends to the model (grounding snapshot and tool
 * results): passport / ID card numbers, IBANs and labelled Azerbaijani FIN codes become "••••".
 */
const MASK = '••••';
// Passport / ID card numbers (C12345678, AA1234567, AZE12345678); upper case only, so ids and words stay.
const PASSPORT_RE = /\b[A-Z]{1,3}\d{6,9}\b/g;
// IBANs, with or without spaces.
const IBAN_RE = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
// Azerbaijani personal id (FIN, 7 characters with at least one digit) when it is labelled as such.
const FIN_RE = /\b(FIN|FİN|PIN)(\s*(?:kod(?:u)?|code)?\s*[:#-]?\s*)(?=[A-Z]*\d)[0-9A-Z]{7}\b/giu;

/** Masks passport / ID numbers and IBANs in free text (also safe on JSON strings: no quotes are added). */
export const scrubIdentifiers = (text: string) =>
  text.replace(IBAN_RE, MASK).replace(PASSPORT_RE, MASK).replace(FIN_RE, (_m, label: string, sep: string) => `${label}${sep}${MASK}`);
