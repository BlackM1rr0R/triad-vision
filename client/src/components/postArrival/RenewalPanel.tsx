import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowRight, CalendarClock, RefreshCcw } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesPostArrival } from '@/i18n/pagesPostArrival';
import { DefRow, Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { StatusBadge } from '@/components/portal/StatusBadge';

registerCopy(pagesPostArrival);

// GET /api/admin/renewals/cases/:id (server lib/renewals/service.ts caseCare)
interface CaseLink {
  id: string;
  number: string;
  status: CaseStatus;
}
interface Care {
  caseId: string;
  status: CaseStatus;
  final: boolean;
  visaValidTo: string | null;
  residenceTitleExpiresAt: string | null;
  renewalCaseCreatedAt: string | null;
  renewalDueAt: string | null;
  probationEndsAt: string | null;
  probationReminderAt: string | null;
  renewalOf: CaseLink | null;
  renewals: (CaseLink & { createdAt: string })[];
  settings: { residenceLeadDays: number; probationLeadDays: number };
}

const careKey = (caseId: string) => ['case-care', caseId] as const;

/**
 * Admin case page (Ümumi): residence title expiry (staff enter it after arrival), when the renewal case opens,
 * the links between a case and its renewal, and the probation end from the employment contract.
 */
export const RenewalPanel = ({ caseId, status }: { caseId: string; status: CaseStatus }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: careKey(caseId), queryFn: async () => (await api.get<{ care: Care }>(`/admin/renewals/cases/${caseId}`)).data.care });
  const [value, setValue] = useState('');
  useEffect(() => setValue(q.data?.residenceTitleExpiresAt?.slice(0, 10) ?? ''), [q.data?.residenceTitleExpiresAt]);
  const save = useMutation({
    mutationFn: async (v: string | null) => (await api.patch<{ care: Care }>(`/admin/renewals/cases/${caseId}`, { residenceTitleExpiresAt: v })).data.care,
    onSuccess: (care) => (qc.setQueryData(careKey(caseId), care), toast.success(t('postArrival.renewal.saved'))),
    onError: (e) => toastError(e),
  });
  const open = useMutation({
    mutationFn: async () => (await api.post<{ renewal: { id: string; number: string }; care: Care }>(`/admin/renewals/cases/${caseId}/open`)).data,
    onSuccess: (d) => {
      qc.setQueryData(careKey(caseId), d.care);
      void qc.invalidateQueries({ queryKey: ['admin-cases'] });
      toast.success(t('postArrival.renewal.opened', { number: d.renewal.number }));
    },
    onError: (e) => toastError(e),
  });

  const c = q.data;
  if (!c) return null;
  // Only after the visa, or when there is something to show.
  const relevant = status === 'APPROVED' || !!c.residenceTitleExpiresAt || !!c.renewalOf || c.renewals.length > 0 || !!c.probationEndsAt;
  if (!relevant) return null;

  return (
    <Panel title={t('postArrival.renewal.title')} icon={CalendarClock} id="case-renewal" bodyClassName="p-4 sm:p-5 space-y-4">
      {c.renewalOf && (
        <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs text-link">
          <RefreshCcw className="mr-1 inline size-3.5" aria-hidden />
          <Link to={`/admin/cases/${c.renewalOf.id}`} className="font-semibold hover:underline">
            {t('postArrival.renewal.renewalOf', { number: c.renewalOf.number })}
          </Link>
        </p>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) save.mutate(value);
        }}
      >
        <label className="block min-w-0 flex-1">
          <span className="label">{t('postArrival.renewal.residence')}</span>
          <input type="date" className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending || !value || value === c.residenceTitleExpiresAt?.slice(0, 10)}>
            {t('postArrival.renewal.save')}
          </button>
          {c.residenceTitleExpiresAt && (
            <button type="button" className="btn-secondary btn-sm" disabled={save.isPending} onClick={() => save.mutate(null)}>
              {t('postArrival.renewal.clear')}
            </button>
          )}
        </div>
      </form>
      <p className="text-[11px] text-muted">{t('postArrival.renewal.residenceHint', { days: c.settings.residenceLeadDays })}</p>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {c.visaValidTo && <DefRow label={t('postArrival.renewal.visaValidTo')}>{fmtDate(c.visaValidTo)}</DefRow>}
        <DefRow label={t('postArrival.renewal.probation')}>{c.probationEndsAt ? fmtDate(c.probationEndsAt) : '—'}</DefRow>
      </dl>
      {c.probationEndsAt ? (
        <p className="text-[11px] text-muted">
          {c.probationReminderAt ? t('postArrival.renewal.probationReminded', { date: fmtDate(c.probationReminderAt) }) : t('postArrival.renewal.probationHint', { days: c.settings.probationLeadDays })}
        </p>
      ) : (
        <p className="text-[11px] text-muted">{t('postArrival.renewal.probationNone')}</p>
      )}
      {c.renewalDueAt && <p className="text-xs text-ink/80">{t('postArrival.renewal.dueAt', { date: fmtDate(c.renewalDueAt) })}</p>}
      {c.renewalCaseCreatedAt && <p className="text-xs text-ink/80">{t('postArrival.renewal.createdAt', { date: fmtDate(c.renewalCaseCreatedAt) })}</p>}
      {c.renewals.length > 0 && (
        <ul className="space-y-1.5">
          {c.renewals.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-muted">{t('postArrival.renewal.renewals')}:</span>
              <Link to={`/admin/cases/${r.id}`} className="inline-flex items-center gap-1 code-id text-xs font-medium text-link hover:underline whitespace-nowrap">
                {r.number} <ArrowRight className="size-3" aria-hidden />
              </Link>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      )}
      {c.residenceTitleExpiresAt && !c.renewalCaseCreatedAt && (
        <button type="button" className="btn-secondary btn-sm" disabled={open.isPending} onClick={() => open.mutate()}>
          <RefreshCcw className="size-3.5" aria-hidden /> {t('postArrival.renewal.openNow')}
        </button>
      )}
    </Panel>
  );
};

export default RenewalPanel;
