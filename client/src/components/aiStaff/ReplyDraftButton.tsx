import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { CornerDownLeft, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { LANG_LABEL, aiReasonText } from './shared';

/** Plain-text draft → escaped HTML paragraphs (for the rich mail editor). */
export const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`).replace(/\n/g, '<br>')}</p>`)
    .join('');

interface DraftResponse {
  draft: { draft: string; lang: string } | null;
  reason?: string;
}

/**
 * "AI cavab təklifi": asks the server for a reply draft (case chat or a linked e-mail), shows it and inserts it
 * into the composer with one click. Nothing is ever sent by the AI.
 */
export const ReplyDraftButton = ({ endpoint, onInsert, className }: { endpoint: string; onInsert: (text: string) => void; className?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');
  const [draft, setDraft] = useState<{ draft: string; lang: string } | null>(null);

  const run = async (refresh: boolean) => {
    setOpen(true);
    setBusy(true);
    try {
      const res = (await api.post<DraftResponse>(endpoint, { instructions: hint.trim() || undefined, refresh })).data;
      if (res.draft) setDraft(res.draft);
      else toast.error(aiReasonText(t, res.reason));
    } catch (err) {
      toastError(err, t('aiStaff.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={clsx('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-50', className)} onClick={() => void run(false)}>
        <Sparkles className="size-3.5" aria-hidden /> {t('aiStaff.reply.button')}
      </button>
    );
  }

  return (
    <div className={clsx('space-y-2 rounded-lg border border-brand-100 bg-brand-50/40 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
          <Sparkles className="size-3.5 text-brand-600" aria-hidden /> {t('aiStaff.reply.title')}
          {draft && <span className="badge bg-white text-[10px] text-muted">{t('aiStaff.reply.lang', { lang: LANG_LABEL[draft.lang] ?? draft.lang })}</span>}
        </p>
        <button type="button" className="grid size-7 place-items-center rounded-md text-muted hover:bg-white" onClick={() => setOpen(false)} aria-label={t('aiStaff.reply.close')}>
          <X className="size-3.5" />
        </button>
      </div>
      {busy && !draft ? (
        <div className="flex justify-center py-3 text-brand-600">
          <Spinner className="size-5" />
        </div>
      ) : draft ? (
        <p className="max-h-48 overflow-y-auto rounded-md bg-white px-3 py-2 text-sm whitespace-pre-wrap text-ink">{draft.draft}</p>
      ) : null}
      <input className="input h-9 text-xs" value={hint} maxLength={300} onChange={(e) => setHint(e.target.value)} placeholder={t('aiStaff.reply.hintPlaceholder')} />
      <div className="flex flex-wrap items-center gap-2">
        {draft && (
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              onInsert(draft.draft);
              toast.success(t('aiStaff.reply.inserted'));
              setOpen(false);
            }}
          >
            <CornerDownLeft className="size-3.5" /> {t('aiStaff.reply.insert')}
          </button>
        )}
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void run(!!draft)}>
          {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {draft ? t('aiStaff.reply.again') : t('aiStaff.reply.generate')}
        </button>
        <span className="text-[11px] text-muted">{t('aiStaff.reply.note')}</span>
      </div>
    </div>
  );
};
