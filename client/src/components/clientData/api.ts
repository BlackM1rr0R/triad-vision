import { optimizeImage } from '@/lib/imageCompress';
import { api } from '@/lib/api';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { registerCopy } from '@/i18n';
import { pagesClientData } from '@/i18n/pagesClientData';
import type { L10n } from '@/lib/types';

registerCopy(pagesClientData);

/** Shapes of /api/client-data/* and /api/admin/{case-forms,cases/:id/forms,cases/:id/data-confirmation,doc-guides} (server: lib/clientData). */

export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi' | 'yesno' | 'group' | 'file';
export const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'multi', 'yesno', 'group', 'file'];
export const SUB_FIELD_TYPES: FieldType[] = ['text', 'textarea', 'number', 'date', 'select', 'multi', 'yesno'];

export interface FormOption {
  value: string;
  label: L10n;
}

export interface FormField {
  key: string;
  type: FieldType;
  label: L10n;
  help?: L10n | null;
  required?: boolean;
  options?: FormOption[];
  fields?: FormField[];
  maxRows?: number;
  showIf?: { field: string; equals: string | boolean } | null;
  target?: string | null;
}

export type Answers = Record<string, unknown>;
export type FormStatus = 'SENT' | 'DRAFT' | 'SUBMITTED' | 'APPLIED' | 'CANCELLED';

export interface ClientForm {
  id: string;
  title: L10n;
  fields: FormField[];
  answers: Answers;
  status: FormStatus;
  note: string | null;
  sentAt: string;
  draftAt: string | null;
  submittedAt: string | null;
  dueAt: string | null;
  editable: boolean;
}

export interface DiffRow {
  fieldKey: string;
  target: string;
  field: string;
  label: L10n;
  targetLabel: L10n;
  before: { field: string; value: string };
  after: { field: string; value: string };
  changed: boolean;
}

export interface StaffForm extends ClientForm {
  templateId: string | null;
  sentById: string | null;
  appliedAt: string | null;
  appliedById: string | null;
  applied: { target: string; field: string; before: { value: string }; after: { value: string } }[] | null;
  remindedAt: string | null;
  reminders: number;
  submitIp: string | null;
  files: Record<string, { name: string; mimeType: string }>;
  diff: DiffRow[];
}

