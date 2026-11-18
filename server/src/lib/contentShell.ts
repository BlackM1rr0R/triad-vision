/**
 * Light variant of GET /api/public/content (?fields=shell) for the website: header, footer, home sections,
 * cards and lists need every visa category and service, but not their long texts (body, requirements,
 * documents, FAQ, steps…: most of the payload, in four languages). The detail pages fetch those from
 * /public/visa/:slug and /public/services/:slug. The full answer (no `fields`) stays as it is (mobile app).
 *
 * An allowlist, so a new long field added to the models never lands in the payload every page embeds.
 */
export const VISA_SHELL_FIELDS = [
  'id',
  'slug',
  'icon',
  'image',
  'visaLabel',
  'title',
  'summary',
  'items',
  'germanLevel',
  'salaryMin',
  'salaryMax',
  'processingMin',
  'processingMax',
  'familyReunion',
  'sortOrder',
  'published',
] as const;

export const SERVICE_SHELL_FIELDS = ['id', 'slug', 'icon', 'image', 'audience', 'title', 'summary', 'duration', 'sortOrder', 'published'] as const;

const pick = <T extends object>(row: T, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => k in row).map((k) => [k, (row as Record<string, unknown>)[k]]));

export const toContentShell = <C extends { visaCategories: object[]; services: object[] }>(content: C) => ({
  ...content,
  visaCategories: content.visaCategories.map((v) => pick(v, VISA_SHELL_FIELDS)),
  services: content.services.map((s) => pick(s, SERVICE_SHELL_FIELDS)),
});
