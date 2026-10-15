import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { errorCode } from '@/lib/errors';
import { ocrOutcome, ocrUnavailable } from '@/lib/ocr';
import { useErrorMessage } from '@/lib/queries';
import type { OcrResponse, PassportProfile } from '@/types';

export type OcrPhase = 'running' | 'done' | 'failed' | 'applied';

export interface OcrState {
  docId: string;
  requirementId: string;
  phase: OcrPhase;
  result: OcrResponse | null;
}

/** The server runs Tesseract synchronously with a 30 s guard — give it room before polling. */
const RUN_TIMEOUT_MS = 45_000;
const POLL_EVERY_MS = 2000;
const POLL_MAX = 15;

const statusOf = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

/**
 * Passport OCR after an upload to the PASSPORT requirement: POST /documents/:id/ocr, then (if the
 * call timed out) GET until the record exists. When the API answers 404/501/503 the feature is hidden
 * without a word — the deployment simply has no OCR.
 */
export const useOcr = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const message = useErrorMessage();
  const qc = useQueryClient();
  const [state, setState] = useState<OcrState | null>(null);
  const [applying, setApplying] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const finish = useCallback((docId: string, requirementId: string, result: OcrResponse) => {
    if (!alive.current) return;
    setState((s) => (s && s.docId !== docId ? s : { docId, requirementId, phase: ocrOutcome(result.ocr) === 'done' ? 'done' : 'failed', result }));
  }, []);

  const start = useCallback(
    async (docId: string, requirementId: string) => {
      setState({ docId, requirementId, phase: 'running', result: null });
      try {
        const { data } = await api.post<OcrResponse>(`/documents/${docId}/ocr`, undefined, { timeout: RUN_TIMEOUT_MS });
        finish(docId, requirementId, data);
        return;
      } catch (err) {
        const code = errorCode(err);
        if (ocrUnavailable(statusOf(err), code)) {
          if (alive.current) setState(null);
          return;
        }
        if (code !== 'TIMEOUT' && code !== 'NETWORK') {
          if (alive.current) setState((s) => (s && s.docId === docId ? { ...s, phase: 'failed' } : s));
          return;
        }
      }
      // The run is still going on the server: poll the stored record.
      for (let i = 0; i < POLL_MAX && alive.current; i++) {
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
        try {
          const { data } = await api.get<OcrResponse>(`/documents/${docId}/ocr`);
          if (data.ocr) {
            finish(docId, requirementId, data);
            return;
          }
        } catch (err) {
          if (ocrUnavailable(statusOf(err), errorCode(err))) {
            if (alive.current) setState(null);
            return;
          }
        }
      }
      if (alive.current) setState((s) => (s && s.docId === docId ? { ...s, phase: 'failed' } : s));
    },
    [finish],
  );

  const apply = useCallback(async () => {
    if (!state || state.phase !== 'done') return;
    setApplying(true);
    try {
      const { data } = await api.post<{ profile: PassportProfile }>(`/documents/${state.docId}/ocr/apply`);
      setState((s) => (s ? { ...s, phase: 'applied', result: s.result ? { ...s.result, profile: data.profile } : s.result } : s));
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast(t('m.ocr.applied'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setApplying(false);
    }
  }, [message, qc, state, t, toast]);

  const dismiss = useCallback(() => setState(null), []);

  return { ocr: state, applying, start, apply, dismiss };
};
