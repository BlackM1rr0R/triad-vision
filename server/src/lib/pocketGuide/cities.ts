/**
 * Where to register an address (Anmeldung, § 17 BMG: within two weeks of moving in) — for the personalised pocket
 * guide. Only city pages we checked on the city's own official site (2026-11-22) are listed; every other city gets
 * the federal administration portal's "Wohnsitz anmelden" service, which leads to the responsible local office
 * after choosing the place. Matching is by city name or a nearby place (aliases); unknown places → the federal link.
 */

export const BUERGERAMT_CHECKED = '2026-11-22';

/** Bundesportal (verwaltung.bund.de), Leistung 99115005104000 "Wohnsitz anmelden": choose the place to find the office. */
export const FEDERAL_ANMELDUNG_URL = 'https://verwaltung.bund.de/leistungsverzeichnis/de/leistung/99115005104000';

export interface BuergeramtCity {
  name: string;
  url: string;
  aliases: string[];
}

export const BUERGERAMT_CITIES: BuergeramtCity[] = [
  { name: 'Berlin', url: 'https://service.berlin.de/dienstleistung/120686/', aliases: [] },
  { name: 'Hamburg', url: 'https://www.hamburg.de/go/hs', aliases: ['Norderstedt'] },
  { name: 'München', url: 'https://stadt.muenchen.de/service/info/wohnsitz-anmelden-oder-ummelden/1063475/', aliases: ['Munich', 'Muenchen'] },
  { name: 'Stuttgart', url: 'https://www.stuttgart.de/organigramm/leistungen/wohnsitz-anmelden-als-hauptwohnsitz.php', aliases: [] },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');

/** The Bürgeramt link for a city (federal portal when the city is not in the list or unknown). */
export const buergeramtFor = (city: string | null | undefined): { city: string | null; url: string; official: 'city' | 'federal' } => {
  const n = city ? norm(city) : '';
  if (n) {
    for (const c of BUERGERAMT_CITIES) {
      if ([c.name, ...c.aliases].some((x) => norm(x) === n)) return { city: c.name, url: c.url, official: 'city' };
    }
  }
  return { city: city?.trim() || null, url: FEDERAL_ANMELDUNG_URL, official: 'federal' };
};
