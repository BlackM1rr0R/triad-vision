import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Languages } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import type { L10n } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { LANGS, type Lang } from './L10nInput';

/** `{ az, de, en, ru, _ai?: [...] }` as the API stores AI-translated texts. */
export type L10nWithAi = L10n & { _ai?: Lang[] };

/** Languages marked as AI-translated in a stored value. */
export const aiLangsOf = (v: unknown): Lang[] => {
  const raw = v && typeof v === 'object' ? (v as { _ai?: unknown })._ai : null;
  return Array.isArray(raw) ? LANGS.filter((l) => raw.includes(l)) : [];
};

/** Plain four-language value without the marker (for form state). */
export const plainL10n = (v: L10n | null | undefined): L10n => ({ az: v?.az ?? '', de: v?.de ?? '', en: v?.en ?? '', ru: v?.ru ?? '' });

/**
 * "Translate" button next to the language tabs: translates the empty languages, the ones that are a copy of
 * the source text and the unedited AI ones from the first language a person wrote. Nothing is saved here.
 */
export const TranslateButton = <K extends string>({
  fields,
  ai,
  onTranslated,
  context,
  disabled,
}: {
  fields: Record<K, L10n>;
  /** Unedited AI languages per field. */
  ai?: Partial<Record<K, Lang[]>>;
  onTranslated: (values: Record<K, L10n>, translated: Record<K, Lang[]>) => void;
  context?: string;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const names = Object.keys(fields) as K[];
  const isHuman = (k: K, l: Lang) => !!fields[k][l].trim() && !(ai?.[k] ?? []).includes(l);
  const source = LANGS.find((l) => names.some((k) => isHuman(k, l))) ?? LANGS.find((l) => names.some((k) => fields[k][l].trim()));

  const run = async () => {
    if (!source) {
      toast.info(t('admin.l10n.nothingToTranslate'));
      return;
    }
    // Per field: re-translate copies of the source and unedited AI texts (empty ones are translated anyway).
    const overwrite = Object.fromEntries(
      names.map((k) => [k, LANGS.filter((l) => l !== source && fields[k][source].trim() && (fields[k][l].trim() === fields[k][source].trim() || (ai?.[k] ?? []).includes(l)))]),
    );
    setBusy(true);
    try {
      const res = await api.post<{ values: Record<K, L10n>; translated: Record<K, Lang[]>; autoTranslated: boolean; reason: string | null }>('/admin/translate', {
        fields,
        source,
        overwrite,
        context,
      });
      if (!res.data.autoTranslated) {
        if (res.data.reason === 'NOTHING_TO_TRANSLATE' || res.data.reason === 'NO_SOURCE') toast.info(t('admin.l10n.nothingToTranslate'));
        else toast.error(t('admin.l10n.translateFailed', { reason: res.data.reason ?? '—' }));
        return;
      }
      onTranslated(res.data.values, res.data.translated);
      const langs = [...new Set(Object.values<Lang[]>(res.data.translated).flat())].map((l) => l.toUpperCase()).join(', ');
      toast.success(t('admin.l10n.translated', { langs }));
    } catch (err) {
      toast.error(t('admin.l10n.translateFailed', { reason: errorCode(err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-card px-2 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
      onClick={() => void run()}
      disabled={disabled || busy}
      title={t('admin.l10n.translateTitle')}
    >
      {busy ? <Spinner className="size-3" /> : <Languages className="size-3.5" aria-hidden />}
      {t('admin.l10n.translate')}
    </button>
  );
};
