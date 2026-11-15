import type { StudyProgramme } from '@prisma/client';
import { csvUnsafe } from '../csvSafe.js';
import { toCsv } from '../bulk/index.js';
import { parseCsv } from '../settlement/rowImportParse.js';
import { formatDeadlines, parseDeadlines, readDeadlines } from './deadlines.js';
import { programmeInput, STATES, type ProgrammeInput } from './catalogue.js';

/**
 * CSV export / import of the programme catalogue (Admin → Study programmes), so staff can add many programmes
 * from a spreadsheet. Export: semicolon-separated with BOM (Excel in de/az); import: , ; or tab, a header row
 * with these column names (any order, case-insensitive; unknown columns are ignored). Rows are matched by
 * `slug`: an existing slug is updated, an empty or new slug creates a programme. All-or-nothing: one invalid
 * row → nothing is written and every error is reported with its row number.
 */

const LANGS = ['az', 'de', 'en', 'ru'] as const;

export const CSV_COLUMNS = [
  'slug',
  'name',
  'university',
  'city',
  'federalState',
  'degree',
  'subjectArea',
  'teachingLanguage',
  'languageRequirement',
  'durationSemesters',
  'tuitionPerSemester',
  'semesterContribution',
  'deadlines',
  'applicationRoute',
  'officialUrl',
  'published',
  'featured',
  ...LANGS.map((l) => `description_${l}`),
  ...LANGS.map((l) => `requirements_${l}`),
  'staffNote',
  'checkedAt',
] as const;

/** List items in one cell. */
const ITEM_SEP = ' | ';

const asRecord = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const programmesCsv = (rows: StudyProgramme[]) =>
  toCsv(
    [...CSV_COLUMNS],
    rows.map((r) => {
      const d = asRecord(r.description);
      const q = asRecord(r.requirements);
      return [
        r.slug,
        r.name,
        r.university,
        r.city,
        r.federalState,
        r.degree,
        r.subjectArea,
        r.teachingLanguage,
        r.languageRequirement ?? '',
        r.durationSemesters,
        r.tuitionPerSemester,
        r.semesterContribution ?? '',
        formatDeadlines(readDeadlines(r.deadlines)),
        r.applicationRoute,
        r.officialUrl,
        r.published ? 'yes' : 'no',
        r.featured ? 'yes' : 'no',
        ...LANGS.map((l) => (typeof d[l] === 'string' ? (d[l] as string) : '')),
        ...LANGS.map((l) => (Array.isArray(q[l]) ? (q[l] as string[]).join(ITEM_SEP) : '')),
        r.staffNote ?? '',
        r.checkedAt ? r.checkedAt.toISOString().slice(0, 10) : '',
      ];
    }),
  );

const YES = /^(1|y|yes|true|ja|bəli|beli|да|x)$/i;
const NO = /^(0|n|no|false|nein|xeyr|нет|)$/i;

const stateCode = (v: string) => {
  const s = v.trim();
  if ((Object.keys(STATES) as string[]).includes(s.toUpperCase())) return s.toUpperCase();
  const byName = Object.entries(STATES).find(([, n]) => n.toLowerCase() === s.toLowerCase());
  return byName?.[0] ?? s;
};

export interface ImportRow {
  row: number;
  slug: string | null;
  input: ProgrammeInput;
}
export interface ImportError {
  row: number;
  error: string;
}

/** CSV text → validated programme inputs (row numbers count the header as row 1). */
export const parseProgrammesCsv = (text: string): { rows: ImportRow[]; errors: ImportError[] } => {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], errors: [{ row: 1, error: 'EMPTY_FILE' }] };
  const header = table[0].map((h) => h.trim().replace(/^﻿/, '').toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const missing = ['name', 'university', 'city', 'federalState', 'degree', 'subjectArea', 'teachingLanguage', 'durationSemesters', 'applicationRoute', 'officialUrl'].filter((c) => col(c) < 0);
  if (missing.length) return { rows: [], errors: [{ row: 1, error: `MISSING_COLUMNS: ${missing.join(', ')}` }] };
  if (table.length > 501) return { rows: [], errors: [{ row: 1, error: 'TOO_MANY_ROWS (max 500)' }] };

  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();
  table.slice(1).forEach((cells, i) => {
    const row = i + 2;
    const get = (name: string) => {
      const c = col(name);
      return c >= 0 && cells[c] !== undefined ? csvUnsafe(cells[c].trim()) : '';
    };
    const bool = (name: string) => {
      const v = get(name);
      if (YES.test(v)) return true;
      if (NO.test(v)) return false;
      return null;
    };
    const dl = parseDeadlines(get('deadlines'));
    if (!dl.ok) {
      errors.push({ row, error: dl.error });
      return;
    }
    const published = bool('published');
    const featured = bool('featured');
    if (published === null || featured === null) {
      errors.push({ row, error: 'YES_NO: published / featured' });
      return;
    }
    const description = Object.fromEntries(LANGS.map((l) => [l, get(`description_${l}`)])) as Record<(typeof LANGS)[number], string>;
    const requirements = Object.fromEntries(
      LANGS.map((l) => [
        l,
        get(`requirements_${l}`)
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean),
      ]),
    ) as Record<(typeof LANGS)[number], string[]>;
    const num = (name: string) => (get(name) === '' ? undefined : get(name).replace(/[\s.](?=\d{3}\b)/g, '').replace(',', '.'));
    const parsed = programmeInput.safeParse({
      slug: get('slug').toLowerCase(),
      name: get('name'),
      university: get('university'),
      city: get('city'),
      federalState: stateCode(get('federalState')),
      degree: get('degree').toUpperCase().replace(/[\s-]+/g, '_'),
      subjectArea: get('subjectArea').toLowerCase(),
      teachingLanguage: get('teachingLanguage').toUpperCase().replace(/[\s/+,-]+/g, '_'),
      languageRequirement: get('languageRequirement') || null,
      durationSemesters: num('durationSemesters'),
      tuitionPerSemester: num('tuitionPerSemester') ?? 0,
      semesterContribution: num('semesterContribution') ?? null,
      deadlines: dl.value,
      applicationRoute: get('applicationRoute').toUpperCase().replace(/[\s-]+/g, '_'),
      officialUrl: get('officialUrl'),
      published,
      featured,
      description,
      requirements,
      staffNote: get('staffNote') || null,
      checkedAt: get('checkedAt') || null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push({ row, error: `${issue.path.join('.') || 'row'}: ${issue.message}` });
      return;
    }
    const slug = parsed.data.slug ?? null;
    if (slug) {
      if (seen.has(slug)) {
        errors.push({ row, error: `DUPLICATE_SLUG: ${slug}` });
        return;
      }
      seen.add(slug);
    }
    rows.push({ row, slug, input: parsed.data });
  });
  return { rows, errors };
};
