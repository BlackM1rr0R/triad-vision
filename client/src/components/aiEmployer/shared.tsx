import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiEmployer } from '@/i18n/pagesAiEmployer';

registerCopy(pagesAiEmployer);

/** Shared pieces of the employer AI tools: availability, error texts, loading skeleton. */

export type AiMode = 'staff' | 'company';
export const aiBase = (mode: AiMode) => (mode === 'staff' ? '/admin/ai/employer' : '/company/ai');

const REASONS = ['NO_API_KEY', 'DISABLED', 'MONTHLY_BUDGET', 'DAILY_COST', 'DAILY_MESSAGES', 'KEY_CREDIT', 'TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT'];

export const reasonText = (t: TFunction, reason: string | null | undefined) => t(`aiEmployer.reasons.${reason && REASONS.includes(reason) ? reason : 'generic'}`);

/** Text for a failed AI request: the server's limit message, else the reason, else a generic text. */
export const aiErrorText = (t: TFunction, err: unknown) => {
  if (err instanceof AxiosError) {
    const d = err.response?.data as { error?: string; reason?: string; message?: string } | undefined;
    if (d?.reason) return reasonText(t, d.reason);
    if (d?.error === 'AI_DISABLED') return reasonText(t, 'DISABLED');
    if (d?.message && err.response?.status === 429) return d.message;
  }
  return reasonText(t, null);
};

export interface AiStatus {
  available: boolean;
  reason?: string;
  companyEnabled?: boolean;
}

/** Whether the AI buttons can work right now (no model call). */
export const useAiStatus = (mode: AiMode) =>
  useQuery({
    queryKey: ['ai-employer-status', mode],
    queryFn: async () => (await api.get<AiStatus>(`${aiBase(mode)}/status`)).data,
    staleTime: 60_000,
  });

/** Audit entry after a vacancy form with AI text was saved (fire and forget). */
export const reportAiSaved = (mode: AiMode, vacancyId: string, features: string[]) => {
  if (features.length) void api.post(`${aiBase(mode)}/vacancies/${vacancyId}/ai-saved`, { features }).catch(() => undefined);
};

export const costText = (t: TFunction, usd: number | null | undefined) => (usd && usd > 0 ? t('aiEmployer.common.cost', { usd: usd < 0.01 ? usd.toFixed(4) : usd.toFixed(3) }) : null);

/** Skeleton shown while the model works. */
export const AiWorking = ({ lines = 4 }: { lines?: number }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-2.5" role="status" aria-live="polite">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
        <Sparkles className="size-3.5 animate-pulse" aria-hidden /> {t('aiEmployer.common.working')}
      </p>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-3 animate-pulse rounded bg-surface" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
};

/** One line under a disabled AI button explaining why. */
export const UnavailableNote = ({ status }: { status: AiStatus | undefined }) => {
  const { t } = useTranslation();
  if (!status || status.available) return null;
  return <p className="text-[11px] text-amber-800">{t('aiEmployer.common.unavailable', { reason: reasonText(t, status.reason) })}</p>;
};
