import { api } from '@/lib/api';
import { optimizeImages } from '@/lib/imageCompress';

/** Server limit (lib/scan/pdf.ts SCAN_MAX_PAGES). */
export const SCAN_PDF_MAX_PAGES = 20;

/**
 * The camera scanner's JPEG pages → ONE PDF file (POST /api/scan/pdf builds it, nothing is stored), so any upload
 * spot that takes a PDF can offer the multi-page scanner and then send the result through its own upload.
 */
export const scanPagesToPdf = async (pages: File[], name?: string): Promise<File> => {
  const form = new FormData();
  if (name) form.append('name', name.slice(0, 180));
  for (const p of await optimizeImages(pages.slice(0, SCAN_PDF_MAX_PAGES))) form.append('pages', p);
  const { data } = await api.post<Blob>('/scan/pdf', form, { responseType: 'blob', timeout: 180_000 });
  const base = (name ?? '').replace(/[\\/:*?"<>|]+/g, ' ').trim().replace(/\.pdf$/i, '') || `scan-${new Date().toISOString().slice(0, 10)}`;
  return new File([data], `${base}.pdf`, { type: 'application/pdf' });
};
