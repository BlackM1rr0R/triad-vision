/**
 * Mieterselbstauskunft form of /apartment-viewing (client side). The request body of POST /api/rental-disclosure/pdf;
 * the server validates it with server/src/lib/rentalDisclosure/schema.ts (keep the field names in step — the shape
 * check in server/tests/unit/rentalDisclosure.test.ts parses DEFAULT_DISCLOSURE with that schema). Only the
 * questions of the DSK guidance (Version 2.0, January 2026) — no nationality, birth date or marital status.
 */

export type Stage = 'A' | 'B' | 'C';
export type YesNo = '' | 'yes' | 'no';
export const ATTACHMENT_KEYS = ['payslips', 'contract', 'bankStatements', 'taxAssessment', 'bonityCheck', 'publicPayer', 'wbs', 'rentClearance'] as const;
export type AttachmentKey = (typeof ATTACHMENT_KEYS)[number];

export interface DisclosureForm {
  stage: Stage;
  landlordName: string;
  landlordAddress: string;
  flatAddress: string;
  flatUnit: string;
  moveIn: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  socialHousing: boolean;
  wbs: YesNo;
  adults: number;
  children: number;
  employer: string;
  occupation: string;
  publicPayer: boolean;
  incomeMode: 'amount' | 'threshold';
  net: number | null;
  threshold: number | null;
  thresholdOk: YesNo;
  petsAsked: boolean;
  pets: string;
  insolvency: YesNo;
  eviction: YesNo;
  arrearsTwoMonths: YesNo;
  arrearsTwoRents: YesNo;
  terminated: YesNo;
  terminatedWhat: string;
  reasons: string;
  attachments: AttachmentKey[];
  place: string;
  date: string;
}

export const DEFAULT_DISCLOSURE: DisclosureForm = {
  stage: 'B',
  landlordName: '',
  landlordAddress: '',
  flatAddress: '',
  flatUnit: '',
  moveIn: '',
  name: '',
  address: '',
  phone: '',
  email: '',
  socialHousing: false,
  wbs: '',
  adults: 1,
  children: 0,
  employer: '',
  occupation: '',
  publicPayer: false,
  incomeMode: 'amount',
  net: null,
  threshold: null,
  thresholdOk: '',
  petsAsked: false,
  pets: '',
  insolvency: '',
  eviction: '',
  arrearsTwoMonths: '',
  arrearsTwoRents: '',
  terminated: '',
  terminatedWhat: '',
  reasons: '',
  attachments: [],
  place: '',
  date: '',
};

/** GET /api/rental-disclosure/me (server lib/rentalDisclosure/prefill.ts). */
export interface DisclosurePrefill {
  name: string;
  address: string;
  phone: string;
  email: string;
  employer: string;
  occupation: string;
  net: number | null;
  moveIn: string;
  sources: Partial<Record<'employer' | 'occupation' | 'net' | 'moveIn', string>>;
}

const ORDER: Stage[] = ['A', 'B', 'C'];
export const stageIncludes = (stage: Stage, s: Stage) => ORDER.indexOf(stage) >= ORDER.indexOf(s);

export const DISCLOSURE_AS_OF = '2026-11-17';
export const DISCLOSURE_SOURCES = [
  { label: 'DSK – Orientierungshilfe Selbstauskünfte bei Mietinteressent:innen, V2.0 (Jan 2026)', url: 'https://www.datenschutzkonferenz-online.de/media/oh/OH_Einholung_von_Selbstauskuenften_Mietinteressenten_V2.pdf' },
  { label: 'DSK – Musterfragebogen (Anlage, Jan 2026)', url: 'https://www.datenschutzkonferenz-online.de/media/oh/OH_Einholung_von_Selbstauskuenften_Mietinteressenten_V2_Anhang.pdf' },
  { label: '§ 551 BGB – Mietsicherheit (Kaution)', url: 'https://www.gesetze-im-internet.de/bgb/__551.html' },
  { label: '§ 19 AGG – zivilrechtliches Benachteiligungsverbot', url: 'https://www.gesetze-im-internet.de/agg/__19.html' },
  { label: '§ 2 Abs. 1a WoVermittG – Bestellerprinzip (Maklerprovision)', url: 'https://www.gesetze-im-internet.de/wovermrg/__2.html' },
  { label: 'SCHUFA – Datenkopie und BonitätsCheck', url: 'https://www.schufa.de/' },
  { label: 'Art. 15 DSGVO – Auskunftsrecht', url: 'https://dsgvo-gesetz.de/art-15-dsgvo/' },
  { label: 'Verbraucherzentrale – Fake-Wohnungen im Internet erkennen', url: 'https://www.verbraucherzentrale.de/wissen/vertraege-reklamation/abzocke/fakewohnungen-im-internet-so-erkennen-sie-falsche-immobilienanzeigen-27576' },
  { label: 'Antidiskriminierungsstelle des Bundes', url: 'https://www.antidiskriminierungsstelle.de/' },
];
