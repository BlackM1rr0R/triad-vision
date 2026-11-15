import { z } from 'zod';
import { prisma } from '../../db.js';
import { emptyCv, readCv } from '../cv/schema.js';
import { cvProfileSelect } from '../cv/load.js';
import { prefillCv } from '../cv/prefill.js';
import { renderLetterPdf } from '../cv/letterPdf.js';
import { asciiName } from '../cv/pdf.js';
import { DEFAULT_COVER_TEMPLATES } from './defaults.js';
import { COVER_JOB_TYPES, fillTemplate, type CoverJobType, type CoverPlaceholder } from './fill.js';
import { buildCoverValues, jobTypeOf, splitName, type CoverPerson } from './values.js';

/** Anschreiben for "apply via Triad Vision" applications: templates (DB overrides + built-ins), drafts and PDFs. */

export const coverTemplateInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(20).max(12_000),
  })
  .strict();

export const coverLetterInput = z
  .object({
    subject: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();

export interface CoverTemplateView {
  jobType: CoverJobType;
  name: string;
  subject: string;
  body: string;
  /** false = the built-in default (no admin edit yet). */
  custom: boolean;
  updatedAt: Date | null;
}

export const listCoverTemplates = async (): Promise<CoverTemplateView[]> => {
  const rows = await prisma.coverLetterTemplate.findMany();
  return COVER_JOB_TYPES.map((jobType) => {
    const r = rows.find((x) => x.jobType === jobType);
    const d = DEFAULT_COVER_TEMPLATES[jobType];
    return { jobType, name: r?.name ?? d.name, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, custom: !!r, updatedAt: r?.updatedAt ?? null };
  });
};

export const getCoverTemplate = async (jobType: CoverJobType) => (await listCoverTemplates()).find((t) => t.jobType === jobType)!;

type ApplicationForLetter = {
  userId: string | null;
  listingTitle: string | null;
  listingCompany: string | null;
  listingLocation: string | null;
  jobType: string | null;
  profession: string | null;
  experienceYears: number | null;
  germanLevel: string | null;
  inquiry: { contactName: string; email: string; phone: string | null };
};

/** Applicant data for the letter: the linked account (profile + CV) or, without one, what the apply form holds. */
const applicantOf = async (app: ApplicationForLetter) => {
  const user = app.userId ? await prisma.user.findUnique({ where: { id: app.userId }, select: cvProfileSelect }) : null;
  if (user) {
    const row = await prisma.candidateCv.findUnique({ where: { userId: app.userId! }, select: { data: true } });
    const cv = row ? readCv(row.data) : prefillCv(emptyCv(), user).data;
    const person: CoverPerson = { ...user };
    return { person, cv };
  }
  const { firstName, lastName } = splitName(app.inquiry.contactName);
  return { person: { firstName, lastName, email: app.inquiry.email, phone: app.inquiry.phone } as CoverPerson, cv: emptyCv() };
};

export interface CoverDraft {
  jobType: CoverJobType;
  subject: string;
  body: string;
  missing: CoverPlaceholder[];
  templates: { jobType: CoverJobType; name: string }[];
}

/** Draft from a template (the detected job type unless `jobType` is given). */
export const draftCoverLetter = async (app: ApplicationForLetter, jobType?: CoverJobType, now = new Date()): Promise<CoverDraft> => {
  const { person, cv } = await applicantOf(app);
  const listing = {
    title: app.listingTitle,
    company: app.listingCompany,
    location: app.listingLocation,
    jobType: app.jobType,
    profession: app.profession,
    experienceYears: app.experienceYears,
    germanLevel: app.germanLevel,
  };
  const type = jobType ?? jobTypeOf(listing);
  const templates = await listCoverTemplates();
  const t = templates.find((x) => x.jobType === type)!;
  const values = buildCoverValues({ person, cv, listing, now });
  const subject = fillTemplate(t.subject, values);
  const body = fillTemplate(t.body, values);
  const missing = Array.from(new Set([...subject.missing, ...body.missing]));
  return { jobType: type, subject: subject.text, body: body.text, missing, templates: templates.map((x) => ({ jobType: x.jobType, name: x.name })) };
};

/** DIN 5008-style letter PDF (shared layout with the motivation letters), the date written out in German. */
export const coverLetterPdf = async (app: ApplicationForLetter, letter: { subject: string; body: string }) => {
  const { person } = await applicantOf(app);
  const name = `${person.firstName} ${person.lastName}`.trim();
  const recipient = [app.listingCompany?.trim(), app.listingLocation?.trim()].filter((l): l is string => !!l);
  const pdf = await renderLetterPdf({
    language: 'de',
    sender: { name, address: person.address, city: person.city, phone: person.phone, email: person.email },
    recipient: recipient.length ? recipient : ['Personalabteilung'],
    title: letter.subject,
    body: letter.body,
    longDate: true,
  });
  const filename = `Anschreiben_${asciiName(person.lastName || person.firstName).replace(/[^A-Za-z0-9-]+/g, '-') || 'Bewerbung'}.pdf`;
  return { pdf, filename };
};
