import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CaseDocument, CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesDocsIntel } from '@/i18n/pagesDocsIntel';

registerCopy(pagesDocsIntel);

// ─── Types (mirror server/src/lib/docsIntel) ───────────────────────────

export interface Mrz {
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  birthDate: string;
  sex: 'M' | 'F' | 'X';
  expiryDate: string;
  valid: boolean;
  checks: Record<string, boolean>;
}

export type OcrRecord =
  | { skipped: 'pdf' | 'unsupported'; at: string }
  | { error: string; at: string; mrz?: undefined }
  | { mrz: Mrz | null; raw: string; confidence: number; at: string; applied?: string[]; expiryWarning?: boolean; error?: 'MRZ_NOT_FOUND' };

/** Case documents carry the OCR columns too (the API returns full rows). */
export type DocWithOcr = CaseDocument & { ocr?: OcrRecord | null; ocrAt?: string | null };

export interface PassportProfile {
  passportNumber: string | null;
  passportExpiry: string | null;
  birthDate: string | null;
  nationality: string | null;
}

export interface OcrResponse {
  documentId: string;
  ocr: OcrRecord | null;
  ocrAt: string | null;
  requirementKey: string | null;
  profile: PassportProfile;
  available?: boolean;
}

export const FORM_KINDS = ['videx-summary', 'employer-letter', 'contract-cover'] as const;
export type FormKind = (typeof FORM_KINDS)[number];

export interface CaseIntel {
  caseId: string;
  status: CaseStatus;
  passport: {
    id: string;
    originalName: string;
    mimeType: string;
    status: string;
    ocr: OcrRecord | null;
    ocrAt: string | null;
    createdAt: string;
    isImage: boolean;
    extracted: PassportProfile | null;
  } | null;
  profile: PassportProfile;
  ocrAvailable: boolean;
  packet: { allowed: boolean; accepted: number; total: number };
  forms: Record<FormKind, { missing: string[] }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────

export const mrzOf = (ocr: OcrRecord | null | undefined): Mrz | null => (ocr && 'mrz' in ocr && ocr.mrz ? ocr.mrz : null);

export const extractedProfile = (mrz: Mrz): PassportProfile => ({
  passportNumber: mrz.documentNumber || null,
  passportExpiry: mrz.expiryDate || null,
  birthDate: mrz.birthDate || null,
  nationality: mrz.nationality || null,
});

export const PROFILE_KEYS: (keyof PassportProfile)[] = ['passportNumber', 'passportExpiry', 'birthDate', 'nationality'];

/** Profile fields whose value differs from the passport (empty profile values count as different). */
export const profileDiff = (profile: PassportProfile, extracted: PassportProfile) =>
  PROFILE_KEYS.filter((k) => extracted[k] && (profile[k] ?? '') !== extracted[k]);

const MONTH = 30.44 * 24 * 60 * 60 * 1000;
export const expiryState = (expiryDate: string | null | undefined): 'ok' | 'soon' | 'expired' | null => {
  if (!expiryDate) return null;
  const t = new Date(`${expiryDate}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  if (t <= Date.now()) return 'expired';
  return t < Date.now() + 12 * MONTH ? 'soon' : 'ok';
};

export const isImageMime = (m: string) => m === 'image/jpeg' || m === 'image/png' || m === 'image/webp';

// ─── Queries ───────────────────────────────────────────────────────────

export const intelKey = (caseId: string) => ['doc-intel', caseId] as const;

export const useCaseIntel = (caseId: string) =>
  useQuery({
    queryKey: intelKey(caseId),
    queryFn: async () => (await api.get<CaseIntel>(`/documents/cases/${caseId}/intel`)).data,
    staleTime: 30_000,
  });

export const useIntelRefresh = (caseId: string) => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: intelKey(caseId) }),
      qc.invalidateQueries({ queryKey: ['case', caseId] }),
      qc.invalidateQueries({ queryKey: ['admin-case', caseId] }),
      qc.invalidateQueries({ queryKey: ['me'] }),
    ]);
};

export const runOcr = async (docId: string) => (await api.post<OcrResponse>(`/documents/${docId}/ocr`)).data;
export const applyOcr = async (docId: string) => (await api.post<{ profile: PassportProfile }>(`/documents/${docId}/ocr/apply`)).data;

/** Downloads a generated PDF (packet or form) and returns the missing-fields header when present. */
export const downloadPdf = async (url: string, fallbackName: string) => {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
  const missingHeader = String(res.headers['x-missing-fields'] ?? '');
  return { name, missing: missingHeader ? missingHeader.split(',').filter(Boolean) : [] };
};

export const packetUrl = (caseId: string) => `/documents/cases/${caseId}/packet`;
export const formUrl = (caseId: string, kind: FormKind) => `/documents/cases/${caseId}/forms/${kind}`;
export const storePacket = async (caseId: string) => (await api.get<{ document: CaseDocument; pages: number }>(`${packetUrl(caseId)}?store=1`)).data;
