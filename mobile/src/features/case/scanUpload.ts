import { api } from '@/lib/api';
import type { CaseDocument } from '@/types';
import { renderPage, type ScanPage } from './scanner';
import { overallProgress, scanPdfName } from './scanPages';

export interface ScanPdfResult {
  document: CaseDocument;
  pages: number;
}

/**
 * Renders every page (rotation, 1600 px long edge, JPEG 0.8) and uploads them in order to
 * POST /cases/:caseId/documents/scan, where the server builds ONE PDF and stores it as a normal case
 * document (same checks and rules as a single upload). `onProgress` gets 0…1 over both phases.
 */
export const uploadScanPdf = async (opts: {
  caseId: string;
  requirementId: string;
  title?: string | null;
  pages: ScanPage[];
  onProgress?: (fraction: number) => void;
}): Promise<ScanPdfResult> => {
  const total = opts.pages.length;
  const form = new FormData();
  form.append('requirementId', opts.requirementId);
  form.append('name', scanPdfName(opts.title));
  opts.onProgress?.(0);
  for (let i = 0; i < total; i++) {
    const rendered = await renderPage(opts.pages[i]);
    // React Native's FormData takes { uri, name, type } for files.
    form.append('pages', { uri: rendered.uri, name: `page-${String(i + 1).padStart(2, '0')}.jpg`, type: 'image/jpeg' } as unknown as Blob);
    opts.onProgress?.(overallProgress('render', i + 1, total));
  }
  const res = await api.post<ScanPdfResult>(`/cases/${opts.caseId}/documents/scan`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180_000,
    transformRequest: (data) => data,
    onUploadProgress: (e) => {
      if (e.total) opts.onProgress?.(overallProgress('upload', e.loaded / e.total, 1));
    },
  });
  opts.onProgress?.(1);
  return res.data;
};
