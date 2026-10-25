import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { driveError } from '@/components/drive/api';
import type { DriveItem } from '@/components/drive/types';
import { fromText, previewText, type Delimiter } from './api';

const DELIMS: Delimiter[] = ['auto', 'tab', 'semicolon', 'comma', 'pipe', 'spaces', 'none'];
const MAX_CHARS = 2_000_000;

/** Debounced value (the preview asks the server only after typing stops). */
const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
};

/**
 * "Text → PDF / Excel": paste text or a table copied from anywhere; columns are detected on the server
 * (tab, semicolon, comma, pipe tables, aligned columns) with a live preview; the result is saved in the folder.
 */
export default function TextConvertDialog({ parentId, onClose, onCreated }: { parentId: string; onClose: () => void; onCreated: (item: DriveItem, format: 'pdf' | 'xlsx') => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [delimiter, setDelimiter] = useState<Delimiter>('auto');
  const debounced = useDebounced(text, 350);
  const preview = useQuery({
    queryKey: ['drive', 'textPreview', debounced, delimiter],
    queryFn: () => previewText(debounced, delimiter),
    enabled: debounced.trim().length > 0,
    staleTime: Infinity,
    gcTime: 30_000,
  });
  const p = debounced.trim() ? preview.data : undefined;
  const isTable = !!p && p.delimiter !== 'none' && p.columns >= 2;

  // A sensible default name: the first words of the text.
  const suggested = text.trim().split('\n')[0]?.replace(/\t|;|,|\|/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || t('docCreate.fromText.defaultName');
  const create = useMutation({
    mutationFn: () => fromText({ parentId, name: name.trim() || suggested, text, format, delimiter }),
    onSuccess: (r) => {
      toast.success(t('docCreate.fromText.created'));
      onCreated(r.item, format);
    },
    onError: (err) => toast.error(driveError(err)),
  });

  return (
    <Modal
      open
      onClose={() => !create.isPending && onClose()}
      size="lg"
      title={t('docCreate.fromText.title')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={create.isPending}>
            {t('docCreate.editor.close')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!text.trim() || create.isPending || text.length > MAX_CHARS} onClick={() => create.mutate()}>
            {create.isPending && <Spinner className="size-3.5" />} {t('docCreate.fromText.create')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold text-muted">{t('docCreate.fromText.paste')}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('docCreate.fromText.placeholder')}
            rows={8}
            spellCheck={false}
            data-autofocus
            className="input min-h-40 resize-y font-mono !text-xs leading-relaxed"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('docCreate.fromText.name')}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} maxLength={180} className="input" />
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('docCreate.fromText.format')}</span>
            <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label={t('docCreate.fromText.format')}>
              {(['pdf', 'xlsx'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={format === f}
                  onClick={() => setFormat(f)}
                  className={clsx('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition', format === f ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
                >
                  {f === 'pdf' ? <FileText className="size-3.5" /> : <FileSpreadsheet className="size-3.5" />} {t(`docCreate.fromText.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('docCreate.fromText.delimiter')}</span>
            <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)} className="input !py-1.5">
              {DELIMS.map((d) => (
                <option key={d} value={d}>
                  {t(`docCreate.fromText.delimiters.${d}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {text.trim() && (
          <section className="rounded-xl border border-line bg-surface/60">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
              <span className="font-semibold text-ink">{t('docCreate.fromText.preview')}</span>
              {preview.isFetching && <Spinner className="size-3" />}
              {p && (
                <span className="text-muted">
                  {isTable ? `${t('docCreate.fromText.detected', { rows: p.totalRows, cols: p.columns })} · ${t(`docCreate.fromText.delimiters.${p.delimiter}`)} · ${t('docCreate.fromText.headerHint')}` : format === 'xlsx' ? t('docCreate.fromText.xlsxPlain') : t('docCreate.fromText.plain')}
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-auto">
              {p && isTable ? (
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {p.rows.map((r, i) => (
                      <tr key={i} className={clsx(i === 0 && 'bg-primary/[0.06] font-semibold dark:bg-white/5')}>
                        {r.map((c, j) => (
                          <td key={j} className="max-w-56 truncate border border-line px-2 py-1 text-ink" title={c}>
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <pre className="px-3 py-2 font-sans text-xs whitespace-pre-wrap text-ink">{debounced.slice(0, 3000)}</pre>
              )}
              {p && isTable && p.totalRows > p.rows.length && <p className="px-3 py-1.5 text-xs text-muted">{t('docCreate.fromText.more', { count: p.totalRows - p.rows.length })}</p>}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
