import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, FileWarning, MessageCircle, RefreshCw, Sparkles, Flag } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/admin/ui';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { aiReasonText, uiLocale } from './shared';

type LineKey = 'status' | 'missing' | 'contact' | 'risks' | 'next';
interface SummaryResponse {
  summary: { lines: Record<LineKey, string>; generatedAt: string; model: string } | null;
  fresh: boolean;
  generated: boolean;
  reason?: string;
}

const LINES: { key: LineKey; icon: typeof Flag }[] = [
  { key: 'status', icon: Flag },
  { key: 'missing', icon: FileWarning },
  { key: 'contact', icon: MessageCircle },
  { key: 'risks', icon: AlertTriangle },
  { key: 'next', icon: ArrowRight },
];

/** "AI xülasə" card at the top of the admin case page: cached summary on load, generated on demand. */
export const CaseAiSummary = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const locale = uiLocale();
  const key = ['ai-staff', 'summary', caseId, locale];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<SummaryResponse>(`/admin/ai-staff/cases/${caseId}/summary`, { params: { locale } })).data,
    staleTime: 60_000,
  });
  const [busy, setBusy] = useState(false);

  const run = async (refresh: boolean) => {
    setBusy(true);
    try {
      const res = (await api.post<SummaryResponse>(`/admin/ai-staff/cases/${caseId}/summary`, { locale, refresh })).data;
      qc.setQueryData(key, res);
      if (res.reason) toast.error(aiReasonText(t, res.reason));
    } catch (err) {
      toastError(err, t('aiStaff.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const s = data?.summary;
  return (
    <Panel
      title={t('aiStaff.summary.title')}
      icon={Sparkles}
      className="bg-card"
      actions={
        s ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => void run(true)} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />} {t('aiStaff.summary.refresh')}
          </button>
        ) : null
      }
    >
      {!s ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted">{t('aiStaff.summary.empty')}</p>
          <button type="button" className="btn-primary btn-sm" onClick={() => void run(false)} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {t('aiStaff.summary.generate')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!data?.fresh && (
            <p className="flex items-center gap-1.5 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-fg">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {t('aiStaff.summary.stale')}
            </p>
          )}
          <ul className="space-y-2">
            {LINES.map(({ key: k, icon: I }) => (
              <li key={k} className="flex gap-2.5 text-sm">
                <I className="mt-0.5 size-4 shrink-0 text-link" aria-hidden />
                <p className="min-w-0 text-ink">
                  <span className="font-semibold text-ink">{t(`aiStaff.summary.lines.${k}`)}: </span>
                  {s.lines[k]}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted">{t('aiStaff.summary.generatedAt', { date: fmtDateTime(s.generatedAt) })}</p>
        </div>
      )}
    </Panel>
  );
};
