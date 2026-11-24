import { api } from '@/lib/api';

/** Prefilled document templates of a case (server lib/docTemplates). */
export type DocTemplateKind = 'videx' | 'lebenslauf' | 'anschreiben';
export const DOC_TEMPLATE_KINDS: DocTemplateKind[] = ['videx', 'lebenslauf', 'anschreiben'];
export const SHEET_LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
export type SheetLang = (typeof SHEET_LANGS)[number];

export interface DocTemplateStatus {
  kind: DocTemplateKind;
  available: boolean;
  missing: string[];
  source?: 'cv' | 'profile';
}

/** Downloads a generated PDF through the API client (session, "view as client" header) and saves it. */
export const downloadPdf = async (url: string, fallbackName: string) => {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const cd = String(res.headers['content-disposition'] ?? '');
  const name = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] ?? /filename="?([^";]+)"?/i.exec(cd)?.[1];
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name ? decodeURIComponent(name) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
};
