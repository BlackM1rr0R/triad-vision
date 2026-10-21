import type { Prisma, VisaType } from '@prisma/client';
import { prisma } from '../../../db.js';
import { badRequest } from '../../http.js';
import { checkName } from '../names.js';
import { runOnce } from './flags.js';

/**
 * Folder templates: the sub-folders created inside every new client folder, per visa type and optionally per
 * visa category (category match > visa type match > a default template with neither). Folder names are
 * German like the rest of the drive; "a/b" nests. A template folder named like a stage folder
 * ("Sonstiges", "Botschaftsunterlagen" …) simply is that stage folder: accepted case documents land in it.
 * Applying a template only ever adds missing folders — nothing is moved, renamed or deleted.
 */

export const DEFAULT_TEMPLATES: { name: string; visaType: VisaType | null; folders: string[] }[] = [
  { name: 'Arbeitsvisum', visaType: 'WORK', folders: ['Reisepass', 'Abschlüsse & Zeugnisse', 'Arbeitsvertrag', 'Anerkennung', 'Botschaft', 'Sonstiges'] },
  { name: 'Ausbildung', visaType: 'AUSBILDUNG', folders: ['Reisepass', 'Schulzeugnisse', 'Sprachzertifikat', 'Ausbildungsvertrag', 'Botschaft', 'Sonstiges'] },
  { name: 'Weiterbildung', visaType: 'WEITERBILDUNG', folders: ['Reisepass', 'Abschlüsse & Zeugnisse', 'Sprachzertifikat', 'Anerkennung', 'Weiterbildungsvertrag', 'Botschaft', 'Sonstiges'] },
  { name: 'Jobsuche (Chancenkarte)', visaType: 'JOB_SEEKER', folders: ['Reisepass', 'Abschlüsse & Zeugnisse', 'Sprachzertifikat', 'Anerkennung', 'Finanzierungsnachweis', 'Botschaft', 'Sonstiges'] },
  { name: 'Studienvisum', visaType: 'STUDY', folders: ['Reisepass', 'Schulzeugnisse', 'Zulassung', 'Sprachzertifikat', 'Sperrkonto', 'Krankenversicherung', 'Botschaft', 'Sonstiges'] },
  { name: 'Familiennachzug', visaType: 'FAMILY', folders: ['Reisepass', 'Heirats- und Geburtsurkunde', 'Sprachzertifikat', 'Nachweise', 'Botschaft', 'Sonstiges'] },
  { name: 'Besuchervisum', visaType: 'TOURIST', folders: ['Reisepass', 'Einladung', 'Reiseversicherung', 'Finanzierungsnachweis', 'Botschaft', 'Sonstiges'] },
  { name: 'Standard', visaType: null, folders: ['Reisepass', 'Dokumente', 'Botschaft', 'Sonstiges'] },
];

export const seedFolderTemplates = () =>
  runOnce('drive.org.templatesSeeded', async () => {
    if (await prisma.driveFolderTemplate.count()) return;
    await prisma.driveFolderTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t) => ({ name: t.name, visaType: t.visaType, folders: t.folders })) });
  });

/** Validates and normalises a folder list ("a / b" → "a/b"); throws 400 INVALID_FOLDER_NAME. */
export const cleanFolderList = (raw: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw) {
    const parts = line
      .split('/')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) continue;
    if (parts.length > 5) throw badRequest('TOO_DEEP');
    const path = parts.map((p) => checkName(p, 'FOLDER')).join('/');
    const key = path.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  if (out.length > 60) throw badRequest('TOO_MANY_FOLDERS');
  return out;
};

export const foldersOf = (v: Prisma.JsonValue): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The best active template for a case: category match > visa type match > default (neither set). */
export const pickTemplate = async (visaType: VisaType | null, visaCategoryId: string | null) => {
  const all = await prisma.driveFolderTemplate.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  return (
    (visaCategoryId ? all.find((t) => t.visaCategoryId === visaCategoryId) : undefined) ??
    (visaType ? all.find((t) => !t.visaCategoryId && t.visaType === visaType) : undefined) ??
    all.find((t) => !t.visaCategoryId && !t.visaType) ??
    null
  );
};

const lower = (s: string) => s.toLocaleLowerCase('en');

/** Live sub-folder with this name (ignoring case), created when missing. Returns [id, created]. */
const ensureSub = async (parentId: string, name: string): Promise<[string, boolean]> => {
  const rows = await prisma.driveNode.findMany({ where: { parentId, name, deletedAt: null }, select: { id: true, name: true, kind: true }, orderBy: { createdAt: 'asc' } });
  const hit = rows.find((r) => lower(r.name) === lower(name));
  if (hit) return [hit.kind === 'FOLDER' ? hit.id : '', false];
  const created = await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name, parentId }, select: { id: true } });
  return [created.id, true];
};

/** Creates the missing folders of `folders` below `folderId`. Returns how many were created. */
export const applyFolders = async (folderId: string, folders: string[]) => {
  let created = 0;
  for (const path of folders) {
    let parent = folderId;
    for (const part of path.split('/')) {
      const [id, made] = await ensureSub(parent, part);
      if (made) created++;
      if (!id) break; // a file with that name is in the way
      parent = id;
    }
  }
  return created;
};

/** Applies the case's best template to its client folder (missing folders only). Never throws. */
export const applyTemplateToCaseFolder = async (c: { id: string; visaType: VisaType | null; visaCategoryId: string | null }, folderId: string) => {
  try {
    const tpl = await pickTemplate(c.visaType, c.visaCategoryId);
    if (!tpl) return { templateId: null, created: 0 };
    return { templateId: tpl.id, created: await applyFolders(folderId, foldersOf(tpl.folders)) };
  } catch (err) {
    console.error(`[drive] folder template for case ${c.id} failed`, err);
    return { templateId: null, created: 0 };
  }
};

/**
 * "Apply to existing client folders": every live client folder gets the missing folders of its best template
 * (only the cases whose best template is `templateId`, when given).
 */
export const applyTemplatesToExisting = async (templateId?: string | null) => {
  let folders = 0;
  let created = 0;
  let cursor: string | undefined;
  for (;;) {
    const cases = await prisma.case.findMany({
      where: { driveFolderId: { not: null } },
      select: { id: true, visaType: true, visaCategoryId: true, driveFolderId: true },
      orderBy: { id: 'asc' },
      take: 200,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!cases.length) break;
    const live = new Set(
      (await prisma.driveNode.findMany({ where: { id: { in: cases.map((c) => c.driveFolderId!) }, deletedAt: null, kind: 'FOLDER' }, select: { id: true } })).map((n) => n.id),
    );
    for (const c of cases) {
      if (!live.has(c.driveFolderId!)) continue;
      const tpl = await pickTemplate(c.visaType, c.visaCategoryId);
      if (!tpl || (templateId && tpl.id !== templateId)) continue;
      const n = await applyFolders(c.driveFolderId!, foldersOf(tpl.folders));
      folders++;
      created += n;
    }
    cursor = cases[cases.length - 1].id;
  }
  return { folders, created };
};
