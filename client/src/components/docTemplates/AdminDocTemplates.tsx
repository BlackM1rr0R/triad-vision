import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FolderInput } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesDocTemplates } from '@/i18n/pagesDocTemplates';
import { DOC_TEMPLATE_KINDS, SHEET_LANGS, downloadPdf, type DocTemplateKind, type DocTemplateStatus, type SheetLang } from './api';
import { LANG_NAMES } from './DocTemplatesCard';

registerCopy(pagesDocTemplates);

/**
 * Admin case page, documents tab: the same prefilled templates as the client cabinet (VIDEX preparation sheet,
 * Lebenslauf, Anschreiben) — download (audited) or "add to folder" (copy into "<client folder>/Sənəd şablonları").
 * Staff see the employer even before the client does.
 */
export function AdminDocTemplates({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<SheetLang>('az');
  const [busy, setBusy] = useState<string | null>(null);
  const langId = useId();
  const q = useQuery({
    queryKey: ['admin', 'doc-templates', caseId],
    queryFn: async () => (await api.get<{ items: DocTemplateStatus[] }>(`/admin/cases/${caseId}/doc-templates`)).data.items,
    staleTime: 60_000,
  });
  if (!q.data) return null;
  const byKind = new Map(q.data.map((s) => [s.kind, s]));
  const query = (kind: DocTemplateKind) => (kind === 'videx' ? `?lang=${lang}` : '');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      const code = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      toast.error(code === 'NO_DRIVE_FOLDER' ? t('docTemplates.staff.noFolder') : t('docTemplates.error'));
    } finally {
      setBusy(null);
    }
  };
  const download = (kind: DocTemplateKind) => run(`d-${kind}`, () => downloadPdf(`/admin/cases/${caseId}/doc-templates/${kind}.pdf${query(kind)}`, `${kind}.pdf`));
  const attach = (kind: DocTemplateKind) =>
    run(`a-${kind}`, async () => {
      const out = (await api.post<{ nodeId: string; name: string }>(`/admin/cases/${caseId}/doc-templates/${kind}/attach`, { lang })).data;
      toast.success(t('docTemplates.staff.attached', { name: out.name }));
    });

  return (
    <section id="case-doc-templates" className="card scroll-mt-28 p-4 sm:p-5" aria-labelledby={`${langId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${langId}-title`} className="type-card-title">
            {t('docTemplates.staff.title')}
          </h3>
          <p className="mt-0.5 text-sm text-muted">{t('docTemplates.staff.intro')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor={langId} className="text-muted">
            {t('docTemplates.language')}
          </label>
          <select id={langId} className="input h-9 w-auto py-0" value={lang} onChange={(e) => setLang(e.target.value as SheetLang)}>
            {SHEET_LANGS.map((l) => (
              <option key={l} value={l}>
                {LANG_NAMES[l]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {DOC_TEMPLATE_KINDS.map((kind) => {
          const s = byKind.get(kind);
          if (!s) return null;
          return (
            <li key={kind} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t(`docTemplates.kinds.${kind}.name`)}</p>
                <p className="text-xs text-muted">
                  {!s.available
                    ? t('docTemplates.unavailable')
                    : kind === 'lebenslauf'
                      ? t(s.source === 'cv' ? 'docTemplates.kinds.lebenslauf.fromCv' : 'docTemplates.kinds.lebenslauf.fromProfile')
                      : s.missing.length
                        ? `${t('docTemplates.missing', { count: s.missing.length })}: ${s.missing.join(', ')}`
                        : t('docTemplates.allFilled')}
                </p>
              </div>
              {s.available && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={Download} loading={busy === `d-${kind}`} onClick={() => void download(kind)}>
                    {t('docTemplates.download')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={FolderInput} loading={busy === `a-${kind}`} onClick={() => void attach(kind)}>
                    {t('docTemplates.staff.attach')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
