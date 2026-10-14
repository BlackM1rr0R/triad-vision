/**
 * Hand-simplified outlines (lng, lat) for the decorative SVG maps. Accurate enough for orientation,
 * not for cartography.
 */
export type LngLat = [number, number];

export const GERMANY: LngLat[] = [
  [8.6, 54.9], [9.4, 54.82], [9.95, 54.78], [10.05, 54.5], [10.85, 54.35], [11.1, 54.0], [11.5, 53.98], [12.1, 54.18],
  [12.5, 54.47], [13.1, 54.42], [13.42, 54.65], [13.7, 54.3], [14.25, 53.92], [14.4, 53.3], [14.13, 52.83], [14.6, 52.58],
  [14.72, 52.1], [14.75, 51.62], [15.03, 51.27], [14.82, 50.87], [14.35, 50.93], [13.9, 50.78], [13.3, 50.6], [12.95, 50.42],
  [12.3, 50.2], [12.1, 50.3], [12.5, 49.95], [12.45, 49.7], [12.9, 49.35], [13.4, 49.03], [13.84, 48.77], [13.45, 48.57],
  [13.0, 48.28], [12.78, 48.1], [13.0, 47.82], [12.98, 47.5], [12.75, 47.68], [12.2, 47.7], [11.6, 47.6], [11.1, 47.4],
  [10.5, 47.55], [10.2, 47.3], [9.6, 47.53], [9.0, 47.68], [8.6, 47.78], [8.2, 47.6], [7.6, 47.58], [7.55, 48.05],
  [7.8, 48.6], [8.2, 48.97], [7.6, 49.08], [6.75, 49.17], [6.37, 49.46], [6.5, 49.8], [6.15, 50.15], [6.4, 50.33],
  [6.05, 50.72], [6.0, 51.1], [5.95, 51.4], [6.1, 51.85], [6.75, 51.92], [7.05, 52.25], [7.05, 52.65], [7.2, 53.0],
  [7.25, 53.32], [7.0, 53.6], [7.9, 53.73], [8.5, 53.55], [8.65, 53.88], [8.9, 53.95], [8.85, 54.13], [8.6, 54.32],
  [8.95, 54.55], [8.6, 54.9],
];

export const AZERBAIJAN: LngLat[] = [
  [45.0, 41.28], [45.5, 41.45], [46.15, 41.2], [46.5, 41.05], [46.7, 41.35], [46.25, 41.6], [46.55, 41.85], [47.25, 41.65],
  [47.85, 41.22], [48.2, 41.5], [48.6, 41.85], [49.1, 41.35], [49.5, 40.65], [50.38, 40.37], [49.9, 40.3], [49.45, 40.15],
  [49.38, 39.6], [49.0, 39.2], [48.85, 38.85], [48.88, 38.43], [48.35, 38.6], [48.0, 38.9], [48.35, 39.38], [47.85, 39.65],
  [47.3, 39.4], [46.55, 38.9], [46.5, 39.5], [45.95, 39.85], [45.6, 40.25], [45.95, 40.4], [45.4, 40.85], [45.0, 41.28],
];

/** Nakhchivan exclave */
export const NAKHCHIVAN: LngLat[] = [
  [44.8, 39.65], [45.35, 39.55], [45.85, 39.25], [46.15, 38.85], [45.45, 38.95], [44.8, 39.4], [44.8, 39.65],
];

/** Coordinates of German cities used to place partner pins. Keys are lower-case, German and English spellings. */
export const CITY_COORDS: Record<string, LngLat> = {
  berlin: [13.405, 52.52],
  hamburg: [9.993, 53.551],
  münchen: [11.575, 48.137],
  munich: [11.575, 48.137],
  köln: [6.96, 50.94],
  cologne: [6.96, 50.94],
  'frankfurt am main': [8.68, 50.11],
  frankfurt: [8.68, 50.11],
  stuttgart: [9.18, 48.78],
  düsseldorf: [6.78, 51.23],
  dortmund: [7.47, 51.51],
  essen: [7.012, 51.456],
  duisburg: [6.76, 51.43],
  bochum: [7.22, 51.48],
  leipzig: [12.37, 51.34],
  dresden: [13.74, 51.05],
  hannover: [9.73, 52.37],
  hanover: [9.73, 52.37],
  langenhagen: [9.738, 52.447],
  bremen: [8.8, 53.08],
  nürnberg: [11.08, 49.45],
  nuremberg: [11.08, 49.45],
  bonn: [7.098, 50.737],
  kempten: [10.315, 47.726],
  mannheim: [8.466, 49.487],
  versmold: [8.152, 52.041],
  'mörfelden-walldorf': [8.56, 49.99],
  bielefeld: [8.53, 52.02],
  münster: [7.63, 51.96],
  kassel: [9.48, 51.31],
  erfurt: [11.03, 50.98],
  magdeburg: [11.63, 52.13],
  kiel: [10.12, 54.32],
  rostock: [12.1, 54.09],
  augsburg: [10.9, 48.37],
  karlsruhe: [8.4, 49.01],
  freiburg: [7.85, 47.99],
  regensburg: [12.1, 49.01],
  ingolstadt: [11.42, 48.76],
  wolfsburg: [10.79, 52.42],
  braunschweig: [10.52, 52.27],
  saarbrücken: [6.99, 49.24],
  mainz: [8.27, 50.0],
  wiesbaden: [8.24, 50.08],
  potsdam: [13.06, 52.39],
};

export const cityCoords = (city?: string | null): LngLat | null => (city ? CITY_COORDS[city.trim().toLowerCase()] ?? null : null);

/** Equirectangular projection with latitude correction, fitted to a bounding box. */
export const makeProjection = (bounds: { w: number; e: number; s: number; n: number }, width: number, pad = 0) => {
  const k = Math.cos(((bounds.n + bounds.s) / 2) * (Math.PI / 180));
  const spanX = (bounds.e - bounds.w) * k;
  const spanY = bounds.n - bounds.s;
  const scale = (width - pad * 2) / spanX;
  const height = spanY * scale + pad * 2;
  const project = ([lng, lat]: LngLat): [number, number] => [pad + (lng - bounds.w) * k * scale, pad + (bounds.n - lat) * scale];
  const path = (pts: LngLat[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((v) => v.toFixed(1)).join(' ')}`).join('') + 'Z';
  return { project, path, width, height };
};
