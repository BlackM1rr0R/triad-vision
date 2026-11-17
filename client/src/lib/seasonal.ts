/**
 * Seasonal promotions (footer links, tools hub): which time-bound pages are advertised on a Berlin calendar day.
 * The pages themselves stay reachable all year. Tiny and dependency-free: the footer is on every page.
 */

const BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day in Berlin as YYYY-MM-DD. */
export const berlinDay = (now: Date = new Date()): string => BERLIN.format(now);

/** Advent calendar (/advent-calendar): 15 November – 6 January (Epiphany). */
export const adventPromoActive = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return m === 12 || (m === 11 && d >= 15) || (m === 1 && d <= 6);
};

/** "What changes in 2027" (/changes-2027): 1 October 2026 – 31 March 2027. */
export const changes2027PromoActive = (iso: string) => iso >= '2026-10-01' && iso <= '2027-03-31';
