import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { vaultDir } from './docCheck/index.js';

/**
 * "Download all my documents" (client portal › Vault): one ZIP with the client's vault and the files of every own
 * case (main application and family members). Entries are added as file streams and the archive is generated as a
 * Node stream (STORE: scans and PDFs do not compress), so neither the files nor the archive are held in memory.
 *
 *   Seyf/<kind>-<title>.<ext>
 *   <case number>[ – <family member>]/<stage>/<file name>
 *
 * Files missing on disk are skipped (listed in the returned summary). Only rows of the user are read.
 */

const STAGE_DIR: Record<string, string> = {
  INITIAL: '1-Ilkin-senedler',
  CONTRACT: '2-Muqavile',
  CONTRACT_SIGNED: '2-Muqavile',
  EMBASSY: '3-Sefirlik',
  VISA: '4-Viza',
  OTHER: '9-Diger',
};

/** Safe, readable ZIP entry segment (no path separators, control or reserved characters). */
export const zipSegment = (s: string, max = 80) =>
  s
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, max)
    .trim() || 'file';

const extOf = (name: string) => {
  const e = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,6}$/.test(e) ? e : '';
};

const isFile = async (p: string) => (await fsp.stat(p).catch(() => null))?.isFile() ?? false;

export interface ZipSummary {
  vault: number;
  caseFiles: number;
  skipped: number;
}

/** Builds the archive. Returns null when the user has no documents at all. */
export const buildDocumentsZip = async (userId: string): Promise<{ zip: JSZip; summary: ZipSummary } | null> => {
  const [vault, cases] = await Promise.all([
    prisma.vaultDocument.findMany({ where: { userId }, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }], select: { kind: true, title: true, filename: true, storageKey: true } }),
    prisma.case.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'asc' },
      select: {
        number: true,
        familyProfile: { select: { firstName: true, lastName: true } },
        documents: { orderBy: { createdAt: 'asc' }, select: { stage: true, originalName: true, storedName: true } },
      },
    }),
  ]);
  if (!vault.length && !cases.some((c) => c.documents.length)) return null;
  const zip = new JSZip();
  const used = new Set<string>();
  /** Unique entry name: "a.pdf", "a (2).pdf" … (case-insensitive, like most file systems). */
  const unique = (dir: string, base: string, ext: string) => {
    for (let i = 1; ; i++) {
      const name = `${dir}/${i === 1 ? base : `${base} (${i})`}${ext}`;
      if (!used.has(name.toLowerCase())) {
        used.add(name.toLowerCase());
        return name;
      }
    }
  };
  const summary: ZipSummary = { vault: 0, caseFiles: 0, skipped: 0 };
  for (const v of vault) {
    const src = path.join(vaultDir(), path.basename(v.storageKey));
    if (!(await isFile(src))) {
      summary.skipped++;
      continue;
    }
    const ext = extOf(v.filename);
    zip.file(unique('Seyf', zipSegment(`${v.kind}-${v.title.replace(new RegExp(`${ext.replace('.', '\\.')}$`, 'i'), '')}`), ext), fs.createReadStream(src), { binary: true });
    summary.vault++;
  }
  for (const c of cases) {
    const who = c.familyProfile ? ` - ${c.familyProfile.firstName} ${c.familyProfile.lastName}` : '';
    const dir = zipSegment(`${c.number}${who}`, 100);
    for (const d of c.documents) {
      const src = path.join(config.uploads.privateDir, path.basename(d.storedName));
      if (!(await isFile(src))) {
        summary.skipped++;
        continue;
      }
      const ext = extOf(d.originalName);
      const base = zipSegment(ext ? d.originalName.slice(0, -ext.length) : d.originalName);
      zip.file(unique(`${dir}/${STAGE_DIR[d.stage] ?? STAGE_DIR.OTHER}`, base, ext), fs.createReadStream(src), { binary: true });
      summary.caseFiles++;
    }
  }
  if (!summary.vault && !summary.caseFiles) return null;
  return { zip, summary };
};

/** File name of the download: Triad-Vision-senedler-2026-10-31.zip */
export const zipFileName = (now = new Date()) => `Triad-Vision-senedler-${now.toISOString().slice(0, 10)}.zip`;
