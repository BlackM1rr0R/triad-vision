import type { L10n } from '@/lib/types';

export const PREP_KINDS = ['EMBASSY', 'EMPLOYER'] as const;
export type PrepKind = (typeof PREP_KINDS)[number];

export const VISA_TYPES = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG', 'JOB_SEEKER', 'STUDY', 'FAMILY', 'TOURIST'] as const;
export type VisaType = (typeof VISA_TYPES)[number];

export interface PrepQuestion {
  id: string;
  kind: PrepKind;
  category: string;
  question: L10n;
  answerDe: string;
  tips: L10n | null;
  visaTypes: VisaType[] | null;
  sortOrder: number;
}

export interface AdminPrepQuestion extends PrepQuestion {
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Category label from the copy, falling back to the raw key for categories an admin invented. */
export const categoryLabel = (t: (k: string) => string, exists: (k: string) => boolean, category: string) =>
  exists(`prep.category.${category}`) ? t(`prep.category.${category}`) : category;