export interface Template {
  id: string;
  key: string | null;
  title: L10n;
  description: L10n | null;
  fields: FormField[];
  active: boolean;
  builtIn: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface TargetOption {
  target: string;
  entity: 'profile' | 'case' | 'videx';
  kind: string;
  label: L10n;
}

export const isVisible = (f: FormField, answers: Answers) => {
  if (!f.showIf) return true;
  const v = answers[f.showIf.field];
  if (typeof f.showIf.equals === 'boolean') return v === f.showIf.equals;
  return Array.isArray(v) ? v.includes(f.showIf.equals) : v === f.showIf.equals;
};

export const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/** Same rule as the server (lib/clientData/formSchema.ts missingRequired): "key" or "key.row.sub". */
export const missingKeys = (fields: FormField[], answers: Answers) => {
  const out = new Set<string>();
  for (const f of fields) {
    if (!isVisible(f, answers)) continue;
    const v = answers[f.key];
    if (f.required && isEmpty(v)) out.add(f.key);
    if (f.type === 'group' && Array.isArray(v)) {
      (v as Answers[]).forEach((row, i) => {
        for (const s of f.fields ?? []) if (s.required && isEmpty(row[s.key])) out.add(`${f.key}.${i}.${s.key}`);
      });
    }
  }
  return out;
};

// ─── Data confirmation ─────────────────────────────────────────────

export type ConfirmState = 'NONE' | 'PENDING' | 'REVIEW' | 'CONFIRMED' | 'STALE';

export interface ConfirmationState {
  state: ConfirmState;
  confirmationId: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  changedAt: string | null;
  changedKeys: string[];
  corrections: number;
}

export interface ConfirmField {
  key: string;
  section: string;
  label: L10n;
  value: string;
}

export interface ConfirmAnswer {
  ok: boolean;
  value?: string;
  proofDocumentId?: string | null;
}

export interface ClientConfirmation {
  id: string;
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'CANCELLED';
  fields: ConfirmField[];
  answers: Record<string, ConfirmAnswer>;
  requestedAt: string;
  submittedAt: string | null;
  editable: boolean;
}

export interface StaffConfirmItem {
  key: string;
  section: string;
  label: L10n;
  value: string;
  answer: null | { ok: true } | { ok: false; correction: { key: string; value: string }; proof: { id: string; name: string; mimeType: string } | null };
  decision: null | { decision: 'ACCEPTED' | 'REJECTED'; at: string; byId: string; applied: { key: string; value: string } | null };
  profileTarget: string | null;
}

export interface StaffConfirmation {
  id: string;
  status: ClientConfirmation['status'];
  requestedAt: string;
  submittedAt: string | null;
  submitIp: string | null;
  submitUserAgent: string | null;
  reviewedAt: string | null;
  remindedAt: string | null;
  items: StaffConfirmItem[];
}

export interface ConfirmationView {
  state: ConfirmationState;
  confirmation: StaffConfirmation | null;
  sections: Record<string, L10n>;
  preview?: ConfirmField[];
}

// ─── Guides ────────────────────────────────────────────────────────

export const GUIDE_FIELDS = ['summary', 'where', 'duration', 'cost', 'apostille', 'translation', 'mistakes', 'tips'] as const;
export type GuideField = (typeof GUIDE_FIELDS)[number];
export type GuideText = Record<GuideField, string>;
export interface GuideLink {
  label: string;
  url: string;
}

export interface ClientGuide {
  key: string;
  text: GuideText;
  /** false: the guide only carries "Necə çəkməli?" examples (no "Necə almalı?" text). */
  hasText?: boolean;
  links: GuideLink[];
  sampleImage: string | null;
  /** "Necə çəkməli?" overrides (components/docGuide); null → the built-in illustrated examples. */
  examples?: { goodImage: string | null; badImage: string | null; tips: string[] } | null;
  verified: boolean;
}

/** Admin side of the "Necə çəkməli?" examples (stored in DocumentGuide.content._examples). */
export interface GuideExamples {
  goodImage: string | null;
  badImage: string | null;
  /** One tip per line, per language (at most 5 shown). */
  tips: Record<'az' | 'de' | 'en' | 'ru', string>;
}

export interface AdminGuide {
  key: string;
  content: Record<'az' | 'de' | 'en' | 'ru', GuideText>;
  links: GuideLink[];
  sampleImage: string | null;
  examples?: GuideExamples | null;
  verified: boolean;
  published: boolean;
  builtIn: boolean;
  hasDefault: boolean;
  updatedAt: string | null;
}

// ─── Query keys / fetchers ─────────────────────────────────────────

export const caseFormsKey = (caseId: string) => ['admin-case-forms', caseId] as const;
export const confirmKey = (caseId: string) => ['admin-data-confirmation', caseId] as const;
export const clientTasksKey = (caseId: string) => ['client-data-tasks', caseId] as const;
export const TEMPLATES_KEY = ['admin-case-form-templates'] as const;
export const GUIDES_KEY = ['admin-doc-guides'] as const;

export const fetchConfirmation = async (caseId: string, preview = false) => (await api.get<ConfirmationView>(`/admin/cases/${caseId}/data-confirmation${preview ? '?preview=1' : ''}`)).data;

/** Uploads one file to the client's case (stage OTHER) — file answers and correction proofs. */
export const uploadCaseFile = async (caseId: string, file: File) => {
  const fd = new FormData();
  fd.append('file', await optimizeImage(file));
  return (await api.post<{ document: { id: string; originalName: string; mimeType: string; size: number } }>(`/client-data/cases/${caseId}/files`, fd)).data.document;
};

export const CONFIRM_TONE: Record<ConfirmState, string> = toneClasses(STATUS_TONES.confirmation);
