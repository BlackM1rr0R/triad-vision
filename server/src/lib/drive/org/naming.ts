import path from 'node:path';
import { prisma } from '../../../db.js';
import { MAX_NAME, pickFreeName, safeUploadName, splitExt } from '../names.js';
import { readSetting, writeSetting } from './flags.js';

/**
 * Automatic file names in client folders: "<Nachname>_<Vorname>_<Dokumenttyp>_<YYYY-MM-DD>.<ext>"
 * (e.g. "Məmmədov_Elçin_Pasport_2026-10-21.pdf"). Letters stay as they are (Azerbaijani and German letters
 * are fine in file names); only characters a file system refuses are dropped. Applies to uploads into a
 * client folder (or below it) and to accepted case documents copied into the drive — never to files that
 * already exist (staff can tidy a folder on purpose: preview first, then apply).
 */
export const NAMING_KEY = 'drive.autoNaming';
export const DEFAULT_PATTERN = '{Nachname}_{Vorname}_{Typ}_{Datum}';
export const NAMING_TOKENS = ['Nachname', 'Vorname', 'Typ', 'Datum', 'Fallnummer'] as const;
export type NamingToken = (typeof NAMING_TOKENS)[number];

export interface NamingSettings {
  enabled: boolean;
  pattern: string;
}

export const getNamingSettings = async (): Promise<NamingSettings> => {
  const v = await readSetting<Partial<NamingSettings>>(NAMING_KEY);
  return { enabled: v?.enabled ?? true, pattern: typeof v?.pattern === 'string' && v.pattern.trim() ? v.pattern : DEFAULT_PATTERN };
};

export const saveNamingSettings = (s: NamingSettings) => writeSetting(NAMING_KEY, s);

/** Document types offered in the upload panel ("Sənəd növü"). */
export const DOC_TYPES = ['Pasport', 'Diplom', 'Attestat', 'Transkript', 'Sertifikat', 'Dil sertifikatı', 'Doğum şəhadətnaməsi', 'Nikah şəhadətnaməsi', 'CV', 'Müqavilə', 'Arayış', 'Foto', 'Tərcümə', 'Apostil', 'Sığorta', 'Digər'];

/** A token value: characters a file system refuses go, runs of white space become "-". */
export const namePart = (raw: string) =>
  raw
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f�()[\]{}]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^[.\-_]+|[.\-_]+$/g, '');

/** "2026-10-21" in Baku time (the office's calendar day). */
export const dayOf = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export type NamingValues = Partial<Record<NamingToken, string | null | undefined>>;

/**
 * Builds the name from the pattern. Empty tokens drop out together with their separator, the extension is
 * kept, and the result is a valid file name (falls back to `fallback` when nothing is left).
 */
export const buildAutoName = (pattern: string, values: NamingValues, ext: string, fallback = 'Dokument') => {
  let base = pattern.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const key = NAMING_TOKENS.find((t) => t.toLowerCase() === k.toLowerCase());
    return key ? namePart(values[key] ?? '') : '';
  });
  base = base.replace(/([_\-. ])[_\-. ]+/g, '$1').replace(/^[_\-. ]+|[_\-. ]+$/g, '');
  const cleanExt = ext.replace(/[^\p{L}\p{N}.]/gu, '').slice(0, 20);
  const max = MAX_NAME - cleanExt.length;
  if (base.length > max) base = base.slice(0, max).replace(/[_\-. ]+$/, '');
  return safeUploadName(`${base || namePart(fallback) || 'Dokument'}${cleanExt}`);
};

/** The base name of an uploaded file, cleaned ("scan 001 (1).pdf" → "scan-001-(1)"). */
export const baseNameOf = (name: string) => namePart(splitExt(path.posix.basename(name.replace(/\\/g, '/')), true)[0]);

export interface CaseNaming {
  caseId: string;
  number: string;
  /** The client folder of the case (Case.driveFolderId). */
  folderId: string;
  firstName: string;
  lastName: string;
}

/** Name of a family member (FAMILY_MEMBER event of the member case). */
const memberNames = async (caseId: string) => {
  const ev = await prisma.caseEvent.findFirst({ where: { caseId, type: 'FAMILY_MEMBER' }, orderBy: { createdAt: 'desc' }, select: { note: true } });
  try {
    const v = JSON.parse(ev?.note ?? '') as { firstName?: unknown; lastName?: unknown };
    const firstName = typeof v.firstName === 'string' ? v.firstName.trim() : '';
    const lastName = typeof v.lastName === 'string' ? v.lastName.trim() : '';
    return firstName || lastName ? { firstName, lastName } : null;
  } catch {
    return null;
  }
};

const namingOf = async (c: { id: string; number: string; driveFolderId: string | null; parentCaseId: string | null; client: { firstName: string; lastName: string } }): Promise<CaseNaming> => {
  const member = c.parentCaseId ? await memberNames(c.id) : null;
  return { caseId: c.id, number: c.number, folderId: c.driveFolderId ?? '', firstName: member?.firstName ?? c.client.firstName, lastName: member?.lastName ?? c.client.lastName };
};

const caseNamingSelect = { id: true, number: true, driveFolderId: true, parentCaseId: true, client: { select: { firstName: true, lastName: true } } } as const;

export const caseNaming = async (caseId: string) => {
  const c = await prisma.case.findUnique({ where: { id: caseId }, select: caseNamingSelect });
  return c ? namingOf(c) : null;
};

/**
 * The case whose client folder is on this chain of folder ids (root first, the folder itself last) — the
 * deepest one wins (a family member's folder sits inside the main applicant's).
 */
export const caseOfChain = async (chainIds: string[]): Promise<CaseNaming | null> => {
  if (!chainIds.length) return null;
  const cases = await prisma.case.findMany({ where: { driveFolderId: { in: chainIds } }, select: caseNamingSelect });
  if (!cases.length) return null;
  const depth = (c: (typeof cases)[number]) => chainIds.indexOf(c.driveFolderId!);
  const best = cases.sort((a, b) => depth(b) - depth(a))[0];
  return namingOf(best);
};

/** The requirement title of a case document (Azerbaijani first), used as the document type. */
export const requirementTitle = (title: unknown) => {
  if (!title || typeof title !== 'object') return '';
  const t = title as Record<string, unknown>;
  for (const k of ['az', 'de', 'en', 'ru']) if (typeof t[k] === 'string' && (t[k] as string).trim()) return (t[k] as string).trim();
  return '';
};

/** The automatic name for a file of a case (or null when naming is off). */
export const autoNameFor = async (c: CaseNaming, opts: { typ?: string | null; date: Date; originalName: string; settings?: NamingSettings }) => {
  const s = opts.settings ?? (await getNamingSettings());
  if (!s.enabled) return null;
  const [, ext] = splitExt(safeUploadName(opts.originalName), true);
  const typ = opts.typ?.trim() || baseNameOf(opts.originalName);
  return buildAutoName(s.pattern, { Nachname: c.lastName, Vorname: c.firstName, Typ: typ, Datum: dayOf(opts.date), Fallnummer: c.number }, ext.toLowerCase());
};

/** A free variant of `name` among `taken` (lower-cased names, updated). */
export const freeIn = (taken: Set<string>, name: string) => pickFreeName(taken, name, true);
