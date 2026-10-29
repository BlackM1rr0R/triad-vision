import type { DocStage } from '@prisma/client';

/**
 * Smart uploads: the document types the recogniser knows, how they map onto requirement keys
 * (DocumentRequirement.key) and drive stage folders, and the shapes stored on DocumentInsight.
 */

export const DOC_TYPES = [
  'PASSPORT',
  'ID_CARD',
  'BIRTH_CERT',
  'DIPLOMA',
  'TRANSCRIPT',
  'VOCATIONAL_CERT',
  'DRIVING_LICENCE',
  'CV',
  'PHOTO',
  'EMPLOYMENT_CONTRACT',
  'JOB_OFFER',
  'EMPLOYMENT_REFERENCE',
  'LANGUAGE_CERT',
  'RECOGNITION_DECISION',
  'INSURANCE',
  'BANK_STATEMENT',
  'POLICE_CERT',
  'MARRIAGE_CERT',
  'VISA',
  'RESIDENCE_PERMIT',
  'OTHER',
] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const isDocType = (v: unknown): v is DocType => typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);

/** Types that carry a validity date worth tracking in the expiring-documents list. */
export const EXPIRING_TYPES: ReadonlySet<DocType> = new Set<DocType>(['PASSPORT', 'ID_CARD', 'DRIVING_LICENCE', 'VISA', 'RESIDENCE_PERMIT', 'INSURANCE', 'POLICE_CERT']);

/** German word used in the standard file name (drive folders are German too). ASCII only. */
export const FILE_LABEL: Record<DocType, string> = {
  PASSPORT: 'Reisepass',
  ID_CARD: 'Personalausweis',
  BIRTH_CERT: 'Geburtsurkunde',
  DIPLOMA: 'Diplom',
  TRANSCRIPT: 'Notenauszug',
  VOCATIONAL_CERT: 'Berufsabschluss',
  DRIVING_LICENCE: 'Fuehrerschein',
  CV: 'Lebenslauf',
  PHOTO: 'Foto',
  EMPLOYMENT_CONTRACT: 'Arbeitsvertrag',
  JOB_OFFER: 'Arbeitsangebot',
  EMPLOYMENT_REFERENCE: 'Arbeitszeugnis',
  LANGUAGE_CERT: 'Sprachzertifikat',
  RECOGNITION_DECISION: 'Anerkennungsbescheid',
  INSURANCE: 'Versicherung',
  BANK_STATEMENT: 'Kontoauszug',
  POLICE_CERT: 'Fuehrungszeugnis',
  MARRIAGE_CERT: 'Heiratsurkunde',
  VISA: 'Visum',
  RESIDENCE_PERMIT: 'Aufenthaltstitel',
  OTHER: 'Dokument',
};

/** Requirement keys a type satisfies, best first. */
export const REQUIREMENT_KEYS: Record<DocType, string[]> = {
  PASSPORT: ['PASSPORT'],
  ID_CARD: ['ID_CARD'],
  BIRTH_CERT: ['BIRTH_CERT'],
  DIPLOMA: ['DIPLOMA'],
  TRANSCRIPT: ['TRANSCRIPT', 'DIPLOMA'],
  VOCATIONAL_CERT: ['VOCATIONAL_CERT', 'DIPLOMA'],
  DRIVING_LICENCE: ['DRIVING_LICENCE'],
  CV: ['CV'],
  PHOTO: ['PHOTO', 'PHOTO_2'],
  EMPLOYMENT_CONTRACT: ['SIGNED_CONTRACT', 'EMPLOYMENT_CONTRACT'],
  JOB_OFFER: ['SIGNED_CONTRACT', 'JOB_OFFER'],
  EMPLOYMENT_REFERENCE: ['EMPLOYMENT_REF'],
  LANGUAGE_CERT: ['GERMAN_CERT', 'LANGUAGE_CERT'],
  RECOGNITION_DECISION: ['ANERKENNUNG'],
  INSURANCE: ['HEALTH_INSURANCE', 'INSURANCE'],
  BANK_STATEMENT: ['BANK_STATEMENT', 'BLOCKED_ACCOUNT'],
  POLICE_CERT: ['POLICE_CERT', 'POLICE_CLEARANCE'],
  MARRIAGE_CERT: ['MARRIAGE_CERT'],
  VISA: ['VISA'],
  RESIDENCE_PERMIT: ['RESIDENCE_PERMIT'],
  OTHER: [],
};

