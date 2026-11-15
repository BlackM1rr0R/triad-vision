import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../http.js';
import type { CvLang } from './schema.js';
import { buildCvPdf } from './load.js';
import { cvFileName } from './pdf.js';

/**
 * Lebenslauf versions: the client saves the current CV as a German tabellarischer Lebenslauf PDF; every save is a
 * new numbered version (the newest is the one "Apply via Triad Vision" attaches). Files live in the private
 * uploads folder (lebenslauf/<random>.pdf); only the client and staff can download them. Older versions beyond
 * MAX_LEBENSLAUF_VERSIONS are removed.
 */

export const MAX_LEBENSLAUF_VERSIONS = 10;
export const LEBENSLAUF_SUBDIR = 'lebenslauf';

export const lebenslaufDir = () => path.join(config.uploads.privateDir, LEBENSLAUF_SUBDIR);
export const lebenslaufPath = (storageKey: string) => path.join(lebenslaufDir(), path.basename(storageKey));

export const lebenslaufView = (v: { id: string; version: number; size: number; lang: string; withPhoto: boolean; createdAt: Date }) => ({
  id: v.id,
  version: v.version,
  size: v.size,
  lang: v.lang === 'en' ? 'en' : 'de',
  withPhoto: v.withPhoto,
  createdAt: v.createdAt,
});

export const lebenslaufFileName = async (userId: string, v: { version: number; lang: string }) => {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  const base = cvFileName(u ?? { firstName: '', lastName: '' }, v.lang === 'en' ? 'en' : 'de').replace(/\.pdf$/i, '');
  return `${base}_v${v.version}.pdf`;
};

/** Renders the client's current CV and stores it as the next version. */
export const createLebenslaufVersion = async (userId: string, opts: { lang?: CvLang; photo?: boolean } = {}) => {
  const lang = opts.lang ?? 'de';
  const out = await buildCvPdf(userId, { template: 'lebenslauf', lang, photo: opts.photo ?? false });
  if (!out) throw notFound('CANDIDATE_NOT_FOUND');
  await fsp.mkdir(lebenslaufDir(), { recursive: true });
  const storageKey = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  await fsp.writeFile(lebenslaufPath(storageKey), out.pdf);
  try {
    let row = null;
    // Two saves at the same moment: the unique (userId, version) key makes the second retry with the next number.
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      const last = await prisma.lebenslaufVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' }, select: { version: true } });
      row = await prisma.lebenslaufVersion
        .create({ data: { userId, version: (last?.version ?? 0) + 1, storageKey, size: out.pdf.length, lang, withPhoto: !!opts.photo } })
        .catch((err: { code?: string }) => {
          if (err.code === 'P2002') return null;
          throw err;
        });
    }
    if (!row) throw conflict('LEBENSLAUF_VERSION_CONFLICT');
    await pruneLebenslaufVersions(userId);
    return row;
  } catch (err) {
    await fsp.unlink(lebenslaufPath(storageKey)).catch(() => undefined);
    throw err;
  }
};

export const pruneLebenslaufVersions = async (userId: string, keep = MAX_LEBENSLAUF_VERSIONS) => {
  const old = await prisma.lebenslaufVersion.findMany({ where: { userId }, orderBy: { version: 'desc' }, skip: keep, select: { id: true, storageKey: true } });
  if (!old.length) return;
  await prisma.lebenslaufVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  for (const o of old) await fsp.unlink(lebenslaufPath(o.storageKey)).catch(() => undefined);
};

export const latestLebenslauf = (userId: string) => prisma.lebenslaufVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' } });

/** The newest version, or a fresh one built from the current CV when the client never saved one. */
export const latestOrNewLebenslauf = async (userId: string) => (await latestLebenslauf(userId)) ?? createLebenslaufVersion(userId, { lang: 'de' });

/** Storage keys of a user's versions (account deletion removes the files after commit). */
export const lebenslaufKeysOf = async (userId: string) => (await prisma.lebenslaufVersion.findMany({ where: { userId }, select: { storageKey: true } })).map((v) => v.storageKey);
