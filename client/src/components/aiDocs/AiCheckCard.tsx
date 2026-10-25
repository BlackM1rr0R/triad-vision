import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAiDocs } from '@/i18n/pagesAiDocs';
import { aiOfChecks, fetchDocCheck, issueText, type AiDocCheck } from './api';

registerCopy(pagesAiDocs);

/** How long after an upload the card keeps asking for the background result. */
const POLL_WINDOW_MS = 90_000;

/**
 * Client view of the AI check of one uploaded document: green "Sənəd yoxlanıldı", or an amber / red card with
 * the findings in the client's language and "Yenidən yüklə". While the background check runs (fresh uploads)
 * it polls GET /api/ai-docs/documents/:id/check. Skipped checks stay invisible to the client.
 */
export const AiCheckCard = ({
  docId,
  checks,
  createdAt,
  rejected,
  onReupload,
}: {
  docId: string;
  checks: unknown;
  createdAt: string;
  rejected?: boolean;
  onReupload?: (file: File) => void;
}) => {
  const { t, i18n } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = aiOfChecks(checks);
  const fresh = Date.now() - new Date(createdAt).getTime() < POLL_WINDOW_MS;
  const q = useQuery({
    queryKey: ['ai-docs', 'check', docId],
    queryFn: () => fetchDocCheck(docId),
    enabled: !initial && fresh && !rejected,
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d && (d.ai || !d.enabled)) return false;
      return Date.now() - new Date(createdAt).getTime() < POLL_WINDOW_MS ? 4000 : false;
    },
    staleTime: 2000,
  });
  const ai: AiDocCheck | null = initial ?? q.data?.ai ?? null;
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);

  if (rejected) return null;
  if (!ai) {
    if (!fresh || q.data?.enabled === false || q.isError) return null;
    return (
      <p className="mt-1.5 mb-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t('aiDocs.check.checking')}
      </p>
    );
  }
  if (ai.verdict === 'skipped') return null;

  if (ai.verdict === 'ok') {
    return (
      <p className="mt-1.5 mb-1 mr-1.5 flex items-center gap-1.5 rounded-md bg-success-bg px-2.5 py-1.5 text-xs font-semibold text-success-fg" title={t('aiDocs.check.okHint')}>
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
        {t('aiDocs.check.ok')} ✓
      </p>
    );
  }

  const danger = ai.verdict === 'wrong_document' || ai.verdict === 'unreadable';
  const Icon = danger ? XCircle : AlertTriangle;
  const issues = ai.issues.map((i) => issueText(i, lang));
  if (!issues.length && ai.verdict === 'unreadable') issues.push(t('aiDocs.check.unreadableHint'));

  return (
    <div
      className={clsx(
        'mt-1.5 mb-1.5 mr-1.5 rounded-lg border px-3 py-2.5 text-xs',
        danger ? 'border-danger-border bg-danger-bg text-danger-fg' : 'border-warning-border bg-warning-bg text-warning-fg',
      )}
      role="status"
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="size-4 shrink-0" aria-hidden />
        {t(`aiDocs.check.${ai.verdict}`)}
      </p>
      {issues.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 leading-relaxed">
          {issues.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="opacity-75">{t('aiDocs.check.note')}</span>
        {onReupload && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (inputRef.current) inputRef.current.value = '';
                if (f) onReupload(f);
              }}
            />
            <button type="button" className="btn-secondary btn-sm text-ink" onClick={() => inputRef.current?.click()}>
              <RefreshCw className="size-3.5" aria-hidden />
              {t('aiDocs.check.reupload')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AiCheckCard;
