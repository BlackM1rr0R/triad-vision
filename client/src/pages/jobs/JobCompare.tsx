import { useEffect, useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowUpRight, Building2, GitCompareArrows, Plus, Share2, Trophy, X } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { pagesJobCompare } from '@/i18n/pagesJobCompare';
import { useL10n } from '@/lib/l10n';
import { quickNetMonthly } from '@/lib/salary/calc';
import { keyFigures } from '@/lib/cities/calc';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { fmtDate } from '@/components/admin/labels';
import { useJobLabels } from '@/components/jobs/labels';
import { COMPARE_MAX, compareActions, compareHref, costCityFor, slugsFromParam, useCompareList } from '@/components/jobs/compare';
import type { PublicVacancy } from '@/components/jobs/types';

registerCopy(pagesJobs);
registerCopy(pagesJobCompare);

type Range = readonly [number, number];
const mid = (r: Range | null) => (r ? (r[0] + r[1]) / 2 : null);

interface Col {
  slug: string;
  v: PublicVacancy | null;
  loading: boolean;
  gone: boolean;
  gross: Range | null;
  net: Range | null;
  cost: { range: Range; label: string | null } | null;
  left: Range | null;
}

/** Index of the column with the highest value (none on a tie of all or with fewer than 2 values). */
const bestOf = (vals: (number | null)[]) => {
  const xs = vals.filter((x): x is number => x !== null);
  if (xs.length < 2) return -1;
  const max = Math.max(...xs);
  if (xs.every((x) => x === max)) return -1;
  return vals.indexOf(max);
};

/**
 * /compare-jobs?v=a,b,c — 2–3 vacancies side by side (noindex, server lib/seoCatalogue.ts): gross and net pay
 * (payroll engine, tax class I), city, cost of living (city profiles, one person / 1-room flat), what is left,
 * German level and requirements. The URL is the comparison, so it can be shared.
 */
