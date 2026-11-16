import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileBarChart2, FileDown, ShieldCheck } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesPublicReports } from '@/i18n/pagesPublicReports';
import { api } from '@/lib/api';
import { useBrand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesPublicReports);

const REPORT_LANGS = ['az', 'en', 'de'] as const;
type ReportLang = (typeof REPORT_LANGS)[number];

interface PublishedReport {
  year: number;
  quarter: number;
  publishedAt: string | null;
  title: Record<ReportLang, string>;
  approved: number | null;
}

/** Deterministic dd.mm.yyyy (no Intl: the server render and the browser agree). */
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

export const usePublishedReports = () =>
  useQuery({
    queryKey: ['public-quarterly-reports'],
    queryFn: async () => (await api.get<{ items: PublishedReport[] }>('/reports')).data.items,
    staleTime: 10 * 60 * 1000,
  });

/**
 * /reports — published quarterly "Azerbaijan → Germany labour mobility" reports (server: routes/quarterlyReports.ts).
 * Only reports an admin chose to publish; every figure in them describes at least 3 applications (k-anonymity).
 */
export default function Reports() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('reportsPage.title'));
  const brand = useBrand();
  const ui = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const titleLang: ReportLang = (REPORT_LANGS as readonly string[]).includes(ui) ? (ui as ReportLang) : 'en';
  const q = usePublishedReports();
  const method = t('reportsPage.method', { returnObjects: true }) as unknown as string[];

  return (
    <>
      <PageHero title={t('reportsPage.title')} subtitle={t('reportsPage.subtitle')} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink">{t('reportsPage.listTitle')}</h2>
            {q.isLoading ? (
              <Spinner />
            ) : !q.data?.length ? (
              <div className="rounded-3xl border border-line bg-card p-6 text-center">
                <FileBarChart2 className="mx-auto size-10 text-muted" aria-hidden />
                <p className="mt-3 font-semibold text-ink">{t('reportsPage.emptyTitle')}</p>
                <p className="mt-1 text-sm text-muted">{t('reportsPage.emptyBody')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {q.data.map((r) => (
                  <li key={`${r.year}-${r.quarter}`} className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                    <h3 className="font-semibold text-ink">{r.title[titleLang]}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {r.approved === null ? t('reportsPage.fewer') : t('reportsPage.approved', { n: r.approved })}
                      {r.publishedAt && ` · ${t('reportsPage.published', { date: fmtDate(r.publishedAt) })}`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {REPORT_LANGS.map((l) => (
                        <a
                          key={l}
                          href={`/api/reports/${r.year}/q${r.quarter}.pdf?lng=${l}`}
                          target="_blank"
                          rel="noreferrer"
                          hrefLang={l}
                          className="btn-secondary btn-sm min-h-11"
                        >
                          <FileDown className="size-4" aria-hidden /> {t('reportsPage.download')} · {t(`reportsPage.langs.${l}`)}
                        </a>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="rounded-3xl border border-line bg-sunken p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <ShieldCheck className="size-5 text-primary" aria-hidden /> {t('reportsPage.methodTitle')}
            </h2>
            <ul className="mt-2 list-disc space-y-2 ps-5 text-sm text-muted">
              {Array.isArray(method) && method.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <p className="mt-3 text-sm text-ink">
              <a className="font-semibold text-link" href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`}>
                {t('reportsPage.contact', { phone: brand.phone })}
              </a>
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}
