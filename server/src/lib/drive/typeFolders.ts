import type { VaultDocKind } from '@prisma/client';
import { prisma } from '../../db.js';
import { typeForRequirementKey, type DocType } from '../uploadAi/types.js';

/**
 * One sub-folder per document type inside a client folder ("Reisepass", "Lebenslauf", "Diplom" …): client
 * uploads, application uploads and accepted case documents land in the folder of their type, so staff find a
 * client's passport in "<client folder>/Reisepass". German names like every folder of the drive.
 *
 * The first name of each list is the folder created when none exists; the others are folders the folder
 * templates (lib/drive/org/templates.ts) may already have created for the same kind of document — an existing
 * one is used instead of adding a second folder ("Abschlüsse & Zeugnisse" for a diploma). Types without a
 * folder (OTHER) fall back to the stage folder (Erstdokumente, Botschaftsunterlagen …).
 */
export const TYPE_FOLDERS: Record<DocType, string[] | null> = {
  PASSPORT: ['Reisepass'],
  ID_CARD: ['Personalausweis'],
  BIRTH_CERT: ['Geburtsurkunde', 'Heirats- und Geburtsurkunde'],
  MARRIAGE_CERT: ['Heiratsurkunde', 'Heirats- und Geburtsurkunde'],
  DIPLOMA: ['Diplom', 'Abschlüsse & Zeugnisse', 'Schulzeugnisse'],
  TRANSCRIPT: ['Diplom', 'Abschlüsse & Zeugnisse', 'Schulzeugnisse'],
  VOCATIONAL_CERT: ['Berufsabschluss', 'Abschlüsse & Zeugnisse'],
  DRIVING_LICENCE: ['Führerschein'],
  CV: ['Lebenslauf'],
  PHOTO: ['Foto'],
  EMPLOYMENT_CONTRACT: ['Arbeitsvertrag', 'Ausbildungsvertrag', 'Weiterbildungsvertrag'],
  JOB_OFFER: ['Arbeitsvertrag', 'Ausbildungsvertrag', 'Weiterbildungsvertrag'],
  EMPLOYMENT_REFERENCE: ['Arbeitszeugnis', 'Abschlüsse & Zeugnisse'],
  LANGUAGE_CERT: ['Sprachzertifikat'],
  RECOGNITION_DECISION: ['Anerkennung'],
  INSURANCE: ['Krankenversicherung', 'Reiseversicherung'],
  BANK_STATEMENT: ['Finanzierungsnachweis', 'Sperrkonto'],
  POLICE_CERT: ['Führungszeugnis'],
  VISA: ['Visum'],
  RESIDENCE_PERMIT: ['Aufenthaltstitel'],
  OTHER: null,
};

/** Vault kinds (client document vault, application uploads) → recogniser types. */
export const VAULT_KIND_TYPE: Record<VaultDocKind, DocType> = {
  PASSPORT: 'PASSPORT',
  ID_CARD: 'ID_CARD',
  PHOTO: 'PHOTO',
  DIPLOMA: 'DIPLOMA',
  TRANSCRIPT: 'TRANSCRIPT',
  CERTIFICATE: 'VOCATIONAL_CERT',
  EMPLOYMENT_REF: 'EMPLOYMENT_REFERENCE',
  LANGUAGE_CERT: 'LANGUAGE_CERT',
  DRIVING_LICENCE: 'DRIVING_LICENCE',
  BIRTH_CERT: 'BIRTH_CERT',
  MARRIAGE_CERT: 'MARRIAGE_CERT',
  POLICE_CLEARANCE: 'POLICE_CERT',
  CV: 'CV',
  OTHER: 'OTHER',
};

/** The type a case document belongs to by its requirement (null: no folder of its own). */
export const typeOfRequirement = (requirementKey: string | null | undefined): DocType | null => {
  const t = typeForRequirementKey(requirementKey);
  return t && TYPE_FOLDERS[t] ? t : null;
};

const lower = (s: string) => s.toLocaleLowerCase('en');

/** Is `name` one of the folder names of `type`? */
export const isTypeFolderName = (type: DocType, name: string) => (TYPE_FOLDERS[type] ?? []).some((n) => lower(n) === lower(name));

/**
 * The type folder below `clientFolderId` without creating it: an existing folder (the primary name first, then
 * the template names), else `{ id: null, name: <primary> }`. Null for types without a folder.
 */
export const findTypeFolder = async (clientFolderId: string, type: DocType): Promise<{ id: string | null; name: string } | null> => {
  const names = TYPE_FOLDERS[type];
  if (!names) return null;
  const rows = await prisma.driveNode.findMany({ where: { parentId: clientFolderId, kind: 'FOLDER', deletedAt: null, name: { in: names } }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } });
  for (const n of names) {
    const hit = rows.find((r) => lower(r.name) === lower(n));
    if (hit) return { id: hit.id, name: hit.name };
  }
  return { id: null, name: names[0] };
};

/** The type folder below `clientFolderId`, created when missing (null for types without a folder). */
export const ensureTypeFolder = async (clientFolderId: string, type: DocType): Promise<string | null> => {
  const found = await findTypeFolder(clientFolderId, type);
  if (!found) return null;
  if (found.id) return found.id;
  return (await prisma.driveNode.create({ data: { space: 'SHARED', kind: 'FOLDER', name: found.name, parentId: clientFolderId }, select: { id: true } })).id;
};
