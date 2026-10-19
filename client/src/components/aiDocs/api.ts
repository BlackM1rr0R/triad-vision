import { api, errorCode } from '@/lib/api';
import { AxiosError } from 'axios';

/** Document AI API (/api/ai-docs) — types and small helpers shared by the client card, staff chip, letter page and draft dialog. */

export type AiLang = 'az' | 'de' | 'en' | 'ru';
export type AiVerdict = 'ok' | 'warn' | 'wrong_document' | 'unreadable';

export interface AiIssue {
  code: string;
  message_az: string;
  message_de: string;
  message_en: string;
  message_ru: string;
}

export interface AiFields {
  name?: string;
  birthDate?: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  issuer?: string;
}

export type AiDocCheck =
  | {
      verdict: AiVerdict;
      documentType: string | null;
      language: string | null;
      issues: AiIssue[];
      fields: AiFields;
      apostille: 'present' | 'missing' | 'not_needed' | 'unknown';
      translationNeeded: boolean;
      at: string;
      by: 'auto' | 'staff';
      model: string;
      costUsd: number;
    }
  | { verdict: 'skipped'; reason: string; at: string; by: 'auto' | 'staff' };

/** The AI result inside a document's checks JSON (null when there is none). */
export const aiOfChecks = (checks: unknown): AiDocCheck | null => {
  const ai = checks && typeof checks === 'object' ? (checks as { ai?: unknown }).ai : null;
  return ai && typeof ai === 'object' && typeof (ai as { verdict?: unknown }).verdict === 'string' ? (ai as AiDocCheck) : null;
};

export const issueText = (i: AiIssue, lang: string) => i[`message_${(['az', 'de', 'en', 'ru'].includes(lang) ? lang : 'az') as AiLang}`] || i.message_az;

export const fetchDocCheck = async (docId: string) =>
  (await api.get<{ documentId: string; enabled: boolean; ai: AiDocCheck | null }>(`/ai-docs/documents/${docId}/check`)).data;

export const recheckDoc = async (docId: string) => (await api.post<{ documentId: string; ai: AiDocCheck }>(`/ai-docs/documents/${docId}/check`)).data.ai;

/** The friendly limit text the server sends with 429 AI_LIMIT, if any. */
export const aiLimitMessage = (err: unknown): string | null => {
  if (err instanceof AxiosError && err.response?.status === 429) {
    const d = err.response.data as { error?: string; message?: string } | undefined;
    if (d?.error === 'AI_LIMIT' && d.message) return d.message;
  }
  return null;
};

export { errorCode };

// ─── Letters ───────────────────────────────────────────────────────────

export interface LetterExplanation {
  sender: { name: string | null; kind: 'authority' | 'company' | 'other' };
  subject: string | null;
  letterDate: string | null;
  reference: string | null;
  summary: string;
  deadlines: { date: string; what: string }[];
  steps: string[];
  documents: string[];
  consequences: string | null;
  glossary: { term: string; meaning: string }[];
  urgency: 'low' | 'medium' | 'high';
  language: string | null;
}

export interface LetterItem {
  id: string;
  title: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  fileUrl: string;
  letter: { explanation: LetterExplanation; locale: AiLang; at: string; sentAt?: string; sentCaseId?: string };
}

export const lettersKey = ['ai-docs', 'letters'] as const;

export const fetchLetters = async () => (await api.get<{ items: LetterItem[] }>('/ai-docs/letters')).data.items;

// ─── Draft translation ─────────────────────────────────────────────────

export type DraftSource = { documentId: string } | { nodeId: string } | { translationOrderId: string; fileId?: string };

export interface DraftResult {
  nodeId: string;
  name: string;
  parentId: string;
  location: 'case' | 'drive' | 'staff';
  model: string;
  costUsd: number;
}

export const createDraft = async (source: DraftSource, quality: 'standard' | 'high') =>
  (await api.post<DraftResult>('/ai-docs/translate-draft', { ...source, quality }, { timeout: 150_000 })).data;

/** Drive folder link in the team workspace. */
export const driveFolderHref = (id: string) => `/workspace/drive/f/${encodeURIComponent(id)}`;