/** The type a requirement key asks for (reverse of REQUIREMENT_KEYS, first type wins). */
export const typeForRequirementKey = (key: string | null | undefined): DocType | null => {
  if (!key) return null;
  if (key === 'VIDEX' || key === 'ACCOMMODATION') return null; // forms / proofs the recogniser has no type for
  for (const t of DOC_TYPES) if (REQUIREMENT_KEYS[t][0] === key) return t;
  for (const t of DOC_TYPES) if (REQUIREMENT_KEYS[t].includes(key)) return t;
  return null;
};

/** Types that are interchangeable for a requirement (a transcript in the "Diplomas" slot is fine). */
export const satisfiesKey = (type: DocType, key: string) => REQUIREMENT_KEYS[type].includes(key);

/** Stage folder of a client folder a type belongs in when no requirement says otherwise. */
export const DEFAULT_STAGE: Record<DocType, DocStage> = {
  PASSPORT: 'INITIAL',
  ID_CARD: 'INITIAL',
  BIRTH_CERT: 'INITIAL',
  DIPLOMA: 'INITIAL',
  TRANSCRIPT: 'INITIAL',
  VOCATIONAL_CERT: 'INITIAL',
  DRIVING_LICENCE: 'INITIAL',
  CV: 'INITIAL',
  PHOTO: 'INITIAL',
  EMPLOYMENT_REFERENCE: 'INITIAL',
  LANGUAGE_CERT: 'INITIAL',
  EMPLOYMENT_CONTRACT: 'EMBASSY',
  JOB_OFFER: 'EMBASSY',
  RECOGNITION_DECISION: 'EMBASSY',
  INSURANCE: 'EMBASSY',
  BANK_STATEMENT: 'EMBASSY',
  POLICE_CERT: 'EMBASSY',
  MARRIAGE_CERT: 'EMBASSY',
  VISA: 'VISA',
  RESIDENCE_PERMIT: 'VISA',
  OTHER: 'OTHER',
};

export interface InsightFields {
  holderName?: string;
  firstName?: string;
  lastName?: string;
  documentNumber?: string;
  birthDate?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingCountry?: string;
  issuingAuthority?: string;
  language?: string;
}
export const FIELD_KEYS = ['holderName', 'firstName', 'lastName', 'documentNumber', 'birthDate', 'issueDate', 'expiryDate', 'issuingCountry', 'issuingAuthority', 'language'] as const;

export type InsightSource = 'MRZ' | 'TEXT' | 'FILENAME' | 'AI' | 'DOC_CHECK' | 'CACHE' | 'STAFF' | 'NONE';
export type InsightStatus = 'PENDING' | 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'AUTO_APPLIED' | 'FAILED';
export type InsightFlag = 'NAME_MISMATCH' | 'EXPIRED' | 'EXPIRES_SOON' | 'WRONG_REQUIREMENT';

/** The actions a proposal can carry. */
export const ACTIONS = ['rename', 'link', 'move', 'expiry'] as const;
export type InsightAction = (typeof ACTIONS)[number];

export interface Proposals {
  /** Actions still open (the ones "Accept" applies). */
  actions: InsightAction[];
  currentName: string;
  /** Drive "move": the stage folder inside the client folder (created on accept when missing). */
  folder?: { parentId: string; name: string; id: string | null };
  /** Requirement proposed (title in the four languages, for the card). */
  requirement?: { id: string; title: unknown; stage: DocStage };
  /** The requirement the file is attached to now and the type it expects (client warning). */
  expected?: { requirementId: string; docType: DocType | null };
  /** NAME_MISMATCH: the name read from the document and the case person's name (client or family member). */
  holder?: { found: string; expected: string };
}
