import { z } from 'zod';

/**
 * Mieterselbstauskunft (/apartment-viewing): only the questions the German data protection authorities consider
 * permissible — Orientierungshilfe der Datenschutzkonferenz (DSK) „Einholung von Selbstauskünften bei
 * Mietinteressent:innen", Version 2.0, Stand Januar 2026, with its model questionnaire (Anlage Musterfragebogen).
 * Three stages, each with its own questions; the PDF contains only the stages up to the one chosen:
 *  A – viewing: name, address and/or phone and/or e-mail; for social housing: Wohnberechtigungsschein (WBS).
 *  B – you want to rent this flat: number of persons (adults / children), employer, occupation, net income (or that
 *      at least a stated amount is available; not when a public body pays the whole rent), pets (except small
 *      animals in cages / tanks), an open insolvency procedure, an eviction title in the last 5 years.
 *  C – the landlord has chosen you: proof of income and of creditworthiness (documents), public payer proof,
 *      rent arrears of the § 543 (2) no. 3 BGB size in the current tenancy, termination for a serious breach, and
 *      your reasons why it will not happen again.
 * NOT asked (impermissible per the DSK guidance): nationality, religion, ethnic origin, marital status, wish for
 * children / pregnancy, criminal record, membership of a party or tenants' association, duration of employment,
 * contact details of the previous landlord, a copy of the ID card; a Mietschuldenfreiheitsbescheinigung cannot be
 * required (BGH VIII ZR 238/08). Nothing is stored: the server renders the PDF from the request and forgets it.
 */

export const DISCLOSURE_STAGES = ['A', 'B', 'C'] as const;
export type DisclosureStage = (typeof DISCLOSURE_STAGES)[number];

export const ATTACHMENTS = ['payslips', 'contract', 'bankStatements', 'taxAssessment', 'bonityCheck', 'publicPayer', 'wbs', 'rentClearance'] as const;
export type Attachment = (typeof ATTACHMENTS)[number];

const text = (max: number) => z.string().trim().max(max).default('');
const yesNo = z.enum(['yes', 'no', '']).default('');

export const disclosureSchema = z
  .object({
    stage: z.enum(DISCLOSURE_STAGES).default('B'),
    landlordName: text(160),
    landlordAddress: text(300),
    flatAddress: text(300),
    flatUnit: text(120),
    moveIn: text(40),
    // A
    name: z.string().trim().min(1).max(160),
    address: text(300),
    phone: text(60),
    email: text(160),
    socialHousing: z.boolean().default(false),
    wbs: yesNo,
    // B
    adults: z.number().int().min(1).max(20).default(1),
    children: z.number().int().min(0).max(20).default(0),
    employer: text(200),
    occupation: text(160),
    publicPayer: z.boolean().default(false),
    incomeMode: z.enum(['amount', 'threshold']).default('amount'),
    net: z.number().min(0).max(1_000_000).nullable().default(null),
    threshold: z.number().min(0).max(1_000_000).nullable().default(null),
    thresholdOk: yesNo,
    petsAsked: z.boolean().default(false),
    pets: text(300),
    insolvency: yesNo,
    eviction: yesNo,
    // C
    arrearsTwoMonths: yesNo,
    arrearsTwoRents: yesNo,
    terminated: yesNo,
    terminatedWhat: text(600),
    reasons: text(1200),
    attachments: z.array(z.enum(ATTACHMENTS)).max(ATTACHMENTS.length).default([]),
    place: text(80),
    date: text(20),
  })
  .strict();

export type Disclosure = z.infer<typeof disclosureSchema>;

export const stageIncludes = (stage: DisclosureStage, s: DisclosureStage) => DISCLOSURE_STAGES.indexOf(stage) >= DISCLOSURE_STAGES.indexOf(s);

/** German labels of the attachment list (PDF and checklist). */
export const ATTACHMENT_DE: Record<Attachment, string> = {
  payslips: 'Lohn- bzw. Gehaltsabrechnungen (nicht erforderliche Angaben geschwärzt)',
  contract: 'Arbeitsvertrag (Gehalt und Beginn; solange noch keine Abrechnung vorliegt)',
  bankStatements: 'Kontoauszüge (nicht erforderliche Angaben geschwärzt)',
  taxAssessment: 'Einkommensteuerbescheid (nicht erforderliche Angaben geschwärzt)',
  bonityCheck: 'Bonitätsnachweis einer Auskunftei für Vermieter (z. B. SCHUFA-BonitätsCheck)',
  publicPayer: 'Nachweis über die Übernahme der Miete durch eine öffentliche Stelle',
  wbs: 'Wohnberechtigungsschein (Kopie)',
  rentClearance: 'Mietschuldenfreiheitsbescheinigung (freiwillig)',
};

export const DSK_SOURCE = 'Orientierungshilfe der Datenschutzkonferenz (DSK) zur Einholung von Selbstauskünften bei Mietinteressent:innen, Version 2.0, Stand Januar 2026';
