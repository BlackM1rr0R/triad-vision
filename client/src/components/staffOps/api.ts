import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Role } from '@/lib/types';

/** Shapes and hooks of /api/admin/staff-ops (digest preference, backup check) and /api/admin/kpi/performance. */

export interface DigestState {
  enabled: boolean;
  emailNotifications: boolean;
}
export const DIGEST_KEY = ['staff-ops', 'digest'];
export const useDigest = () => useQuery({ queryKey: DIGEST_KEY, queryFn: async () => (await api.get<DigestState>('/admin/staff-ops/digest')).data });

export interface BackupCheck {
  status: 'ok' | 'failed';
  checkedAt: string;
  backupFile?: string | null;
  backupAt?: string | null;
  tables?: number | null;
  counts?: Record<string, { restored: number; live?: number | null }>;
  durationSec?: number | null;
  error?: string | null;
  host?: string | null;
}
export interface BackupCheckStatus {
  check: BackupCheck | null;
  stale: boolean;
  staleDays: number;
  configured: boolean;
}
export const useBackupCheck = (enabled = true) =>
  useQuery({ queryKey: ['staff-ops', 'backup-check'], queryFn: async () => (await api.get<BackupCheckStatus>('/admin/staff-ops/backup-check')).data, enabled, staleTime: 60_000 });

export interface PerformanceRow {
  staff: { id: string; name: string; role: Role; isActive: boolean };
  casesClosed: number;
  approved: number;
  rejected: number;
  casesAssigned: number;
  tasksDone: number;
  tasksMissed: number;
  openOverdueTasks: number;
  overdueCases: number;
  avgMessageReplyHours: number | null;
  messageReplies: number;
  avgInquiryResponseHours: number | null;
  inquiryResponses: number;
  csat: number | null;
  nps: number | null;
  surveys: number;
  reviewAvg: number | null;
  reviews: number;
  docsReviewed: number;
  hours: number;
}
export type PerformanceKey = Exclude<keyof PerformanceRow, 'staff'>;
export interface StaffPerformance {
  from: string;
  to: string;
  generatedAt: string;
  rows: PerformanceRow[];
  team: { size: number; total: Record<PerformanceKey, number | null> };
}

export const useStaffPerformance = (from: string, to: string) =>
  useQuery({
    queryKey: ['kpi', 'performance', from, to],
    queryFn: async () => (await api.get<StaffPerformance>('/admin/kpi/performance', { params: { from, to } })).data,
    staleTime: 60_000,
    retry: false,
  });
