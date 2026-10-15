import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { qk } from './queryClient';
import { realtime, str, useRealtime, type RealtimePayload } from './realtime';
import type { CaseDetail, CaseMessage } from '@/types';

const isMessage = (v: unknown): v is CaseMessage => {
  const m = v as Partial<CaseMessage> | null;
  return !!m && typeof m === 'object' && typeof m.id === 'string' && typeof m.body === 'string' && typeof m.createdAt === 'string' && !!m.author && typeof m.author === 'object';
};

const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * Binds the realtime stream to the session and keeps the TanStack cache in step with the events:
 * new messages are appended to the open case, read receipts flip `readAt`, notifications and case
 * changes are refetched. Renders nothing; mounted once in the root layout.
 */
export const RealtimeBridge = () => {
  const { status, user } = useAuth();
  const qc = useQueryClient();
  const userId = status === 'authed' ? (user?.id ?? null) : null;

  useEffect(() => {
    realtime.setUser(userId);
  }, [userId]);

  const patchCase = (caseId: string, fn: (c: CaseDetail) => CaseDetail) => {
    qc.setQueryData<CaseDetail>(qk.case(caseId), (old) => (old ? fn(old) : old));
    qc.setQueryData<CaseDetail>(qk.adminCase(caseId), (old) => (old ? fn(old) : old));
  };

  useRealtime('message.new', (p: RealtimePayload) => {
    const caseId = str(p.caseId);
    if (!caseId) return;
    const message = p.message;
    if (isMessage(message)) {
      patchCase(caseId, (c) => (c.messages.some((m) => m.id === message.id) ? c : { ...c, messages: [...c.messages, message] }));
    }
    void qc.invalidateQueries({ queryKey: qk.case(caseId) });
    void qc.invalidateQueries({ queryKey: qk.adminCase(caseId) });
    void qc.invalidateQueries({ queryKey: qk.notifications });
  });

  useRealtime('message.read', (p) => {
    const caseId = str(p.caseId);
    const readAt = str(p.readAt);
    const ids = stringList(p.messageIds);
    if (!caseId || !readAt || ids.length === 0) return;
    patchCase(caseId, (c) => ({ ...c, messages: c.messages.map((m) => (ids.includes(m.id) && !m.readAt ? { ...m, readAt } : m)) }));
  });

  useRealtime('notification', () => {
    void qc.invalidateQueries({ queryKey: qk.notifications });
  });

  useRealtime('case.updated', (p) => {
    const caseId = str(p.caseId);
    if (caseId) {
      void qc.invalidateQueries({ queryKey: qk.case(caseId) });
      void qc.invalidateQueries({ queryKey: qk.adminCase(caseId) });
    }
    void qc.invalidateQueries({ queryKey: qk.myCases });
    void qc.invalidateQueries({ queryKey: ['admin'] });
  });

  return null;
};
