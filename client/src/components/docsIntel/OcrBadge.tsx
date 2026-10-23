import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, ScanLine, UserCheck } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneTexts } from '@/components/ui/status';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import {
  applyOcr,
  expiryState,
  extractedProfile,
  isImageMime,
  mrzOf,
  profileDiff,
  PROFILE_KEYS,
  runOcr,
  useIntelRefresh,
  type DocWithOcr,
  type OcrRecord,
  type OcrResponse,
} from './api';

const ocrKey = (docId: string) => ['doc-ocr', docId] as const;

/** One-line state of an OCR record, translated. */
export const useOcrStatus = () => {
  const { t } = useTranslation();
  return (ocr: OcrRecord | null | undefined, ocrAt: string | null | undefined, isImage: boolean): { text: string; tone: 'muted' | 'warn' | 'ok' | 'danger' } => {
    if (!ocr) return isImage ? { text: ocrAt ? t('docsIntel.ocr.notRun') : t('docsIntel.ocr.queued'), tone: 'muted' } : { text: t('docsIntel.ocr.skippedPdf'), tone: 'muted' };
    if ('skipped' in ocr) return { text: ocr.skipped === 'pdf' ? t('docsIntel.ocr.skippedPdf') : t('docsIntel.ocr.skippedUnsupported'), tone: 'muted' };
    if ('error' in ocr && !('mrz' in ocr)) return { text: t('docsIntel.ocr.error', { message: ocr.error }), tone: 'danger' };
    if (!ocr.mrz) return { text: t('docsIntel.ocr.notFound'), tone: 'warn' };
    if (!ocr.mrz.valid) return { text: t('docsIntel.ocr.invalid'), tone: 'warn' };
    return { text: `${t('docsIntel.ocr.confidence')}: ${Math.round(ocr.confidence)}%`, tone: 'ok' };
  };
};

const TONE = { ...toneTexts(STATUS_TONES.check), muted: 'text-muted' } as const;

/**
 * Staff view under a case document: OCR state, the extracted MRZ fields next to the profile values and an
 * "apply to profile" button when they differ. Rendered for images and for PASSPORT requirements only.
 */
