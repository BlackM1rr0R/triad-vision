import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, FileSearch, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { registerCopy } from '@/i18n';
import { pagesUploadAi } from '@/i18n/pagesUploadAi';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { ackDocument, uploadAiKeys, useCaseInsights } from './api';

registerCopy(pagesUploadAi);

/** Uploads older than this without a result are not shown as "recognising" any more. */
const FRESH_MS = 3 * 60_000;

/**
 * Client portal, under one uploaded document: "Recognised as: Passport · valid until 04.05.2031", and when the
 * file looks like another document than the requirement asks for, a warning with two buttons —
 * "Keep it anyway" and "Choose another file" (replaces the upload). Expiry / name warnings and the stored
 * low-quality marker are shown as short lines.
 */
export const RecognitionNotice = ({
  caseId,
  docId,
  createdAt,
  rejected,
  onReplace,
}: {
  caseId: string;
  docId: string;
  createdAt: string;
  rejected?: boolean;
  /** Replace this upload with another file (the caller deletes the old one when allowed and uploads the new one). */
  onReplace?: (file: File) => void | Promise<void>;
}) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const qc = useQueryClient();
  const q = useCaseInsights(caseId, 'client');
  const input = useRef<HTMLInputElement>(null);
  const [acking, setAcking] = useState(false);
  const insight = q.data?.insights.find((i) => i.documentId === docId);
  if (!insight || rejected) return null;

  if (!insight.ready) {
    if (Date.now() - new Date(createdAt).getTime() > FRESH_MS) return null;
    return (
      <p className="mt-1 mr-1.5 mb-1 flex items-center gap-1.5 text-xs text-muted" role="status">
        <Spinner className="size-3" /> {t('uploadAi.client.analysing')}
      </p>
    );
  }

  const type = insight.docType ? t(`uploadAi.types.${insight.docType}`) : null;
  const wrong = insight.flags.includes('WRONG_REQUIREMENT') && !insight.acknowledged;
  const lines: string[] = [];
  if (insight.flags.includes('EXPIRED')) lines.push(t('uploadAi.client.expired'));
  else if (insight.flags.includes('EXPIRES_SOON')) lines.push(t('uploadAi.client.expiresSoon'));
  if (insight.flags.includes('NAME_MISMATCH')) lines.push(t('uploadAi.client.nameMismatch'));
  const lowQuality = insight.quality?.level === 'BAD';

  const ack = async () => {
    setAcking(true);
    try {
      await ackDocument(docId);
      await qc.invalidateQueries({ queryKey: uploadAiKeys.case(caseId, 'client') });
      toast.success(t('uploadAi.client.kept'));
    } catch {
      toast.error(t('uploadAi.staff.error'));
    } finally {
      setAcking(false);
    }
  };

  const picker = onReplace && (
    <input
      ref={input}
      type="file"
      accept="application/pdf,image/jpeg,image/png,image/webp,.doc,.docx"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void onReplace(f);
      }}
    />
  );

  return (
    <div className="mt-1 mr-1.5 mb-1 space-y-1.5">
      {type && !wrong && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
          <span>
            {t('uploadAi.client.recognised', { type })}
            {insight.expiryDate && ` · ${t('uploadAi.client.validUntil', { date: date(insight.expiryDate) })}`}
          </span>
        </p>
      )}
      {wrong && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="flex items-start gap-1.5 font-medium">
            <FileSearch className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {type && insight.expectedType
              ? t('uploadAi.client.wrong', { found: type, expected: t(`uploadAi.types.${insight.expectedType}`) })
              : t('uploadAi.client.wrongNoExpected')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {picker}
            {onReplace && (
              <button type="button" className="btn-primary btn-sm" onClick={() => input.current?.click()}>
                <RefreshCw className="size-3.5" aria-hidden /> {t('uploadAi.client.chooseAnother')}
              </button>
            )}
            <button type="button" className="btn-secondary btn-sm" onClick={() => void ack()} disabled={acking}>
              {acking && <Spinner className="size-3" />} {t('uploadAi.client.uploadAnyway')}
            </button>
          </div>
        </div>
      )}
      {lines.map((l) => (
        <p key={l} className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {l}
        </p>
      ))}
      {lowQuality && !wrong && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          <span>{[...new Set(insight.quality!.reasons.map((r) => t(`uploadAi.quality.reasons.${r.code}`, { defaultValue: r.code })))].join(' · ')}</span>
          {picker}
          {onReplace && (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => input.current?.click()}>
              {t('uploadAi.client.chooseAnother')}
            </button>
          )}
        </p>
      )}
    </div>
  );
};

export default RecognitionNotice;
