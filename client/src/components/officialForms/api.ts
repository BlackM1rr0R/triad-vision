import { toast } from 'sonner';
import i18n from '@/i18n';
import { errorCode } from '@/lib/api';

/** Types of the official form engine (server lib/officialForms). */

export type L10n = { az: string; de: string; en: string; ru: string };
export type PdfFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'optionlist' | 'signature' | 'button' | 'unknown';
export type ValueFormat = 'date' | 'dateIso' | 'monthYear' | 'upper' | 'lower' | 'money' | 'none';
export type FillStatus = 'DRAFT' | 'GENERATED' | 'SENT_TO_EMPLOYER' | 'SIGNED' | 'SUBMITTED';

export interface DataKey {
  key: string;
  group: string;
  kind: 'text' | 'date' | 'code' | 'money' | 'number';
  label: L10n;
  codes: string[] | null;
  employer: boolean;
}

export interface Catalogue {
  keys: DataKey[];
  groups: { key: string; label: L10n }[];
  formats: ValueFormat[];
  defaults: { key: string; title: string; version: string; url: string; mapped: number }[];
}

export interface FieldMapping {
  source: string;
  value?: string;
  format?: ValueFormat;
  when?: string;
  map?: Record<string, string>;
  optional?: boolean;
}
export type FieldMap = Record<string, FieldMapping>;

export interface PdfField {
  name: string;
  type: PdfFieldType;
  options: string[];
  page: number | null;
  maxLength?: number | null;
  readOnly?: boolean;
}

export interface Template {
  id: string;
  key: string;
  title: string;
  version: string;
  active: boolean;
  notes: string | null;
  mapped: number;
  builtIn: boolean;
  fills?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDetail {
  template: Template;
  fields: PdfField[];
  pages: number;
  fieldMap: FieldMap;
  suggestions: FieldMap;
}

export interface FilledRow {
  field: string;
  type: PdfFieldType;
  source: string;
  key: string;
  value: string;
  checked?: boolean;
  overridden: boolean;
  missing: boolean;
}

export interface MissingEntry {
  source: string;
  group: string;
  label: L10n | null;
  fields: string[];
  fix: { section?: string; href?: string } | null;
}

export interface Fill {
  id: string;
  templateId: string;
  template: { key: string; title: string; version: string } | null;
  caseId: string;
  companyId: string | null;
  status: FillStatus;
  missing: MissingEntry[];
  hasFile: boolean;
  driveNodeId: string | null;
  signatureRequestId: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseFormEntry {
  key: string;
  title: string;
  template: Template | null;
  builtIn: boolean;
  employerForm: boolean;
  canSendToEmployer: boolean;
  latest: Fill | null;
  history: Fill[];
}

export interface CaseFormResolution {
  template: { id: string; key: string; title: string; version: string };
  fields: PdfField[];
  rows: FilledRow[];
  missing: MissingEntry[];
  fieldOverrides: Record<string, string>;
  flatten: boolean;
  latest: Fill | null;
}

export const FILL_TONE: Record<FillStatus | 'NONE', 'neutral' | 'info' | 'warning' | 'success' | 'accent'> = {
  NONE: 'neutral',
  DRAFT: 'neutral',
  GENERATED: 'info',
  SENT_TO_EMPLOYER: 'warning',
  SIGNED: 'success',
  SUBMITTED: 'accent',
};

export const fillFileUrl = (fillId: string, download = false) => `/api/admin/official-forms/fills/${fillId}/file${download ? '?download=1' : ''}`;

/** Localised error toast for the official forms API. */
export const toastFormError = (err: unknown) => {
  const code = errorCode(err);
  toast.error(i18n.t(`officialForms.errors.${code}`, { defaultValue: i18n.t('officialForms.errors.default') }));
};

/** Opens a PDF blob in a new tab (preview endpoints answer with the bytes). */
export const openPdfBlob = (data: Blob) => {
  const url = URL.createObjectURL(data);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
