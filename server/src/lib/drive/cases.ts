import path from 'node:path';
import type { DocStage, VisaType } from '@prisma/client';
import { config } from '../../config.js';

/**
 * Names used for the real client folders in the shared workspace (see caseFolders.ts). The virtual,
 * read-only "Cases" area that used to be built from Case / Document rows is gone: accepted case documents
 * are now copied into the client's folder as ordinary drive files.
 */

export const STAGES: DocStage[] = ['INITIAL', 'EMBASSY', 'CONTRACT', 'CONTRACT_SIGNED', 'VISA', 'OTHER'];
/** German names of the stage folders inside a client folder. */
export const STAGE_FOLDER: Record<DocStage, string> = {
  INITIAL: 'Erstdokumente',
  EMBASSY: 'Botschaftsunterlagen',
  CONTRACT: 'Vertrag',
  CONTRACT_SIGNED: 'Unterschriebener Vertrag',
  VISA: 'Visum',
  OTHER: 'Sonstiges',
} as Record<DocStage, string>;

export const VISA_TYPES: VisaType[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'];
/** Folder names of the application types — German, like every folder name in the drive. */
export const VISA_TYPE_FOLDER: Record<VisaType, string> = {
  WORK: 'Arbeitsvisum',
  AUSBILDUNG: 'Ausbildung',
  WEITERBILDUNG: 'Weiterbildung',
  JOB_SEEKER: 'Jobsuche (Chancenkarte)',
  STUDY: 'Studienvisum',
  FAMILY: 'Familiennachzug',
  TOURIST: 'Besuchervisum',
};

const de = (v: unknown) => (v && typeof v === 'object' ? ((v as Record<string, string>).de || (v as Record<string, string>).az || '') : '');
/** "§18b · Kuryer-Fahrer": visa label and the German title of a visa category. */
export const categoryFolderName = (cat: { title: unknown; visaLabel: string }) => `${cat.visaLabel} · ${de(cat.title)}`.trim();

/** Where a case document's file lives on disk (the documents storage, not the drive store). */
export const docFilePath = (storedName: string) => path.join(config.uploads.privateDir, path.basename(storedName));