export default function JobCompare() {
  const { t } = useTranslation();
  usePageTitle(t('jc.page.title'));
  const { tr, trList } = useL10n();
  const L = useJobLabels();
  const [params, setParams] = useSearchParams();
  const slugs = useMemo(() => slugsFromParam(params.get('v')), [params]);
  const stored = useCompareList();

  const queries = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: ['job', slug],
      queryFn: async () => (await api.get<{ vacancy: PublicVacancy }>(`/vacancies/${slug}`)).data.vacancy,
      retry: (n: number, err: unknown) => errorCode(err) !== 'VACANCY_NOT_FOUND' && n < 2,
      staleTime: 60_000,
    })),
  });

  const cols: Col[] = slugs.map((slug, i) => {
    const q = queries[i];
    const v = q?.data ?? null;
    const lo = v?.salaryMin ?? v?.salaryMax ?? null;
    const hi = v?.salaryMax ?? v?.salaryMin ?? null;
    const gross: Range | null = lo && hi ? [lo, Math.max(lo, hi)] : null;
    const net: Range | null = gross ? [quickNetMonthly(gross[0]), quickNetMonthly(gross[1])] : null;
    const match = costCityFor(v?.city);
    const cost = match
      ? {
          range: keyFigures(match.city).single,
          label: match.how === 'near' ? t('jc.page.near', { city: tr(match.city.name) }) : match.how === 'small' ? t('jc.page.small') : null,
        }
      : null;
    const left: Range | null = net && cost ? [net[0] - cost.range[1], net[1] - cost.range[0]] : null;
    return { slug, v, loading: !!q?.isLoading, gone: !!q?.isError, gross, net, cost, left };
  });

  // Opening a shared comparison makes it the visitor's own list (so "add another" continues from it).
  const loadedSlugs = cols.filter((c) => c.v).map((c) => c.slug).join(',');
  useEffect(() => {
    const ready = cols.filter((c) => c.v);
    if (!ready.length || ready.length !== slugs.length) return;
    if (stored.map((x) => x.slug).join(',') === loadedSlugs) return;
    compareActions.clear();
    ready.forEach((c) => compareActions.toggle({ slug: c.slug, title: c.v!.title, city: c.v!.city }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSlugs]);

  const remove = (slug: string) => {
    compareActions.remove(slug);
    const next = slugs.filter((s) => s !== slug);
    const p = new URLSearchParams(params);
    if (next.length) p.set('v', next.join(','));
    else p.delete('v');
    setParams(p, { replace: true });
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?v=${slugs.join(',')}`;
    try {
      if (navigator.share) await navigator.share({ title: t('jc.page.title'), url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t('jc.page.copied'));
      }
    } catch {
      // cancelled / blocked
    }
  };

  const euro = L.euro;
  const range = (r: Range | null) => (r ? (r[0] === r[1] ? euro(r[0]) : `${euro(r[0])} – ${euro(r[1])}`) : t('jc.page.none'));
  const bestGross = bestOf(cols.map((c) => mid(c.gross)));
  const bestNet = bestOf(cols.map((c) => mid(c.net)));
  const bestLeft = bestOf(cols.map((c) => mid(c.left)));
  const ready = cols.filter((c) => c.v);

  const BestMark = () => (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success-fg">
      <Trophy className="size-3" aria-hidden /> {t('jc.page.best')}
    </span>
  );

  const rows: { key: string; label: string; cell: (c: Col, i: number) => ReactNode }[] = [
    {
      key: 'salary',
      label: t('jc.page.rows.salary'),
      cell: (c, i) => (
        <>
          <span className="font-semibold tabular-nums">{c.v ? L.salary(c.v.salaryMin, c.v.salaryMax) || t('jc.page.none') : t('jc.page.none')}</span>
          {c.gross && <span className="text-xs text-muted"> {t('jc.page.perMonth')}</span>}
          {i === bestGross && <BestMark />}
        </>
      ),
    },
    {
      key: 'net',
      label: t('jc.page.rows.net'),
      cell: (c, i) => (
        <>
          <span className="font-semibold text-success-fg tabular-nums">{range(c.net)}</span>
          {i === bestNet && <BestMark />}
        </>
      ),
    },
    { key: 'city', label: t('jc.page.rows.city'), cell: (c) => c.v?.city ?? t('jc.page.none') },
    {
      key: 'cost',
      label: t('jc.page.rows.cost'),
      cell: (c) =>
        c.cost ? (
          <>
            <span className="tabular-nums">{range(c.cost.range)}</span>
            {c.cost.label && <span className="block text-[11px] text-muted">{c.cost.label}</span>}
          </>
        ) : (
          t('jc.page.none')
        ),
    },
    {
      key: 'left',
      label: t('jc.page.rows.left'),
      cell: (c, i) => (
        <>
          <span className={clsx('font-semibold tabular-nums', c.left && c.left[1] < 0 ? 'text-danger-fg' : 'text-ink')}>{range(c.left)}</span>
          {i === bestLeft && <BestMark />}
        </>
      ),
    },
    {
      key: 'german',
      label: t('jc.page.rows.german'),
      cell: (c) => (c.v ? (c.v.germanLevel && c.v.germanLevel !== 'none' ? t('jobsArea.common.germanMin', { level: c.v.germanLevel }) : t('jobsArea.german.none')) : t('jc.page.none')),
    },
    { key: 'experience', label: t('jc.page.rows.experience'), cell: (c) => (c.v?.minExperience ? t('jobsArea.common.minExperience', { count: c.v.minExperience }) : t('jc.page.noExperience')) },
    { key: 'licence', label: t('jc.page.rows.licence'), cell: (c) => c.v?.drivingLicence || t('jc.page.none') },
    { key: 'type', label: t('jc.page.rows.type'), cell: (c) => (c.v ? L.employmentType(c.v.employmentType) : t('jc.page.none')) },
    { key: 'positions', label: t('jc.page.rows.positions'), cell: (c) => (c.v ? <span className="tabular-nums">{c.v.positions}</span> : t('jc.page.none')) },
    {
      key: 'requirements',
      label: t('jc.page.rows.requirements'),
      cell: (c) => {
        const list = c.v ? trList(c.v.requirements) : [];
        return list.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-left text-xs">
            {list.slice(0, 6).map((r, k) => (
              <li key={k}>{r}</li>
            ))}
          </ul>
        ) : (
          t('jc.page.none')
        );
      },
    },
    { key: 'closes', label: t('jc.page.rows.closes'), cell: (c) => (c.v?.validThrough ? fmtDate(c.v.validThrough) : t('jc.page.none')) },
  ];

  return (
    <>
      <PageHero title={t('jc.page.title')} subtitle={t('jc.page.subtitle')} crumb={{ to: '/jobs', label: t('nav.jobs') }} />
      <section className="section pt-8">
        <div className="container-x">
          {slugs.length === 0 ? (
            <div className="card mx-auto max-w-lg rounded-3xl p-8 text-center">
              <GitCompareArrows className="mx-auto size-10 text-primary" aria-hidden />
              <p className="mt-4 text-ink">{t('jc.page.empty')}</p>
              <Link to={stored.length >= 2 ? compareHref(stored.map((x) => x.slug)) : '/jobs'} className={buttonClass({ className: 'mt-6' })}>
                {stored.length >= 2 ? t('jc.tray.open') : t('jc.page.toBoard')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                {slugs.length < COMPARE_MAX && (
                  <Link to="/jobs" className="btn-ghost btn-sm">
                    <Plus className="size-4" aria-hidden /> {t('jc.page.addMore')}
                  </Link>
                )}
                {ready.length >= 2 && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => void share()}>
                    <Share2 className="size-4" aria-hidden /> {t('jc.page.share')}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-3xl border border-line bg-card shadow-[var(--tv-shadow-card)]">
                <table className="w-full min-w-[34rem] table-fixed border-collapse text-sm">
                  <caption className="sr-only">{t('jc.page.title')}</caption>
                  <colgroup>
                    <col className="w-28 sm:w-44" />
                    {cols.map((c) => (
                      <col key={c.slug} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-line align-top">
                      <th scope="col" className="sticky left-0 z-10 bg-card p-3 text-left text-xs font-semibold text-muted">
                        {t('jc.page.criterion')}
                      </th>
                      {cols.map((c) => (
                        <th key={c.slug} scope="col" className="p-3 text-left align-top font-normal">
                          {c.loading ? (
                            <span className="flex items-center gap-2 text-xs text-muted" role="status">
                              <Spinner className="size-4" /> {t('jc.page.loading')}
                            </span>
                          ) : c.v ? (
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <Link to={`/jobs/${c.slug}`} className="group inline-flex items-start gap-1 font-display text-base leading-snug font-semibold break-words text-ink hover:text-link">
                                  {tr(c.v.title)} <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-subtle group-hover:text-link" aria-hidden />
                                </Link>
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                                  <Building2 className="size-3.5 shrink-0" aria-hidden />
                                  <span className="truncate">{c.v.companyName ?? t('jobsArea.common.confidentialEmployer')}</span>
                                </p>
                              </div>
                              <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={`${t('jc.page.remove')}: ${tr(c.v.title)}`} onClick={() => remove(c.slug)}>
                                <X className="size-4" aria-hidden />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              <p className="flex-1 text-xs text-muted">{t('jc.page.notFound')}</p>
                              <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('jc.page.remove')} onClick={() => remove(c.slug)}>
                                <X className="size-4" aria-hidden />
                              </button>
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-line align-top last:border-b-0 even:bg-sunken/40">
                        <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left text-xs font-semibold text-muted">
                          {r.label}
                        </th>
                        {cols.map((c, i) => (
                          <td key={c.slug} className="p-3 text-ink">
                            {c.v ? r.cell(c, i) : <span className="text-muted">{t('jc.page.none')}</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-xs text-muted">
                {t('jc.page.disclaimer')}{' '}
                <Link to="/cities" className="font-semibold text-link hover:underline">
                  {t('jc.page.costLink')}
                </Link>
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
