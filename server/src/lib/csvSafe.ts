/**
 * CSV / spreadsheet formula injection guard (OWASP "CSV injection"): a cell that starts with = @ TAB CR, or with
 * + / - followed by anything but a plain number or phone number, is prefixed with ' so Excel / LibreOffice show
 * it as text instead of evaluating it (=HYPERLINK(…), +cmd|…, @SUM(…)). Plain numbers ("-12,50", "1.234")
 * and phone numbers ("+49 30 1234") stay untouched, so amounts and contacts still import cleanly.
 */
export const csvSafe = (s: string) => (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+-][\d\s()./,-]*$/.test(s)) ? `'${s}` : s);

/** Undoes csvSafe on import: a ' in front of a formula-like value is dropped again. */
export const csvUnsafe = (s: string) => (/^'[=@+\-\t\r]/.test(s) ? s.slice(1) : s);
