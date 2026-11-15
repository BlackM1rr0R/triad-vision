import { prisma } from '../../db.js';
import { readCv } from './schema.js';

/**
 * GDPR export (Art. 15 / 20) of the CV builder and the "apply via Triad Vision" applications: the CV data as
 * entered, the saved Lebenslauf versions (metadata only), cover / motivation letters, and the external job
 * applications with their status history and the Anschreiben staff attached.
 */
export const cvPrivacyExport = async (userId: string) => {
  const [cv, versions, letters, applications] = await Promise.all([
    prisma.candidateCv.findUnique({ where: { userId } }),
    prisma.lebenslaufVersion.findMany({ where: { userId }, orderBy: { version: 'asc' }, select: { version: true, lang: true, withPhoto: true, size: true, createdAt: true } }),
    prisma.motivationLetter.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { kind: true, title: true, language: true, body: true, answers: true, createdAt: true, updatedAt: true } }),
    prisma.externalJobApplication.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        provider: true,
        listingUrl: true,
        listingTitle: true,
        listingCompany: true,
        listingLocation: true,
        jobType: true,
        germanLevel: true,
        profession: true,
        experienceYears: true,
        cvOriginalName: true,
        cvSize: true,
        status: true,
        statusNote: true,
        statusChangedAt: true,
        coverLetterSubject: true,
        coverLetterBody: true,
        coverLetterAt: true,
        createdAt: true,
        events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
      },
    }),
  ]);
  return {
    cv: cv ? { data: readCv(cv.data), template: cv.template, shareWithEmployers: cv.shareWithEmployers, updatedAt: cv.updatedAt } : null,
    lebenslaufVersions: versions,
    letters,
    externalJobApplications: applications,
  };
};
