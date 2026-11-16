import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { SEO_LOCALES, type SeoLocale } from '../seoCatalogue.js';
import { visitorIdSchema } from '../marketing/leadScoring.js';
import { getLicense, type LicenseState } from '../license/index.js';

/**
 * "Request a demo" on the public product page /platform (the platform sold to other visa / recruitment agencies).
 *
 * Only the OWNER's instance sells the platform: on a customer (white-label) instance the endpoint answers 404 and
 * the page is not shown, so an agency's site never advertises the owner's product.
 *
 * Storage: one Inquiry (kind "company", source "saas:demo", sector "SAAS") so the lead shows up in the normal
 * leads inbox with scoring, assignment and the GDPR retention / anonymisation, plus one SaasLead row with the B2B
 * pipeline fields (lib/saas/pipeline.ts). No prices anywhere: the price is "on request".
 */

export const SAAS_SOURCE = 'saas:demo';
export const SAAS_SECTOR = 'SAAS';

/** What the agency is interested in (product page checkboxes). */
export const INTERESTS = ['crm', 'clientPortal', 'employerPortal', 'documents', 'embassyPackage', 'germanLearning', 'jobSearch', 'seo', 'whiteLabel'] as const;
export type Interest = (typeof INTERESTS)[number];
export const TEAM_SIZES = ['1-5', '6-20', '21-50', '51+'] as const;

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const demoRequestSchema = z.object({
  agencyName: z.string().trim().min(2).max(160),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(190),
  phone: optText(40),
  country: optText(80),
  agencyWebsite: optText(200),
  teamSize: z.enum(TEAM_SIZES).optional().catch(undefined),
  interests: z
    .array(z.enum(INTERESTS))
    .max(INTERESTS.length)
    .optional()
    .transform((v) => [...new Set(v ?? [])]),
  message: optText(3000),
  /** GDPR consent to be contacted about the demo (required). */
  consent: z.literal(true, { errorMap: () => ({ message: 'CONSENT_REQUIRED' }) }),
  locale: z.string().optional(),
  // honeypot: real users never fill this hidden field
  website: z.string().max(200).optional(),
  visitorId: visitorIdSchema.optional().catch(undefined),
});
export type DemoRequestInput = z.infer<typeof demoRequestSchema>;

export const demoLocale = (raw: unknown): SeoLocale => (typeof raw === 'string' && (SEO_LOCALES as readonly string[]).includes(raw) ? (raw as SeoLocale) : 'en');
/** Staff languages are az/de/en/ru. */
export const staffLocaleOf = (lng: SeoLocale) => (lng === 'tr' ? 'az' : lng === 'uk' ? 'ru' : lng);

/** The platform is sold from the owner's instance only. */
export const sellsPlatform = (license: LicenseState = getLicense()) => license.role === 'owner';

const INTEREST_AZ: Record<Interest, string> = {
  crm: 'CRM / müraciətlər',
  clientPortal: 'Müştəri kabineti',
  employerPortal: 'İşəgötürən kabineti',
  documents: 'Sənədlər / Drive',
  embassyPackage: 'Səfirlik paketi',
  germanLearning: 'Alman dili alətləri',
  jobSearch: 'İş axtarışı',
  seo: 'SEO alətləri',
  whiteLabel: 'Öz brendi (white-label)',
};

/** Staff-facing summary (Azerbaijani, like the other lead notices): the Inquiry message and the notice body. */
export const demoSummary = (b: DemoRequestInput, lng: SeoLocale) =>
  [
    'SaaS: platforma üçün demo sorğusu (/platform)',
    `Agentlik: ${b.agencyName}`,
    `Ad: ${b.contactName}`,
    `Email: ${b.email}`,
    b.phone ? `Telefon: ${b.phone}` : null,
    b.country ? `Ölkə: ${b.country}` : null,
    b.agencyWebsite ? `Sayt: ${b.agencyWebsite}` : null,
    b.teamSize ? `Komanda: ${b.teamSize} nəfər` : null,
    b.interests.length ? `Maraq: ${b.interests.map((i) => INTEREST_AZ[i]).join(', ')}` : null,
    `Dil: ${lng}`,
    b.message ? `\n${b.message}` : null,
  ].filter((l): l is string => l !== null);

/** Inquiry + SaasLead in one transaction. */
export const createDemoRequest = async (b: DemoRequestInput, ctx: { lng: SeoLocale; partnerId?: string | null }) => {
  const message = demoSummary(b, ctx.lng).join('\n');
  return prisma.$transaction(async (tx) => {
    const inquiry = await tx.inquiry.create({
      data: {
        kind: 'company',
        source: SAAS_SOURCE,
        sector: SAAS_SECTOR,
        companyName: b.agencyName,
        contactName: b.contactName,
        email: b.email,
        phone: b.phone ?? null,
        message,
        locale: staffLocaleOf(ctx.lng),
        partnerId: ctx.partnerId ?? null,
      },
    });
    const lead = await tx.saasLead.create({
      data: {
        inquiryId: inquiry.id,
        agencyName: b.agencyName,
        country: b.country ?? null,
        website: b.agencyWebsite ?? null,
        teamSize: b.teamSize ?? null,
        interests: b.interests as unknown as Prisma.InputJsonValue,
      },
    });
    return { inquiry, lead };
  });
};
