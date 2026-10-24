import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Eye, FileBarChart2, RefreshCw, Send } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesEmployerWorkers } from '@/i18n/pagesEmployerWorkers';
import { Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { monthLabel } from '@/components/company/CompanyReports';

registerCopy(pagesEmployerWorkers);

interface Row {
  id: string;
  month: string;
  lang: 'de' | 'en';
  createdAt: string;
  sentAt: string | null;
  hasFile: boolean;
  totals: { workers: number; working: number; inProcess: number; atRisk: number; openItems: number } | null;
}

/** Admin → Companies drawer: monthly employer report (preview, generate / regenerate, send, past reports). */
export const EmployerReportsPanel = ({ companyId }: { companyId: string }) => {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['admin-employer-reports', companyId];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ items: Row[]; recipients: string[]; defaultMonth: string }>('/admin/employer-reports', { params: { companyId } })).data,
  });
  const [month, setMonth] = useState('');
  const [lang, setLang] = useState<'' | 'de' | 'en'>('');
  useEffect(() => {
    if (q.data && !month) setMonth(q.data.defaultMonth);
  }, [q.data, month]);
  const onError = (err: unknown) => toast.error(t(`employerReports.admin.${errorCode(err)}`, { defaultValue: t('admin.common.error', { defaultValue: errorCode(err) }) }));

  const generate = useMutation({
    mutationFn: () => api.post('/admin/employer-reports/generate', { companyId, month, ...(lang ? { lang } : {}) }),
    onSuccess: () => {
      toast.success(t('employerReports.admin.generated'));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError,
  });
  const send = useMutation({
    mutationFn: async (id: string) => (await api.post<{ recipients: number }>(`/admin/employer-reports/${id}/send`)).data,
    onSuccess: (d) => {
      toast.success(t('employerReports.admin.sentOk', { count: d.recipients }));
      void qc.invalidateQueries({ queryKey: key });
    },
    onError,
  });

  const previewUrl = `/api/admin/employer-reports/preview.pdf?companyId=${encodeURIComponent(companyId)}&month=${month}${lang ? `&lang=${lang}` : ''}`;
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

  return (
    <Panel title={t('employerReports.admin.title')} icon={FileBarChart2}>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor={`er-month-${companyId}`}>
            {t('employerReports.admin.month')}
          </label>
          <input id={`er-month-${companyId}`} type="month" className="input py-2 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`er-lang-${companyId}`}>
            {t('employerReports.admin.lang')}
          </label>
          <select id={`er-lang-${companyId}`} className="input py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value as '' | 'de' | 'en')}>
            <option value="">{t('employerReports.admin.langAuto')}</option>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <a href={validMonth ? previewUrl : undefined} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm" aria-disabled={!validMonth}>
          <Eye className="size-3.5" aria-hidden /> {t('employerReports.admin.preview')}
        </a>
        <button type="button" className="btn-primary btn-sm" disabled={!validMonth || generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />} {t('employerReports.admin.generate')}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">{t('employerReports.admin.hint')}</p>
      <p className="mt-1 text-xs text-muted">
        <span className="font-semibold">{t('employerReports.admin.recipients')}:</span> {q.data?.recipients.length ? q.data.recipients.join(', ') : t('employerReports.admin.noRecipients')}
      </p>

      {!q.data?.items.length ? (
        <p className="mt-4 text-sm text-muted">{t('employerReports.admin.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {q.data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="min-w-0">
                <a href={`/api/admin/employer-reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 capitalize hover:underline">
                  {monthLabel(r.month, i18n.language)} · {r.lang.toUpperCase()}
                </a>
                <span className="block text-xs text-muted">{r.sentAt ? t('employerReports.admin.sent', { date: fmtDate(r.sentAt) }) : t('employerReports.admin.notSent')}</span>
              </span>
              <button type="button" className="btn-secondary btn-sm" disabled={send.isPending || !r.hasFile || !q.data?.recipients.length} onClick={() => send.mutate(r.id)}>
                <Send className="size-3.5" aria-hidden /> {r.sentAt ? t('employerReports.admin.resend') : t('employerReports.admin.send')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};
