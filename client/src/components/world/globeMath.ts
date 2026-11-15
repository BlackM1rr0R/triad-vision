/**
 * Orthographic projection of the home globe — the same maths as the WebGL globe (cobe 2.0.1: lat/lng → unit
 * vector, rotation by phi / theta, sphere radius 0.8 of the half canvas), so the static SVG globe (server render,
 * reduced motion, no WebGL) and the HTML labels over the canvas sit exactly where the WebGL markers are drawn.
 * Pure, no imports.
 */

export type Vec3 = [number, number, number];
export type LatLng = [lat: number, lng: number];

/** Sphere radius as a fraction of half the canvas (cobe's constant). */
export const SPHERE_R = 0.8;
export const BAKU: LatLng = [40.4093, 49.8671];

const RAD = Math.PI / 180;

/** cobe's U(): [lat, lng] → point on the unit sphere. */
export const toVec = ([lat, lng]: LatLng): Vec3 => {
  const r = lat * RAD;
  const a = lng * RAD - Math.PI;
  const c = Math.cos(r);
  return [-c * Math.cos(a), Math.sin(r), c * Math.sin(a)];
};

/** phi that turns a longitude to the centre of the view (cobe rotates the globe by phi around its axis). */
export const phiFor = (lng: number): number => {
  const p = 1.5 * Math.PI - lng * RAD;
  const t = 2 * Math.PI;
  return ((p % t) + t) % t;
};

/** View of the globe: centred between Germany and Azerbaijan, tilted so that ~45° N faces the viewer. */
export const HOME_VIEW = { phi: phiFor(31), theta: 0.42 };

/**
 * Screen position of a point (already scaled to its radius, e.g. SPHERE_R for the surface) in [0, 1]² of the
 * square canvas, and whether it is on the visible side (or outside the disc, like a high arc).
 */
export const projectVec = (v: Vec3, phi: number, theta: number) => {
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const x = cp * v[0] + sp * v[2];
  const y = sp * st * v[0] + ct * v[1] - cp * st * v[2];
  const z = -sp * ct * v[0] + st * v[1] + cp * ct * v[2];
  return { x: (x + 1) / 2, y: (-y + 1) / 2, z, front: z >= 0 || x * x + y * y >= SPHERE_R * SPHERE_R };
};

export const project = (ll: LatLng, phi: number, theta: number, elevation = 0) => {
  const v = toVec(ll);
  const r = SPHERE_R + elevation;
  return projectVec([v[0] * r, v[1] * r, v[2] * r], phi, theta);
};

/** Points of the great-circle arc between two places, lifted by up to `height` in the middle (n + 1 points). */
export const arcPoints = (from: LatLng, to: LatLng, height = 0.12, n = 32): Vec3[] => {
  const a = toVec(from);
  const b = toVec(to);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const s = Math.sin(omega) || 1;
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const ka = omega ? Math.sin((1 - t) * omega) / s : 1 - t;
    const kb = omega ? Math.sin(t * omega) / s : t;
    const r = SPHERE_R + height * Math.sin(Math.PI * t) * Math.min(1, omega * 2);
    out.push([(a[0] * ka + b[0] * kb) * r, (a[1] * ka + b[1] * kb) * r, (a[2] * ka + b[2] * kb) * r]);
  }
  return out;
};

/** SVG path of the visible parts of a polyline on the sphere (size = the square's side in SVG units). */
export const visiblePath = (pts: Vec3[], phi: number, theta: number, size: number, close = false): string => {
  let d = '';
  let pen = false;
  for (const p of pts) {
    const q = projectVec(p, phi, theta);
    if (!q.front) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${(q.x * size).toFixed(1)} ${(q.y * size).toFixed(1)}`;
    pen = true;
  }
  return close && d ? `${d}Z` : d;
};

/** A line of constant latitude or longitude, as points on the sphere surface. */
export const graticuleLine = (kind: 'lat' | 'lng', value: number, step = 4): Vec3[] => {
  const pts: Vec3[] = [];
  if (kind === 'lat') for (let lng = -180; lng <= 180; lng += step) pts.push(scaled(toVec([value, lng])));
  else for (let lat = -90; lat <= 90; lat += step) pts.push(scaled(toVec([lat, value])));
  return pts;
};

const scaled = (v: Vec3, r = SPHERE_R): Vec3 => [v[0] * r, v[1] * r, v[2] * r];

/** [lng, lat] outline (geo.ts order) → points on the sphere surface. */
export const outlinePoints = (ring: [number, number][]): Vec3[] => ring.map(([lng, lat]) => scaled(toVec([lat, lng])));
