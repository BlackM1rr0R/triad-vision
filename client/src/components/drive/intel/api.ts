import { api } from '@/lib/api';
import type { DriveItem } from '../types';

const enc = encodeURIComponent;

export const intelKeys = {
  all: ['drive-intel'] as const,
  compare: (id: string, a: string, b: string) => ['drive-intel', 'compare', id, a, b] as const,
  fields: (id: string, caseId: string, lang: string) => ['drive-intel', 'fields', id, caseId, lang] as const,
  esign: (ids: string) => ['drive-intel', 'esign', ids] as const,
};

// ─── Search ──────────────────────────────────────────────────────────

export interface Snippet {
  before: string;
  match: string;
  after: string;
}
export type SearchItem = DriveItem & { contentMatch?: { snippet: Snippet | null } };

// ─── Compare ─────────────────────────────────────────────────────────

export interface DiffOp {
  t: 'eq' | 'del' | 'ins';
  s: string;
}
export interface CellChange {
  cell: string;
  type: 'added' | 'removed' | 'changed';
  old: string | null;
  new: string | null;
}
export type CompareResult =
  | { kind: 'text'; mode: 'words' | 'lines'; chunks: { page: number | null; ops: DiffOp[]; changed: boolean }[]; stats: { added: number; removed: number }; truncated: boolean }
  | {
      kind: 'sheet';
      sheets: { name: string; status: 'same' | 'changed' | 'added' | 'removed'; changes: CellChange[] }[];
      stats: { added: number; removed: number; changed: number };
      truncated: boolean;
    }
  | { kind: 'image' };

export interface CompareSide {
  ref: string;
  version: number;
  createdAt: string;
  size: number;
  mimeType: string | null;
  url: string;
}
export interface CompareResponse {
  node: { id: string; name: string };
  a: CompareSide;
  b: CompareSide;
  result: CompareResult;
}

export const fetchCompare = async (nodeId: string, a: string, b: string) =>
  (await api.get<CompareResponse>(`/drive/intel/compare/${enc(nodeId)}`, { params: { a, b } })).data;

// ─── Templates ───────────────────────────────────────────────────────

export type FieldStatus = 'filled' | 'missing' | 'optional' | 'known' | 'input';
export interface TemplateField {
  key: string;
  label: string;
  known: boolean;
  input: boolean;
  optional: boolean;
  style: 'braces' | 'brackets' | 'guillemets' | 'field';
  count: number;
  value: string | null;
  status: FieldStatus;
}
export interface FieldsResponse {
  node: { id: string; name: string };
  format: 'docx' | 'pdf' | null;
  supported: boolean;
  reason?: string;
  clientName: string | null;
  fields: TemplateField[];
}
export type FillLang = 'de' | 'en' | 'az' | 'ru';

export const fetchFields = async (nodeId: string, caseId?: string, lang: FillLang = 'de') =>
  (await api.get<FieldsResponse>(`/drive/intel/template/${enc(nodeId)}/fields`, { params: { caseId: caseId || undefined, lang } })).data;

export interface FillResult {
  id: string;
  name: string;
  parentId: string;
  filled: string[];
  missing: string[];
  item: DriveItem | null;
}
export const fillTemplate = async (nodeId: string, body: { caseId: string; inputs: Record<string, string>; targetFolderId?: string; lang: FillLang }) =>
  (await api.post<FillResult>(`/drive/intel/template/${enc(nodeId)}/fill`, body)).data;

export interface BulkResult {
  caseId: string;
  ok: boolean;
  id?: string;
  name?: string;
  parentId?: string;
  missing?: string[];
  error?: string;
}
export const fillTemplateBulk = async (nodeId: string, body: { caseIds: string[]; inputs: Record<string, string>; lang: FillLang }) =>
  (await api.post<{ results: BulkResult[] }>(`/drive/intel/template/${enc(nodeId)}/fill-bulk`, body)).data.results;

export interface CaseHit {
  id: string;
  number: string;
  client: { firstName: string; lastName: string };
}
export const searchCases = async (q: string) => (await api.get<{ items: CaseHit[] }>('/admin/cases', { params: { search: q, page: 1 } })).data.items.slice(0, 10);

// ─── E-signature ─────────────────────────────────────────────────────

export type SignerRole = 'CANDIDATE' | 'COMPANY' | 'STAFF' | 'OTHER';
export interface SignerInput {
  role: SignerRole;
  name: string;
  email: string;
  phone?: string | null;
  userId?: string | null;
  locale?: 'az' | 'de' | 'en' | 'ru' | null;
  order?: number | null;
}
export interface EsignBody {
  title: string;
  caseId?: string | null;
  companyId?: string | null;
  message?: string | null;
  expiresInDays: number;
  order: 'SEQUENTIAL' | 'PARALLEL';
  signers: SignerInput[];
}
export const sendForSignature = async (nodeId: string, body: EsignBody) => (await api.post<{ request: { id: string } }>(`/drive/intel/esign/${enc(nodeId)}`, body)).data.request;

export interface EsignStatus {
  requestId: string;
  status: 'DRAFT' | 'SENT' | 'COMPLETED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
  signed: number;
  total: number;
  open: boolean;
}
export const fetchEsignStatus = async (ids: string[]) =>
  (await api.get<{ statuses: Record<string, EsignStatus> }>('/drive/intel/esign-status', { params: { ids: ids.join(',') } })).data.statuses;

export interface SignPrefill {
  case: { id: string; number: string } | null;
  company: { id: string; name: string } | null;
  signers: SignerInput[];
  staff: SignerInput;
  defaults: { expiresInDays: number };
}
export const fetchSignPrefill = async (caseId?: string) => (await api.get<SignPrefill>('/admin/signatures/prefill', { params: { caseId: caseId || undefined } })).data;

// ─── Helpers ─────────────────────────────────────────────────────────

export const isPdf = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) => i.kind === 'FILE' && (i.mimeType === 'application/pdf' || /\.pdf$/i.test(i.name));
export const isDocx = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) =>
  i.kind === 'FILE' && (i.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || /\.docx$/i.test(i.name));
export const isTemplateCandidate = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) => isPdf(i) || isDocx(i);
/** Types the comparison understands (others still open the dialog to list versions). */
export const comparable = (i: Pick<DriveItem, 'kind' | 'name' | 'mimeType'>) =>
  i.kind === 'FILE' && (/\.(pdf|docx|xlsx|txt|csv|md|tsv|jpe?g|png)$/i.test(i.name) || /^(application\/pdf|text\/|image\/(jpeg|png))/.test(i.mimeType ?? ''));
