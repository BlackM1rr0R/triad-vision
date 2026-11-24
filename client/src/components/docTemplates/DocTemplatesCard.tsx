import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FileSpreadsheet, FileText, FileUser, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesDocTemplates } from '@/i18n/pagesDocTemplates';
import { DOC_TEMPLATE_KINDS, SHEET_LANGS, downloadPdf, type DocTemplateKind, type DocTemplateStatus, type SheetLang } from './api';

registerCopy(pagesDocTemplates);

const ICON: Record<DocTemplateKind, typeof FileText> = { videx: FileSpreadsheet, lebenslauf: FileUser, anschreiben: Mail };
export const LANG_NAMES: Record<SheetLang, string> = { az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский', tr: 'Türkçe', uk: 'Українська' };

/**
 * Client cabinet, case documents tab: "Hazır sənəd şablonları" (GET /api/account/doc-templates/cases/:id) — the
 * VIDEX preparation sheet, an automatic Lebenslauf and a sample Anschreiben, generated on demand from the profile
 * and the case. Read-only (works while staff view the cabinet as the client).
 */
export function DocTemplatesCard({ caseId }: { caseId: string }) {
  const { t, i18n } = useTranslation();
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [lang, setLang] = useState<SheetLang>((SHEET_LANGS as readonly string[]).includes(ui) ? (ui as SheetLang) : 'az');
  const [busy, setBusy] = useState<DocTemplateKind | null>(null);
  const langId = useId();
  const headingId = useId();
  const q = useQuery({
    queryKey: ['account', 'doc-templates', caseId],
    queryFn: async () => (await api.get<{ items: DocTemplateStatus[] }>(`/account/doc-templates/cases/${caseId}`)).data.items,
    staleTime: 60_000,
  });
  if (!q.data) return null;
  const byKind = new Map(q.data.map((s) => [s.kind, s]));

  const download = async (kind: DocTemplateKind) => {
    setBusy(kind);
    try {
      await downloadPdf(`/account/doc-templates/cases/${caseId}/${kind}.pdf${kind === 'videx' ? `?lang=${lang}` : ''}`, `${kind}.pdf`);
    } catch {
      toast.error(t('docTemplates.error'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="doc-templates" aria-labelledby={headingId} className="card scroll-mt-40 p-5 sm:p-6">
      <h2 id={headingId} className="type-card-title text-xl">
        {t('docTemplates.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('docTemplates.intro')}</p>
      <ul className="mt-4 divide-y divide-line">
        {DOC_TEMPLATE_KINDS.map((kind) => {
          const s = byKind.get(kind);
          if (!s) return null;
          const Icon = ICON[kind];
          return (
            <li key={kind} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-link">
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t(`docTemplates.kinds.${kind}.name`)}</p>
                <p className="mt-0.5 text-sm text-muted">{t(`docTemplates.kinds.${kind}.what`)}</p>
                {!s.available ? (
                  <p className="mt-1 text-sm text-muted">{t('docTemplates.unavailable')}</p>
                ) : (
                  <>
                    {kind !== 'lebenslauf' && (
                      <p className={s.missing.length ? 'mt-1 text-sm font-medium text-warning-fg' : 'mt-1 text-sm text-success-fg'}>
                        {s.missing.length ? t('docTemplates.missing', { count: s.missing.length }) : t('docTemplates.allFilled')}
                      </p>
                    )}
                    {kind === 'lebenslauf' && (
                      <p className="mt-1 text-sm text-muted">
                        {t(s.source === 'cv' ? 'docTemplates.kinds.lebenslauf.fromCv' : 'docTemplates.kinds.lebenslauf.fromProfile')}{' '}
                        <Link to="/account/cv" className="font-semibold text-link hover:underline">
                          {t('docTemplates.kinds.lebenslauf.openCv')}
                        </Link>
                      </p>
                    )}
                    {kind === 'videx' && (
                      <div className="mt-2 flex items-center gap-2 text-sm">
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
                    )}
                  </>
                )}
              </div>
              {s.available && (
                <Button size="sm" variant="secondary" icon={Download} loading={busy === kind} onClick={() => void download(kind)} className="shrink-0 self-start">
                  {t('docTemplates.download')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">{t('docTemplates.note')}</p>
    </section>
  );
}
