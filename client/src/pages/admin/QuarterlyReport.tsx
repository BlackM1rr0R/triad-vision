import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Download, ExternalLink, Globe, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesQuarterlyReport } from '@/i18n/pagesQuarterlyReport';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';

registerCopy(pagesQuarterlyReport);

const LANGS = ['az', 'en', 'de'] as const;
type Lang = (typeof LANGS)[number];
const DIMS = ['profession', 'visaType', 'state', 'germanLevel'] as const;
type Dim = (typeof DIMS)[number];
const STAGES = ['documents', 'contract', 'embassy', 'decision', 'total'] as const;

interface Bucket {
  key: string;
  count: number;
}
interface Breakdown {
  buckets: Bucket[];
  suppressed: boolean;
}
interface StageStat {
  mean: number;
  median: number;
  n: number;
}
interface Stats {
  year: number;
  quarter: number;
  generatedAt: string;
  approved: number | null;
  previous: { year: number; quarter: number; approved: number | null };
  trend: { delta: number; percent: number | null } | null;
  breakdowns: Record<Dim, Breakdown>;
  previousBreakdowns: Record<Dim, Breakdown>;
  stages: Partial<Record<(typeof STAGES)[number], StageStat>>;
}
interface ReportInfo {
  year: number;
  quarter: number;
  published: boolean;
  publishedAt: string | null;
  intro: Partial<Record<Lang, string>>;
  approved: number | null;
}
interface Preview {
  stats: Stats;
  labels: Record<string, Record<string, string>>;
  stageLabels: Record<string, string>;
  title: string;
  defaultIntro: Record<Lang, string>;
  report: ReportInfo;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const Bars = ({ title, data, prev, labels, suppressedText }: { title: string; data: Breakdown; prev: Breakdown; labels: Record<string, string>; suppressedText: string }) => {
  const prevBy = new Map(prev.buckets.map((b) => [b.key, b.count]));
  const max = Math.max(1, ...data.buckets.map((b) => b.count), ...prev.buckets.map((b) => b.count));
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold text-ink">{title}</h3>
      {data.buckets.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {data.buckets.map((b) => (
            <li key={b.key}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-ink">{labels[b.key] ?? b.key}</span>
                <span className="font-semibold tabular-nums text-ink">
                  {b.count}
                  {prevBy.has(b.key) && <span className="ml-1 text-xs font-normal text-muted">({prevBy.get(b.key)})</span>}
                </span>
              </div>
              <div className="mt-1 h-2 rounded bg-sunken" aria-hidden>
                <div className={clsx('h-2 rounded', b.key === 'other' ? 'bg-warning-fg' : 'bg-primary')} style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.suppressed && <p className="mt-2 text-xs text-muted">{suppressedText}</p>}
    </section>
  );
};

/**
 * /admin/quarterly-report — the quarterly "Azerbaijan → Germany labour mobility" report (server: lib/quarterlyReport):
 * quarter picker, k-anonymous preview (only buckets ≥ 3), intro per report language, PDF downloads and publishing to
 * /reports. STAFF read and download, ADMIN+ edit and publish.
 */
export default function AdminQuarterlyReport() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('qreport.title'));
  const { user } = useAuth();
  const canEdit = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const lng: Lang = (LANGS as readonly string[]).includes(ui) ? (ui as Lang) : 'en';
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['admin-quarterly-reports'],
    queryFn: async () => (await api.get<{ reports: ReportInfo[]; defaultQuarter: { year: number; quarter: number } }>('/admin/quarterly-report')).data,
  });
  const [sel, setSel] = useState<{ year: number; quarter: number } | null>(null);
  useEffect(() => {
    if (!sel && list.data) setSel(list.data.defaultQuarter);
  }, [sel, list.data]);

  const preview = useQuery({
    queryKey: ['admin-quarterly-report', sel?.year, sel?.quarter, lng],
    enabled: !!sel,
    queryFn: async () => (await api.get<Preview>(`/admin/quarterly-report/${sel!.year}/${sel!.quarter}?lng=${lng}`)).data,
  });

  const [intro, setIntro] = useState<Record<Lang, string>>({ az: '', en: '', de: '' });
  useEffect(() => {
    const r = preview.data?.report;
    if (r) setIntro({ az: r.intro.az ?? '', en: r.intro.en ?? '', de: r.intro.de ?? '' });
  }, [preview.data?.report]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-quarterly-report'] });
    void qc.invalidateQueries({ queryKey: ['admin-quarterly-reports'] });
  };
  const saveIntro = useMutation({
    mutationFn: () => api.put(`/admin/quarterly-report/${sel!.year}/${sel!.quarter}/intro`, { intro }),
    onSuccess: () => {
      toast.success(t('qreport.saved'));
      invalidate();
    },
    onError: () => toast.error(t('qreport.error')),
  });
  const publish = useMutation({
    mutationFn: (published: boolean) => api.post(`/admin/quarterly-report/${sel!.year}/${sel!.quarter}/publish`, { published }),
    onSuccess: invalidate,
    onError: () => toast.error(t('qreport.error')),
  });

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => thisYear - i);
  const d = preview.data;
  const s = d?.stats;
  const count = (n: number | null) => (n === null ? t('qreport.fewer') : String(n));

  return (
    <div>
      <PageHeader
        title={t('qreport.title')}
        subtitle={t('qreport.subtitle')}
        actions={
          <a href="/reports" target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            <ExternalLink className="size-4" aria-hidden /> {t('qreport.publicPage')}
          </a>
        }
      />
      {!canEdit && <p className="mb-4 text-sm text-muted">{t('qreport.readOnly')}</p>}

      <div className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="label">{t('qreport.year')}</span>
          <select className="input" value={sel?.year ?? ''} onChange={(e) => setSel({ year: Number(e.target.value), quarter: sel?.quarter ?? 1 })}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="label">{t('qreport.quarter')}</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                type="button"
                aria-pressed={sel?.quarter === q}
                className={clsx('btn-sm min-h-11 min-w-11', sel?.quarter === q ? 'btn-primary' : 'btn-secondary')}
                onClick={() => setSel({ year: sel?.year ?? thisYear, quarter: q })}
              >
                Q{q}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2 sm:ms-auto">
          {sel &&
            LANGS.map((l) => (
              <a key={l} className="btn-secondary btn-sm" href={`/api/admin/quarterly-report/${sel.year}/${sel.quarter}/pdf?lng=${l}`}>
                <Download className="size-4" aria-hidden /> {t('qreport.download')} · {l.toUpperCase()}
              </a>
            ))}
        </div>
      </div>

      {preview.isLoading || list.isLoading || !sel ? (
        <Spinner />
      ) : preview.isError || !d || !s ? (
        <ErrorState onRetry={() => void preview.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">{d.title}</h2>
              <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', d.report.published ? 'bg-success-bg text-success-fg' : 'bg-sunken text-muted')}>
                {d.report.published ? <Globe className="size-3.5" aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
                {d.report.published ? t('qreport.published') : t('qreport.draft')}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {d.report.published ? t('qreport.snapshot') : t('qreport.live')}
              {d.report.publishedAt && ` · ${t('qreport.publishedAt', { date: fmtDate(d.report.publishedAt) })}`}
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-xs text-muted">{t('qreport.approved')}</dt>
                <dd className="text-2xl font-bold text-ink">{count(s.approved)}</dd>
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-xs text-muted">
                  {t('qreport.previous')} (Q{s.previous.quarter} {s.previous.year})
                </dt>
                <dd className="text-2xl font-bold text-ink">{count(s.previous.approved)}</dd>
              </div>
              <div className="rounded-xl bg-sunken p-3">
                <dt className="text-xs text-muted">{t('qreport.change')}</dt>
                <dd className="text-2xl font-bold text-ink">
                  {s.trend ? `${s.trend.delta > 0 ? '+' : ''}${s.trend.delta}${s.trend.percent !== null ? ` (${s.trend.percent > 0 ? '+' : ''}${s.trend.percent} %)` : ''}` : <span className="text-base text-muted">{t('qreport.noTrend')}</span>}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">{t('qreport.privacy')}</p>
          </div>

          {s.approved === null ? (
            <p className="card p-4 text-sm text-muted">{t('qreport.empty')}</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {DIMS.map((dim) => (
                  <Bars key={dim} title={t(`qreport.dims.${dim}`)} data={s.breakdowns[dim]} prev={s.previousBreakdowns[dim]} labels={d.labels[dim] ?? {}} suppressedText={t('qreport.suppressed')} />
                ))}
              </div>
              <section className="card overflow-x-auto p-4">
                <h3 className="mb-3 font-semibold text-ink">{t('qreport.stages')}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-1 pr-2 font-semibold">{t('qreport.stage')}</th>
                      <th className="py-1 pr-2 font-semibold">{t('qreport.mean')}</th>
                      <th className="py-1 pr-2 font-semibold">{t('qreport.median')}</th>
                      <th className="py-1 font-semibold">{t('qreport.cases')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STAGES.filter((st) => s.stages[st]).map((st) => (
                      <tr key={st} className="border-t border-line">
                        <td className="py-1.5 pr-2 text-ink">{d.stageLabels[st] ?? st}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{s.stages[st]!.mean}</td>
                        <td className="py-1.5 pr-2 font-semibold tabular-nums">{s.stages[st]!.median}</td>
                        <td className="py-1.5 tabular-nums">{s.stages[st]!.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}

          <section className="card p-4">
            <h3 className="font-semibold text-ink">{t('qreport.intro')}</h3>
            <p className="mb-3 text-xs text-muted">{t('qreport.introHint')}</p>
            <div className="grid gap-3 lg:grid-cols-3">
              {LANGS.map((l) => (
                <label key={l} className="block">
                  <span className="label">{t(`qreport.langs.${l}`)}</span>
                  <textarea
                    className="input min-h-40"
                    value={intro[l]}
                    placeholder={d.defaultIntro[l]}
                    readOnly={!canEdit}
                    maxLength={6000}
                    onChange={(e) => setIntro((x) => ({ ...x, [l]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            {canEdit && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={saveIntro.isPending} onClick={() => saveIntro.mutate()}>
                  {saveIntro.isPending && <Spinner className="size-3.5" />} {t('qreport.saveIntro')}
                </button>
                {d.report.published ? (
                  <button type="button" className="btn-secondary btn-sm" disabled={publish.isPending} onClick={() => publish.mutate(false)}>
                    {t('qreport.unpublish')}
                  </button>
                ) : (
                  <button type="button" className="btn-secondary btn-sm" disabled={publish.isPending} onClick={() => publish.mutate(true)}>
                    <Globe className="size-4" aria-hidden /> {t('qreport.publish')}
                  </button>
                )}
              </div>
            )}
            {canEdit && <p className="mt-2 text-xs text-muted">{t('qreport.publishHint')}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
