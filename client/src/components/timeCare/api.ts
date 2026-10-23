import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { TFunction } from 'i18next';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';

registerCopy(pagesTimeCare);

/** Shapes of /api/admin/time (server/src/lib/timeTracking). */

export const ACTIVITIES = ['DOCUMENTS', 'CLIENT_COMMUNICATION', 'EMPLOYER_COMMUNICATION', 'TRANSLATION', 'EMBASSY', 'OTHER'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface TimeEntry {
  id: string;
  userId: string;
  userName: string | null;
  caseId: string | null;
  caseNumber: string | null;
  clientName: string | null;
  taskId: string | null;
  task?: { key: string; title: string } | null;
  activity: Activity;
  note: string | null;
  source: 'TIMER' | 'MANUAL';
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  running: boolean;
  autoStopped: boolean;
  day: string;
}

export interface CurrentTimer {
  running: (TimeEntry & { idleWarning: boolean; autoStopAt: string }) | null;
  autoStopped: TimeEntry | null;
}

export const timerKey = ['time', 'current'] as const;

/** The signed-in staff member's running timer (shared by the header widget and every start button). */
export const useCurrentTimer = (enabled = true) =>
  useQuery({
    queryKey: timerKey,
    queryFn: async () => (await api.get<CurrentTimer>('/admin/time/current')).data,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

export const fmtDuration = (t: TFunction, minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t('time.dur', { h, m }) : t('time.durMin', { m });
};

export const timeError = (t: TFunction, err: unknown) => toast.error(t(`time.errors.${errorCode(err)}`, { defaultValue: t('time.errors.generic') }));

/** Invalidates everything that shows time (header, case card, lists, reports, profitability). */
export const useInvalidateTime = () => {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['time'] });
    void qc.invalidateQueries({ queryKey: ['case-profit'] });
  };
};

export const useStartTimer = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: async (body: { caseId?: string | null; taskId?: string | null; activity?: Activity; note?: string | null }) =>
      (await api.post<{ entry: TimeEntry; stopped: TimeEntry | null }>('/admin/time/start', body)).data,
    onSuccess: (d) => {
      toast.success(d.stopped ? t('time.switchedToast', { dur: fmtDuration(t, d.stopped.minutes) }) : t('time.startedToast'));
      invalidate();
    },
    onError: (e) => timeError(t, e),
  });
};

export const useStopTimer = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateTime();
  return useMutation({
    mutationFn: async (body: { note?: string | null; activity?: Activity } = {}) => (await api.post<{ entry: TimeEntry }>('/admin/time/stop', body)).data,
    onSuccess: (d) => {
      toast.success(t('time.stoppedToast', { dur: fmtDuration(t, d.entry.minutes) }));
      invalidate();
    },
    onError: (e) => timeError(t, e),
  });
};
