import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

// EMPLOYER / PARTNER: contracts with an employer or a referral partner (components/partnerRecords), not per case.
// LABOUR: Əmək müqaviləsi (Triad Vision ↔ client), sent only from the case's two-step contracts panel (components/caseContracts).
export type ContractKind = 'WORK' | 'AUSBILDUNG' | 'SERVICE' | 'EMPLOYER' | 'PARTNER' | 'LABOUR';
export const CONTRACT_KINDS: ContractKind[] = ['LABOUR', 'WORK', 'AUSBILDUNG', 'SERVICE', 'EMPLOYER', 'PARTNER'];
/** Kinds used for a case (the case-contract dialog); EMPLOYER / PARTNER are generated in the partner records. */
export const CASE_CONTRACT_KINDS: ContractKind[] = ['WORK', 'AUSBILDUNG', 'SERVICE'];
/**
 * Kinds sent for signature only from the two-step contracts panel (Əmək müqaviləsi → İş müqaviləsi; Triad Vision
 * signs first, no employer signer). The generic "from template" dialog still previews / downloads WORK and AUSBILDUNG.
 */
export const TWO_STEP_KINDS: ContractKind[] = ['LABOUR', 'WORK', 'AUSBILDUNG'];
export const CONTRACT_LANGS = ['de', 'en', 'az', 'ru'] as const;

export interface ContractTemplate {
  id: string;
  name: string;
  kind: ContractKind;
  language: string;
  body: string;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  placeholders: string[];
  createdBy?: { id: string; firstName: string; lastName: string } | null;
}

export type PlaceholderGroup = 'client' | 'case' | 'company' | 'partner' | 'contract' | 'vacancy' | 'triad' | 'staff' | 'date' | 'input';
export interface PlaceholderDef {
  key: string;
  group: PlaceholderGroup;
  input?: boolean;
  type?: 'text' | 'date' | 'number';
}

export type Segment = { text: string } | { key: string; value: string | null };
export interface Preview {
  text: string;
  missing: string[];
  unknown: string[];
  segments: Segment[];
}

export const BLANK = '________';

/** The documented placeholder set (served by the API, so client and server never drift apart). */
export const usePlaceholders = () =>
  useQuery({
    queryKey: ['contract-placeholders'],
    queryFn: async () => (await api.get<{ items: PlaceholderDef[] }>('/admin/contract-templates/placeholders')).data.items,
    staleTime: Infinity,
  });

/** i18n key of a placeholder label (labels are nested objects: keys.client.fullName). */
export const placeholderLabelKey = (key: string) => `contractTpl.keys.${key}`;
