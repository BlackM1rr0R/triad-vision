import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ContractKind = 'WORK' | 'AUSBILDUNG' | 'SERVICE';
export const CONTRACT_KINDS: ContractKind[] = ['WORK', 'AUSBILDUNG', 'SERVICE'];
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

export type PlaceholderGroup = 'client' | 'case' | 'company' | 'vacancy' | 'triad' | 'staff' | 'date' | 'input';
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