export const OcrBadge = ({ caseId, doc, requirementKey }: { caseId: string; doc: DocWithOcr; requirementKey?: string | null }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = useIntelRefresh(caseId);
  const status = useOcrStatus();
  const isImage = isImageMime(doc.mimeType);
  const [running, setRunning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState(false);

  // The case detail already carries ocr/ocrAt; the profile values come from the OCR endpoint.
  const q = useQuery({
    queryKey: ocrKey(doc.id),
    queryFn: async () => (await api.get<OcrResponse>(`/documents/${doc.id}/ocr`)).data,
    enabled: open || !!mrzOf(doc.ocr),
    staleTime: 60_000,
  });
  const ocr = q.data?.ocr ?? doc.ocr ?? null;
  const ocrAt = q.data?.ocrAt ?? doc.ocrAt ?? null;
  const mrz = mrzOf(ocr);
  const extracted = mrz ? extractedProfile(mrz) : null;
  const diff = extracted && q.data ? profileDiff(q.data.profile, extracted) : [];
  const expiry = expiryState(mrz?.expiryDate);
  const st = status(ocr, ocrAt, isImage);

  if (!isImage && requirementKey !== 'PASSPORT') return null;

  const run = async () => {
    setRunning(true);
    try {
      const res = await runOcr(doc.id);
      qc.setQueryData(ocrKey(doc.id), res);
      setOpen(true);
      await refresh();
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === 'OCR_UNAVAILABLE' ? t('docsIntel.ocr.unavailable') : t('docsIntel.ocr.error', { message: code }));
    } finally {
      setRunning(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const { profile } = await applyOcr(doc.id);
      qc.setQueryData(ocrKey(doc.id), (old: OcrResponse | undefined) => (old ? { ...old, profile } : old));
      toast.success(t('docsIntel.ocr.applied'));
      setConfirm(false);
      await refresh();
    } catch (err) {
      toast.error(t('docsIntel.ocr.error', { message: errorCode(err) }));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="border-t border-line bg-surface/50 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          className={clsx('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold', mrz?.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-ink/70')}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ScanLine className="size-3" aria-hidden /> {t('docsIntel.ocr.badge')}
        </button>
        <span className={TONE[st.tone]}>{st.text}</span>
        {expiry === 'soon' && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <AlertTriangle className="size-3" aria-hidden /> {t('docsIntel.ocr.expiryWarning')}
          </span>
        )}
        {expiry === 'expired' && (
          <span className="inline-flex items-center gap-1 text-red-700">
            <AlertTriangle className="size-3" aria-hidden /> {t('docsIntel.ocr.expired')}
          </span>
        )}
        {isImage && (
          <button type="button" className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-md border border-line bg-white px-2 py-1 font-semibold text-ink/80 transition hover:border-brand-400 hover:text-brand-700 disabled:opacity-50" onClick={run} disabled={running}>
            {running ? <Spinner className="size-3" /> : <ScanLine className="size-3" aria-hidden />} {running ? t('docsIntel.ocr.running') : ocrAt ? t('docsIntel.ocr.rerun') : t('docsIntel.ocr.run')}
          </button>
        )}
      </div>
      {open && mrz && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] tracking-wide text-muted uppercase">
                <th className="py-1 pr-3 font-semibold" />
                <th className="py-1 pr-3 font-semibold">{t('docsIntel.ocr.extractedCol')}</th>
                <th className="py-1 pr-3 font-semibold">{t('docsIntel.ocr.profileCol')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-0.5 pr-3 text-muted">{t('docsIntel.ocr.fields.surname')} / {t('docsIntel.ocr.fields.givenNames')}</td>
                <td className="py-0.5 pr-3 font-mono font-medium" colSpan={2}>{mrz.surname} {mrz.givenNames}</td>
              </tr>
              {PROFILE_KEYS.map((k) => {
                const label = k === 'passportNumber' ? 'documentNumber' : k === 'passportExpiry' ? 'expiryDate' : k;
                const changed = diff.includes(k);
                return (
                  <tr key={k}>
                    <td className="py-0.5 pr-3 text-muted">{t(`docsIntel.ocr.fields.${label}`)}</td>
                    <td className={clsx('py-0.5 pr-3 font-mono font-medium', changed && 'text-brand-700')}>{extracted?.[k] ?? t('docsIntel.ocr.empty')}</td>
                    <td className="py-0.5 pr-3 font-mono text-ink/70">
                      {q.data?.profile[k] ?? t('docsIntel.ocr.empty')}
                      {changed && <span className="ml-1 text-[10px] text-amber-700">({t('docsIntel.ocr.differs')})</span>}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-0.5 pr-3 text-muted">{t('docsIntel.ocr.fields.sex')} / {t('docsIntel.ocr.fields.issuingCountry')}</td>
                <td className="py-0.5 pr-3 font-mono" colSpan={2}>{mrz.sex} · {mrz.issuingCountry}</td>
              </tr>
            </tbody>
          </table>
          {'applied' in (ocr ?? {}) && (ocr as { applied?: string[] }).applied?.length ? (
            <p className="mt-1 text-emerald-700">{t('docsIntel.ocr.autoFilled', { fields: (ocr as { applied?: string[] }).applied!.join(', ') })}</p>
          ) : null}
          {diff.length > 0 && (
            <button type="button" className="btn-primary btn-sm mt-2" onClick={() => setConfirm(true)} disabled={applying}>
              <UserCheck className="size-3.5" aria-hidden /> {t('docsIntel.ocr.apply')}
            </button>
          )}
          {mrz.valid && q.data && diff.length === 0 && <p className="mt-1 text-emerald-700">{t('docsIntel.ocr.matches')}</p>}
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={apply} loading={applying} tone="primary" title={t('docsIntel.ocr.applyTitle')} message={t('docsIntel.ocr.applyMsg')} confirmLabel={t('docsIntel.ocr.apply')} />
    </div>
  );
};
