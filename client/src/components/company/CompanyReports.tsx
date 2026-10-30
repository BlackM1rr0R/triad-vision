import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FileBarChart2, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesEmployerWorkers } from '@/i18n/pagesEmployerWorkers';
import { fmtDate } from '@/components/admin/labels';
import { Switch } from '@/components/admin/ui';
import { toastJobsError } from '@/components/jobs/labels';
import { Documents } from '@/components/illustrations';
import { Empty, Section } from './shared';

registerCopy(pagesEmployerWorkers);

interface ReportRow {
  id: string;
  month: string;
  lang: 'de' | 'en';
  createdAt: string;
  sentAt: string | null;
  hasFile: boolean;
  totals: { workers: number; working: number; inProcess: number; atRisk: number; openItems: number } | null;
}

/** "September 2026" in the interface language. */
export const monthLabel = (month: string, locale: string) => {
  const [y, m] = month.split('-').map(Number);
  const tag = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[locale.slice(0, 2)] ?? 'de-DE';
  return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)));
};

/** Past monthly reports of the company (download as PDF). */
export const CompanyReports = () => {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['company-reports'],
    queryFn: async () => (await api.get<{ items: ReportRow[] }>('/company/reports')).data.items,
  });
  return (
    <Section title={t('employerReports.title')} icon={FileBarChart2}>
      <p className="-mt-2 mb-5 text-sm text-muted">{t('employerReports.subtitle')}</p>
      {isLoading ? (
        <Spinner className="mx-auto size-6 text-primary" />
      ) : isError ? (
        <ErrorState compact onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <Empty icon={FileBarChart2} illustration={<Documents className="w-32" />} title={t('employerReports.empty')} />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold text-ink capitalize">{monthLabel(r.month, i18n.language)}</span>
                <span className="text-xs text-muted">
                  {r.totals ? t('employerReports.summary', { working: r.totals.working, inProcess: r.totals.inProcess, open: r.totals.openItems }) : ''}
                  {' · '}
                  {r.sentAt ? t('employerReports.sentAt', { date: fmtDate(r.sentAt) }) : t('employerReports.notSent')}
                </span>
              </span>
              {r.hasFile && (
                <a href={`/api/company/reports/${r.id}/pdf`} className="btn-ghost btn-sm" download>
                  <Download className="size-4" aria-hidden /> {t('employerReports.download')} ({r.lang.toUpperCase()})
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
};

/** Company profile: the signed-in user's switch for the monthly report e-mail. */
export const EmployerReportPrefs = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['company-report-prefs'],
    queryFn: async () => (await api.get<{ monthlyEmail: boolean }>('/company/reports/preferences')).data,
  });
  const save = useMutation({
    mutationFn: async (monthlyEmail: boolean) => (await api.put<{ monthlyEmail: boolean }>('/company/reports/preferences', { monthlyEmail })).data,
    onSuccess: (d) => {
      qc.setQueryData(['company-report-prefs'], d);
      toast.success(t('employerReports.saved'));
    },
    onError: toastJobsError,
  });
  return (
    <Section title={t('employerReports.prefsTitle')} icon={MailCheck}>
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted">{t('employerReports.prefsText')}</p>
        <Switch checked={data?.monthlyEmail ?? true} disabled={!data || save.isPending} onChange={(v) => save.mutate(v)} label={t('employerReports.prefsLabel')} />
      </div>
    </Section>
  );
};
