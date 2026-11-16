import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { StoryNumber, StoryPlayer, type StorySlide } from '@/components/story/StoryPlayer';
import { registerCopy } from '@/i18n';
import { pagesVisaStory } from '@/i18n/pagesVisaStory';

registerCopy(pagesVisaStory);

/** GET /api/admin/year-review?year= (server lib/visaStory/stats.ts yearReview). perStaff is null below ADMIN. */
interface YearReviewData {
  year: number;
  opened: number;
  approved: number;
  rejected: number;
  openedByMonth: number[];
  approvedByMonth: number[];
  busiestMonth: { month: number; count: number } | null;
  topProfessions: { name: string; count: number }[];
  topCities: { name: string; count: number }[];
  fastest: { number: string; profession: string; days: number } | null;
  medianDays: number | null;
  perStaff: { id: string; name: string; opened: number; approved: number }[] | null;
}

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR - i);

/** Two-series monthly bars (opened / approved), self-drawn SVG with a data table fallback for screen readers. */
const MonthBars = ({ data, monthName }: { data: YearReviewData; monthName: (m: number) => string }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.openedByMonth, ...data.approvedByMonth);
  const W = 600;
  const H = 180;
  const slot = W / 12;
  const bw = slot * 0.32;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label={t('yreview.byMonth')}>
        {data.openedByMonth.map((v, i) => {
          const a = data.approvedByMonth[i];
          const x = i * slot + slot * 0.16;
          return (
            <g key={i}>
              <rect x={x} y={H - (v / max) * H} width={bw} height={(v / max) * H} rx="3" className="fill-primary" />
              <rect x={x + bw + 2} y={H - (a / max) * H} width={bw} height={(a / max) * H} rx="3" className="fill-success-fg" />
              <text x={i * slot + slot / 2} y={H + 18} textAnchor="middle" className="fill-muted text-[11px]">
                {monthName(i + 1).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" aria-hidden /> {t('yreview.legendOpened')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success-fg" aria-hidden /> {t('yreview.legendApproved')}
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>{t('yreview.byMonth')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('yreview.year')}</th>
            <th scope="col">{t('yreview.legendOpened')}</th>
            <th scope="col">{t('yreview.legendApproved')}</th>
          </tr>
        </thead>
        <tbody>
          {data.openedByMonth.map((v, i) => (
            <tr key={i}>
              <th scope="row">{monthName(i + 1)}</th>
              <td>{v}</td>
              <td>{data.approvedByMonth[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

const Ranked = ({ title, rows }: { title: string; rows: { name: string; count: number }[] }) => {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold text-ink">{title}</h2>
      {rows.length ? (
        <ol className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate text-ink">{r.name}</span>
                <span className="tabular-nums text-muted">{r.count}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-sunken">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('yreview.none')}</p>
      )}
    </section>
  );
};

/**
 * /admin/year-review — staff "Year in review": cases opened / approved, busiest month, top professions and cities,
 * fastest approval, per-staff counts (ADMIN+ only: the server leaves them out for STAFF). Also playable as a
 * full-screen story (StoryPlayer, same as the client "Your visa story").
 */
export default function AdminYearReview() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('yreview.title'));
  const [year, setYear] = useState(THIS_YEAR);
  const [playing, setPlaying] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'year-review', year],
    queryFn: async () => (await api.get<YearReviewData>('/admin/year-review', { params: { year } })).data,
  });
  const lng = i18n.resolvedLanguage ?? 'az';
  const monthName = (m: number) => new Intl.DateTimeFormat(lng, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 15)));

  const slides = useMemo<StorySlide[]>(() => {
    if (!data) return [];
    const y = (k: string, o?: Record<string, unknown>) => String(t(`yreview.${k}`, o));
    const big = (value: number, label: string) => (
      <>
        <p className="text-sm font-bold uppercase tracking-widest text-amber-300">{label}</p>
        <StoryNumber value={value} duration={1200} className="mt-3 block font-display text-8xl font-extrabold tabular-nums" />
      </>
    );
    const list = (title: string, rows: { name: string; count: number }[]) => (
      <>
        <p className="text-sm font-bold uppercase tracking-widest text-amber-300">{title}</p>
        <ol className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <li key={r.name} className="flex items-baseline gap-3 text-2xl font-semibold">
              <span className="w-8 text-white/60">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className="tabular-nums text-white/80">{r.count}</span>
            </li>
          ))}
        </ol>
      </>
    );
    const out: StorySlide[] = [
      { key: 'intro', bg: 'from-indigo-800 via-violet-700 to-fuchsia-600', content: <h2 className="font-display text-5xl font-extrabold leading-tight">{y('intro', { year: data.year })}</h2> },
      { key: 'opened', bg: 'from-sky-700 via-indigo-700 to-violet-800', content: big(data.opened, y('opened')) },
      { key: 'approved', bg: 'from-emerald-700 via-teal-700 to-cyan-800', content: big(data.approved, y('approved')) },
    ];
    if (data.busiestMonth)
      out.push({
        key: 'busiest',
        bg: 'from-rose-700 via-pink-700 to-orange-600',
        content: (
          <>
            <p className="text-sm font-bold uppercase tracking-widest text-amber-300">{y('busiest')}</p>
            <p className="mt-3 font-display text-6xl font-extrabold capitalize">{monthName(data.busiestMonth.month)}</p>
            <p className="mt-3 text-xl">{y('busiestText', { count: data.busiestMonth.count })}</p>
          </>
        ),
      });
    if (data.topProfessions.length) out.push({ key: 'professions', bg: 'from-blue-800 via-sky-700 to-amber-600', content: list(y('topProfessions'), data.topProfessions) });
    if (data.topCities.length) out.push({ key: 'cities', bg: 'from-neutral-900 via-red-800 to-amber-600', content: list(y('topCities'), data.topCities) });
    if (data.fastest)
      out.push({
        key: 'fastest',
        bg: 'from-amber-500 via-orange-600 to-pink-600',
        content: (
          <>
            {big(data.fastest.days, y('fastest'))}
            <p className="mt-3 text-xl">{y('fastestText', data.fastest)}</p>
            {data.medianDays !== null && <p className="mt-2 text-white/80">{y('median', { days: data.medianDays })}</p>}
          </>
        ),
      });
    if (data.perStaff?.length) out.push({ key: 'staff', bg: 'from-violet-800 via-purple-700 to-indigo-700', content: list(y('perStaff'), data.perStaff.slice(0, 6).map((s) => ({ name: s.name, count: s.approved }))) });
    out.push({
      key: 'outro',
      bg: 'from-indigo-900 via-violet-800 to-fuchsia-700',
      content: (
        <>
          <h2 className="font-display text-5xl font-extrabold">{y('outro')}</h2>
          <p className="mt-4 text-xl">{y('outroText', { approved: data.approved })}</p>
        </>
      ),
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- monthName depends on lng only
  }, [data, t, lng]);

  return (
    <div>
      <PageHeader
        title={t('yreview.title')}
        subtitle={t('yreview.subtitle')}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="label">{t('yreview.year')}</span>
              <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Button icon={Play} disabled={!data || (!data.opened && !data.approved)} onClick={() => setPlaying(true)}>
              {t('yreview.play')}
            </Button>
          </div>
        }
      />
      {isLoading || !data ? (
        <p className="flex items-center gap-2 text-muted" role="status">
          <Spinner className="size-4" />
        </p>
      ) : !data.opened && !data.approved ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-muted">{t('yreview.empty')}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['opened', data.opened],
                ['approved', data.approved],
                ['rejected', data.rejected],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-card p-4">
                <p className="text-sm text-muted">{t(`yreview.${k}`)}</p>
                <StoryNumber value={v} className="mt-1 block font-display text-3xl font-bold tabular-nums text-ink" />
              </div>
            ))}
            <div className="rounded-2xl border border-line bg-card p-4">
              <p className="text-sm text-muted">{t('yreview.busiest')}</p>
              <p className="mt-1 font-display text-2xl font-bold capitalize text-ink">{data.busiestMonth ? monthName(data.busiestMonth.month) : t('yreview.none')}</p>
              {data.busiestMonth && <p className="text-xs text-muted">{t('yreview.busiestText', { count: data.busiestMonth.count })}</p>}
            </div>
          </div>
          <section className="rounded-2xl border border-line bg-card p-4">
            <h2 className="mb-3 font-semibold text-ink">{t('yreview.byMonth')}</h2>
            <MonthBars data={data} monthName={monthName} />
          </section>
          <div className="grid gap-4 lg:grid-cols-3">
            <Ranked title={t('yreview.topProfessions')} rows={data.topProfessions} />
            <Ranked title={t('yreview.topCities')} rows={data.topCities} />
            <section className="rounded-2xl border border-line bg-card p-4">
              <h2 className="font-semibold text-ink">{t('yreview.fastest')}</h2>
              <p className="mt-2 text-sm text-ink">{data.fastest ? t('yreview.fastestText', data.fastest) : t('yreview.none')}</p>
              {data.medianDays !== null && <p className="mt-2 text-xs text-muted">{t('yreview.median', { days: data.medianDays })}</p>}
            </section>
          </div>
          {data.perStaff && (
            <section className="overflow-x-auto rounded-2xl border border-line bg-card p-4">
              <h2 className="mb-3 font-semibold text-ink">{t('yreview.perStaff')}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('yreview.colStaff')}</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">{t('yreview.colOpened')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('yreview.colApproved')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perStaff.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-2 pr-3 text-ink">{s.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.opened}</td>
                      <td className="py-2 text-right tabular-nums">{s.approved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <p className="text-xs text-muted">{t('yreview.note')}</p>
        </div>
      )}
      {playing && slides.length > 0 && <StoryPlayer slides={slides} label={t('yreview.storyLabel', { year: data?.year })} onClose={() => setPlaying(false)} />}
    </div>
  );
}
