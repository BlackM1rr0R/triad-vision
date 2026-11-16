/**
 * Coordinates (WGS84, city centre, rounded to 0.01°) of German cities our clients move to, for the distance
 * slide of the visa story ("Baku → Hamburg: 2,9xx km as the crow flies"). Plain data, no lookup service.
 * A city that is not listed gives no distance — the story then shows the country only (never a guess).
 */

export const BAKU = { lat: 40.41, lng: 49.87 } as const;

export const GERMAN_CITIES: Record<string, { lat: number; lng: number }> = {
  aachen: { lat: 50.78, lng: 6.08 },
  augsburg: { lat: 48.37, lng: 10.9 },
  'bad homburg': { lat: 50.23, lng: 8.62 },
  bamberg: { lat: 49.89, lng: 10.89 },
  bayreuth: { lat: 49.94, lng: 11.58 },
  berlin: { lat: 52.52, lng: 13.4 },
  bielefeld: { lat: 52.02, lng: 8.53 },
  bochum: { lat: 51.48, lng: 7.22 },
  bonn: { lat: 50.74, lng: 7.1 },
  braunschweig: { lat: 52.27, lng: 10.52 },
  bremen: { lat: 53.08, lng: 8.8 },
  bremerhaven: { lat: 53.55, lng: 8.58 },
  chemnitz: { lat: 50.83, lng: 12.92 },
  cottbus: { lat: 51.76, lng: 14.33 },
  darmstadt: { lat: 49.87, lng: 8.65 },
  dortmund: { lat: 51.51, lng: 7.47 },
  dresden: { lat: 51.05, lng: 13.74 },
  duisburg: { lat: 51.43, lng: 6.76 },
  duesseldorf: { lat: 51.23, lng: 6.77 },
  erfurt: { lat: 50.98, lng: 11.03 },
  erlangen: { lat: 49.6, lng: 11.0 },
  essen: { lat: 51.46, lng: 7.01 },
  flensburg: { lat: 54.79, lng: 9.44 },
  frankfurt: { lat: 50.11, lng: 8.68 },
  'frankfurt am main': { lat: 50.11, lng: 8.68 },
  'frankfurt (oder)': { lat: 52.35, lng: 14.55 },
  freiburg: { lat: 47.99, lng: 7.85 },
  'freiburg im breisgau': { lat: 47.99, lng: 7.85 },
  fulda: { lat: 50.55, lng: 9.68 },
  gelsenkirchen: { lat: 51.51, lng: 7.1 },
  giessen: { lat: 50.58, lng: 8.68 },
  goettingen: { lat: 51.54, lng: 9.93 },
  guetersloh: { lat: 51.91, lng: 8.38 },
  hagen: { lat: 51.36, lng: 7.47 },
  halle: { lat: 51.48, lng: 11.97 },
  'halle (saale)': { lat: 51.48, lng: 11.97 },
  hamburg: { lat: 53.55, lng: 9.99 },
  hamm: { lat: 51.68, lng: 7.82 },
  hannover: { lat: 52.37, lng: 9.73 },
  heidelberg: { lat: 49.4, lng: 8.67 },
  heilbronn: { lat: 49.14, lng: 9.22 },
  herne: { lat: 51.54, lng: 7.22 },
  hildesheim: { lat: 52.15, lng: 9.95 },
  ingolstadt: { lat: 48.76, lng: 11.43 },
  jena: { lat: 50.93, lng: 11.59 },
  kaiserslautern: { lat: 49.44, lng: 7.77 },
  karlsruhe: { lat: 49.01, lng: 8.4 },
  kassel: { lat: 51.31, lng: 9.48 },
  kiel: { lat: 54.32, lng: 10.13 },
  koblenz: { lat: 50.36, lng: 7.59 },
  koeln: { lat: 50.94, lng: 6.96 },
  cologne: { lat: 50.94, lng: 6.96 },
  konstanz: { lat: 47.66, lng: 9.18 },
  krefeld: { lat: 51.33, lng: 6.56 },
  landshut: { lat: 48.54, lng: 12.15 },
  leipzig: { lat: 51.34, lng: 12.37 },
  leverkusen: { lat: 51.03, lng: 6.98 },
  ludwigsburg: { lat: 48.9, lng: 9.19 },
  ludwigshafen: { lat: 49.48, lng: 8.44 },
  'ludwigshafen am rhein': { lat: 49.48, lng: 8.44 },
  luebeck: { lat: 53.87, lng: 10.69 },
  lueneburg: { lat: 53.25, lng: 10.41 },
  magdeburg: { lat: 52.12, lng: 11.63 },
  mainz: { lat: 50.0, lng: 8.27 },
  mannheim: { lat: 49.49, lng: 8.47 },
  marburg: { lat: 50.81, lng: 8.77 },
  moenchengladbach: { lat: 51.19, lng: 6.44 },
  muelheim: { lat: 51.43, lng: 6.88 },
  'muelheim an der ruhr': { lat: 51.43, lng: 6.88 },
  muenchen: { lat: 48.14, lng: 11.58 },
  munich: { lat: 48.14, lng: 11.58 },
  muenster: { lat: 51.96, lng: 7.63 },
  neuss: { lat: 51.2, lng: 6.69 },
  nuernberg: { lat: 49.45, lng: 11.08 },
  nuremberg: { lat: 49.45, lng: 11.08 },
  oberhausen: { lat: 51.47, lng: 6.85 },
  offenbach: { lat: 50.1, lng: 8.77 },
  'offenbach am main': { lat: 50.1, lng: 8.77 },
  oldenburg: { lat: 53.14, lng: 8.21 },
  osnabrueck: { lat: 52.28, lng: 8.05 },
  paderborn: { lat: 51.72, lng: 8.75 },
  passau: { lat: 48.57, lng: 13.43 },
  pforzheim: { lat: 48.89, lng: 8.7 },
  potsdam: { lat: 52.39, lng: 13.06 },
  regensburg: { lat: 49.01, lng: 12.1 },
  remscheid: { lat: 51.18, lng: 7.19 },
  reutlingen: { lat: 48.49, lng: 9.21 },
  rosenheim: { lat: 47.86, lng: 12.12 },
  rostock: { lat: 54.09, lng: 12.14 },
  saarbruecken: { lat: 49.24, lng: 6.99 },
  salzgitter: { lat: 52.15, lng: 10.33 },
  schwerin: { lat: 53.63, lng: 11.41 },
  siegen: { lat: 50.87, lng: 8.02 },
  solingen: { lat: 51.17, lng: 7.08 },
  stuttgart: { lat: 48.78, lng: 9.18 },
  trier: { lat: 49.76, lng: 6.64 },
  ulm: { lat: 48.4, lng: 9.99 },
  wiesbaden: { lat: 50.08, lng: 8.24 },
  wolfsburg: { lat: 52.42, lng: 10.79 },
  wuppertal: { lat: 51.26, lng: 7.15 },
  wuerzburg: { lat: 49.79, lng: 9.95 },
  zwickau: { lat: 50.72, lng: 12.5 },
};

/** "München" / "Muenchen" / "Frankfurt am Main" → lookup key (lowercase, umlauts folded, spaces collapsed). */
export const cityKey = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');

/** Coordinates of a German city, or null when it is not in the table (exact key, then without a suffix like "a. M."). */
export const coordsOf = (city: string | null | undefined) => {
  if (!city) return null;
  const key = cityKey(city);
  if (GERMAN_CITIES[key]) return GERMAN_CITIES[key];
  const head = key.split(/[\s/(-]/)[0];
  return GERMAN_CITIES[head] ?? null;
};
