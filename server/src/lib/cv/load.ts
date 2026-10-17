import fs from 'node:fs/promises';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { emptyCv, readCv, readTemplate, type CvData, type CvLang, type CvTemplate } from './schema.js';
import { renderCvPdf, cvFileName, type CvPerson } from './pdf.js';
import { prefillCv } from './prefill.js';

/** Profile fields the CV editor shows next to the CV (edited on the profile page, not here). */
export const cvProfileSelect = {
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthDate: true,
  nationality: true,
  city: true,
  address: true,
  profession: true,
  experienceYears: true,
  germanLevel: true,
  education: true,
  drivingLicence: true,
  about: true,
} satisfies Prisma.UserSelect;

export type CvProfile = Prisma.UserGetPayload<{ select: typeof cvProfileSelect }>;

/** The client's CV row, created empty on first access. */
export const ensureCv = async (userId: string) =>
  (await prisma.candidateCv.findUnique({ where: { userId } })) ??
  prisma.candidateCv.upsert({ where: { userId }, update: {}, create: { userId, data: emptyCv() as unknown as Prisma.InputJsonValue } });

export const cvView = (row: { data: unknown; template: string; shareWithEmployers: boolean; updatedAt: Date }) => ({
  data: readCv(row.data),
  template: readTemplate(row.template),
  shareWithEmployers: row.shareWithEmployers,
  updatedAt: row.updatedAt,
});

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

const readSafe = async (dir: string, name: string) => {
  const full = path.resolve(dir, name);
  if (!full.startsWith(path.resolve(dir) + path.sep)) return null;
  return fs.readFile(full).catch(() => null);
};

/**
 * Latest passport photo of the client: the document vault (PHOTO) first, then a case document uploaded for
 * the PHOTO requirement. JPEG/PNG only; missing files are skipped silently.
 */
export const findPhoto = async (userId: string): Promise<Buffer | null> => {
  const vault = await prisma.vaultDocument
    .findMany({ where: { userId, kind: 'PHOTO', mimeType: { in: IMAGE_TYPES } }, orderBy: { createdAt: 'desc' }, take: 3, select: { storageKey: true } })
    .catch(() => []);
  for (const v of vault) {
    const bytes = await readSafe(path.join(config.uploads.privateDir, 'vault'), v.storageKey);
    if (bytes) return bytes;
  }
  const docs = await prisma.document.findMany({
    where: { case: { clientId: userId }, requirement: { key: 'PHOTO' }, mimeType: { in: IMAGE_TYPES }, status: { not: 'REJECTED' } },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { storedName: true },
  });
  for (const d of docs) {
    const bytes = await readSafe(config.uploads.privateDir, d.storedName);
    if (bytes) return bytes;
  }
  return null;
};

export interface CvPdfOptions {
  template?: CvTemplate;
  lang?: CvLang;
  photo?: boolean;
  anonymised?: boolean;
}

/** Loads profile + CV of a user and renders the PDF. Returns null when the user does not exist. */
export const buildCvPdf = async (userId: string, opts: CvPdfOptions = {}): Promise<{ pdf: Buffer; filename: string; shareWithEmployers: boolean } | null> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: cvProfileSelect });
  if (!user) return null;
  const row = await prisma.candidateCv.findUnique({ where: { userId } });
  // A client who never opened the CV editor still gets a CV built from the profile fields.
  const cv: CvData = row ? readCv(row.data) : prefillCv(emptyCv(), user).data;
  const template = opts.template ?? readTemplate(row?.template);
  const lang = opts.lang ?? 'de';
  const person: CvPerson = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    city: user.city,
    birthDate: user.birthDate,
    nationality: user.nationality,
  };
  // An empty CV still renders the profile basics (headline from the profession).
  if (!cv.headline && user.profession) cv.headline = user.profession;
  const photo = opts.photo && !opts.anonymised ? await findPhoto(userId) : null;
  const pdf = await renderCvPdf({ person, cv, template, lang, photo, anonymised: opts.anonymised });
  return { pdf, filename: cvFileName(person, lang, opts.anonymised), shareWithEmployers: row?.shareWithEmployers ?? true };
};
