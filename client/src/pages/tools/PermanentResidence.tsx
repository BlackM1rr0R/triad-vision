import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ExternalLink, Flag, Home, Info, Landmark } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Germany } from '@/components/illustrations';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Accordion } from '@/components/visa/Accordion';
import { PageCta } from '@/components/visa/PageCta';
import { FaqJsonLd } from '@/components/seo/FaqJsonLd';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesPermanentResidence } from '@/i18n/pagesPermanentResidence';
import { usePageTitle } from '@/lib/usePageTitle';
import { computePr, isYm, monthsBetween, PR_AS_OF, PR_GERMAN, PR_PERMITS, prFromParams, prToQuery, type PrInput, type PrResult } from '@/lib/permanentResidence/calc';

registerCopy(pagesPermanentResidence);

const PR_SOURCES = [
  { label: '§ 18c AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__18c.html' },
  { label: '§ 9 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__9.html' },
  { label: '§ 28 AufenthG', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__28.html' },
  { label: '§ 2 AufenthG (A1 / B1)', href: 'https://www.gesetze-im-internet.de/aufenthg_2004/__2.html' },
  { label: '§ 10 StAG', href: 'https://www.gesetze-im-internet.de/stag/__10.html' },
  { label: '§ 9 StAG', href: 'https://www.gesetze-im-internet.de/stag/__9.html' },
  { label: 'BGBl. 2025 I Nr. 256 (§ 10 Abs. 3 StAG gestrichen)', href: 'https://www.recht.bund.de/bgbl/1/2025/256/VO.html' },
  { label: 'BAMF: Einbürgerung', href: 'https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html' },
];

/** "YYYY-MM" of today (UTC). */
const todayYm = () => new Date().toISOString().slice(0, 7);

const Chips = <T extends string>({ legend, name, value, options, onChange, cols = 'grid-cols-2' }: { legend: string; name: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; cols?: string }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className={clsx('grid gap-2', cols)}>
      {options.map((o) => (
        <label
          key={o.value}
          className={clsx(
            'flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  </fieldset>
);

const useMonthYear = () => {
  const { t, i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  return (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    const months = t('pr.months', { returnObjects: true }) as unknown as string[];
    const name = Array.isArray(months) ? (months[m - 1] ?? '') : '';
    return lng === 'az' ? `${y} ${name}` : `${name} ${y}`;
  };
};

const Timeline = ({ input, r, today }: { input: PrInput; r: PrResult; today: string }) => {
  const { t } = useTranslation();
  const my = useMonthYear();
  const points = [
    { key: 'arrival', at: input.start, icon: Flag },
    ...(r.titleStart !== input.start ? [{ key: 'switch', at: r.titleStart, icon: Info }] : []),
    { key: 'settlement', at: r.settlement, icon: Home },
    { key: 'citizenship', at: r.citizenship, icon: Landmark },
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const end = points[points.length - 1].at;
  const span = Math.max(1, monthsBetween(input.start, end));
  const pos = (ym: string) => `${Math.max(0, Math.min(100, (monthsBetween(input.start, ym) / span) * 100)).toFixed(2)}%`;
  const showToday = today > input.start && today < end;
  return (
    <section aria-labelledby="pr-tl-h" className="rounded-3xl border border-line bg-card p-4 sm:p-6">
      <h3 id="pr-tl-h" className="font-display text-lg font-semibold text-ink">
        {t('pr.timeline.title')}
      </h3>
      <div className="relative mx-2 mt-10 mb-2 h-2 rounded-full bg-sunken" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: pos(r.settlement) }} />
        {showToday && (
          <span className="absolute -top-7 -translate-x-1/2 text-[11px] font-semibold text-warning-fg" style={{ left: pos(today) }}>
            {t('pr.timeline.today')}
            <span className="mx-auto mt-0.5 block h-4 w-0.5 bg-warning-fg" />
          </span>
        )}
        {points.map((p) => (
          <span key={p.key} className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary" style={{ left: pos(p.at) }} />
        ))}
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {points.map((p) => (
          <li key={p.key} className="flex items-center gap-3 rounded-2xl bg-sunken p-3">
            <p.icon className="size-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs text-muted">{t(`pr.timeline.${p.key}`)}</span>
              <span className="block font-semibold text-ink tabular-nums">{my(p.at)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

const Card = ({ title, date, reached, children }: { title: string; date: string; reached: boolean; children: ReactNode }) => {
  const { t } = useTranslation();
  return (
    <section className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-6">
      <h3 className="text-sm font-semibold text-muted">{title}</h3>
      <p className="mt-1 font-display text-3xl font-semibold text-ink">
        <span className="text-base font-semibold text-muted">{t('pr.result.earliest')}: </span>
        {date}
      </p>
      {reached && (
        <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-success-fg">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pr.result.reached')}
        </p>
      )}
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
};

/**
 * /permanent-residence — earliest Niederlassungserlaubnis and Einbürgerung (lib/permanentResidence/calc.ts,
 * pure). The answers live in the URL (shareable); the bare URL shows a Blue Card example from this month.
 */
export default function PermanentResidencePage() {
  const { t } = useTranslation();
  usePageTitle(t('pr.heroTitle'));
  const today = todayYm();
  const [params, setParams] = useSearchParams();
  const input = useMemo(() => prFromParams(params, today), [params, today]);
  const r = useMemo(() => computePr(input, today), [input, today]);
  const my = useMonthYear();
  const set = (next: Partial<PrInput>) => {
    const merged = { ...input, ...next };
    if (next.permit && next.permit !== input.permit) merged.before = next.permit === 'ausbildung' ? 36 : next.permit === 'chancenkarte' ? 12 : 0;
    setParams(new URLSearchParams(prToQuery(merged)), { replace: true, preventScrollReset: true });
  };
  const faq = t('pr.faq.items', { returnObjects: true }) as unknown as { q: string; a: string }[];
  const news = t('pr.news.items', { returnObjects: true }) as unknown as string[];
  const asOf = PR_AS_OF.split('-').reverse().join('.');

  return (
    <>
      <PageHero title={t('pr.heroTitle')} subtitle={t('pr.heroSubtitle')} illustration={<Germany />} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
          <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5 lg:sticky lg:top-24" onSubmit={(e) => e.preventDefault()} aria-labelledby="pr-form-h">
            <h2 id="pr-form-h" className="font-display text-lg font-semibold text-ink">
              {t('pr.form.title')}
            </h2>
            <div>
              <label htmlFor="pr-permit" className="label">
                {t('pr.form.permit')}
              </label>
              <select id="pr-permit" className="input" value={input.permit} onChange={(e) => set({ permit: e.target.value as PrInput['permit'] })}>
                {PR_PERMITS.map((p) => (
                  <option key={p} value={p}>
                    {t(`pr.form.permits.${p}`)}
                  </option>
                ))}
              </select>
            </div>
            <Chips legend={t('pr.form.german')} name="pr-german" value={input.german} cols="grid-cols-4" options={PR_GERMAN.map((g) => ({ value: g, label: t(`pr.form.germanLevels.${g}`) }))} onChange={(v) => set({ german: v })} />
            <div>
              <label htmlFor="pr-start" className="label">
                {t('pr.form.start')}
              </label>
              <input id="pr-start" type="month" className="input tabular-nums" min="2000-01" max="2040-12" value={input.start} onChange={(e) => isYm(e.target.value) && set({ start: e.target.value })} />
            </div>
            {(input.permit === 'ausbildung' || input.permit === 'chancenkarte') && (
              <div>
                <label htmlFor="pr-before" className="label">
                  {t(`pr.form.before.${input.permit}`)}
                </label>
                <input id="pr-before" type="number" inputMode="numeric" min={0} max={72} className="input tabular-nums" aria-describedby="pr-before-help" value={input.before} onChange={(e) => set({ before: Math.min(72, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
                <p id="pr-before-help" className="mt-1 text-xs text-muted">
                  {t('pr.form.beforeHint')}
                </p>
              </div>
            )}
            {input.permit !== 'family' || !input.marriedGerman ? (
              <div>
                <label htmlFor="pr-pension" className="label">
                  {t('pr.form.pension')}
                </label>
                <input
                  id="pr-pension"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={50}
                  step={0.5}
                  className="input tabular-nums"
                  aria-describedby="pr-pension-help"
                  value={input.pension == null ? '' : String(Math.round((input.pension / 12) * 10) / 10)}
                  onChange={(e) => set({ pension: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value.replace(',', '.')) * 12) || 0) })}
                />
                <p id="pr-pension-help" className="mt-1 text-xs text-muted">
                  {t('pr.form.pensionHint')}
                </p>
              </div>
            ) : null}
            {(input.permit === 'skilled' || input.permit === 'chancenkarte') && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
                <input type="checkbox" className="size-4" checked={input.germanDegree} onChange={(e) => set({ germanDegree: e.target.checked })} /> {t('pr.form.degree')}
              </label>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4" checked={input.marriedGerman} onChange={(e) => set({ marriedGerman: e.target.checked })} /> {t('pr.form.married')}
            </label>
            {input.marriedGerman && (
              <div>
                <label htmlFor="pr-since" className="label">
                  {t('pr.form.marriedSince')}
                </label>
                <input id="pr-since" type="month" className="input tabular-nums" min="1960-01" max="2040-12" value={input.marriedSince ?? ''} onChange={(e) => set({ marriedSince: isYm(e.target.value) ? e.target.value : null })} />
              </div>
            )}
          </form>

          <div className="min-w-0 space-y-4" aria-live="polite">
            <div className="grid gap-4 xl:grid-cols-2">
              <Card title={t('pr.result.settlementTitle')} date={my(r.settlement)} reached={r.settlementReached}>
                <p>{t(`pr.result.routes.${r.route}`, { months: r.titleMonths, pension: r.pensionMonths })}</p>
                <p className="text-xs text-muted">{t('pr.result.paragraph', { paragraph: r.paragraph })}</p>
                {r.settlementBy === 'pension' && <p className="text-xs text-muted">{t('pr.result.byPension')}</p>}
                {!r.germanOk && (
                  <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-2 text-xs text-warning-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('pr.result.germanMissing', { level: r.germanNeeded.toUpperCase() })}
                  </p>
                )}
                {r.fasterWithB1 && <p className="text-xs font-semibold text-success-fg">{t('pr.result.fasterB1', { date: my(r.fasterWithB1) })}</p>}
              </Card>
              <Card title={t('pr.result.citizenshipTitle')} date={my(r.citizenship)} reached={r.citizenshipReached}>
                <p>{t(`pr.result.citizenshipRoutes.${r.citizenshipRoute}`)}</p>
                {!r.citizenshipGermanOk && (
                  <p className="flex items-start gap-2 rounded-xl bg-warning-bg p-2 text-xs text-warning-fg">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('pr.result.citizenshipGerman')}
                  </p>
                )}
              </Card>
            </div>
            <EmailResult
              tool="permanent-residence"
              summary={[
                { label: t('pr.form.permit'), value: t(`pr.form.permits.${input.permit}`) },
                { label: t('pr.form.german'), value: t(`pr.form.germanLevels.${input.german}`) },
                { label: t('pr.result.settlementTitle'), value: r.settlementReached ? t('pr.result.reached') : `${t('pr.result.earliest')}: ${my(r.settlement)}` },
                { label: t('pr.result.paragraph', { paragraph: r.paragraph }), value: t(`pr.result.routes.${r.route}`, { months: r.titleMonths, pension: r.pensionMonths }) },
                { label: t('pr.result.citizenshipTitle'), value: r.citizenshipReached ? t('pr.result.reached') : `${t('pr.result.earliest')}: ${my(r.citizenship)}` },
                ...(!r.germanOk ? [{ label: t('pr.form.german'), value: t('pr.result.germanMissing', { level: r.germanNeeded.toUpperCase() }) }] : []),
              ]}
            />
            <Timeline input={input} r={r} today={today} />
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { title: t('pr.result.settlementTitle'), list: r.requirements },
                { title: t('pr.result.citizenshipTitle'), list: r.citizenshipRequirements },
              ].map((b) => (
                <section key={b.title} className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {t('pr.result.requirements')}: {b.title}
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink">
                    {b.list.map((k) => (
                      <li key={k} className="flex gap-2">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t(`pr.req.${k}`)}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <section className="rounded-3xl border border-line bg-sunken p-4 sm:p-5">
              <h3 className="font-display text-base font-semibold text-ink">{t('pr.dual.title')}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink">{t('pr.dual.text')}</p>
            </section>
          </div>
        </div>
      </section>

      <section className="pb-12" aria-labelledby="pr-news-h">
        <div className="container-x max-w-3xl space-y-3 text-sm leading-relaxed text-ink">
          <h2 id="pr-news-h" className="font-display text-xl font-semibold">
            {t('pr.news.title')}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {(Array.isArray(news) ? news : []).map((n) => (
              <li key={n.slice(0, 24)}>{n}</li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t('pr.asOf', { date: asOf })}</p>
          <h3 className="font-semibold">{t('pr.sources')}</h3>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {PR_SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-link hover:underline">
                  {s.label} <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-warning-fg" role="note">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pr.disclaimer')}
          </p>
        </div>
      </section>

      <section className="section bg-sunken">
        <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHeading title={t('pr.faq.title')} />
          </div>
          <Accordion items={Array.isArray(faq) ? faq : []} />
          <FaqJsonLd items={Array.isArray(faq) ? faq : []} lng={currentSiteLocale()} />
        </div>
      </section>
      <RelatedGuides tool="/permanent-residence" />
      <div className="pt-16 sm:pt-20 lg:pt-28">
        <PageCta icon={<Landmark className="size-7" />} title={t('pr.cta.title')} text={t('pr.cta.text')} primary={{ to: '/register', label: t('pr.cta.primary') }} secondary={{ to: '/booking', label: t('pr.cta.secondary') }} />
      </div>
    </>
  );
}
