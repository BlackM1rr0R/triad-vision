import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, BadgeEuro, CheckCircle2, ChefHat, HeartPulse, Info, Moon, RotateCcw, Timer, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { registerCopy } from '@/i18n';
import { pagesWorkSchedule } from '@/i18n/pagesWorkSchedule';
import { usePageTitle } from '@/lib/usePageTitle';
import { checkSchedule, DEFAULT_SCHEDULE, PLAN_PRESETS, SCHEDULE_CHECKED, SECTORS, SHIFT_PRESETS, type PlanPreset, type ScheduleInput, type Sector, type ShiftDay, type ShiftPreset } from '@/lib/publicCalc/workSchedule';
import { hm } from '@/lib/publicCalc/drivingTime';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq } from '@/components/tools/calc/CalcShared';

registerCopy(pagesWorkSchedule);

const SOURCES = [
  { label: 'Arbeitszeitgesetz (ArbZG) – §§ 2–7, 9–11', url: 'https://www.gesetze-im-internet.de/arbzg/BJNR117100994.html' },
  { label: '§ 5 ArbZG – Ruhezeit (Verkürzung in Krankenhäusern, Pflege, Gastronomie)', url: 'https://www.gesetze-im-internet.de/arbzg/__5.html' },
  { label: '§ 6 ArbZG – Nacht- und Schichtarbeit', url: 'https://www.gesetze-im-internet.de/arbzg/__6.html' },
  { label: '§ 11 ArbZG – Ausgleich für Sonn- und Feiertagsbeschäftigung', url: 'https://www.gesetze-im-internet.de/arbzg/__11.html' },
  { label: '§ 10 ArbZG – Ausnahmen vom Sonntagsverbot', url: 'https://www.gesetze-im-internet.de/arbzg/__10.html' },
];

const PRESET_ICONS: Record<PlanPreset, typeof HeartPulse> = { nurse: HeartPulse, cook: ChefHat, quickReturn: Timer };
const SHIFT_KEYS: ShiftPreset[] = ['early', 'late', 'night', 'split', 'off'];

/** /work-schedule-check — a weekly shift plan checked against the ArbZG (lib/publicCalc/workSchedule.ts). */
export default function WorkScheduleCheckPage() {
  const { t } = useTranslation();
  usePageTitle(t('workSchedule.heroTitle'));
  const faq = useFaq('workSchedule.faq');
  const [input, setInput] = useState<ScheduleInput>(DEFAULT_SCHEDULE);
  const [preset, setPreset] = useState<PlanPreset | null>('nurse');
  const r = useMemo(() => checkSchedule(input), [input]);
  const weekdaysRaw = t('workSchedule.weekdays', { returnObjects: true }) as unknown;
  const wd = (d: number) => (Array.isArray(weekdaysRaw) ? String(weekdaysRaw[d % 7]) : String(d + 1));
  const dayLabel = (d: number) => (input.days.length > 7 ? t('workSchedule.dayWeek', { day: wd(d), week: Math.floor(d / 7) + 1 }) : wd(d));

  const update = (fn: (i: ScheduleInput) => ScheduleInput) => {
    setPreset(null);
    setInput((i) => fn({ ...i, days: i.days.map((d) => ({ ...d })) }));
  };
  const setDay = (d: number, patch: Partial<ShiftDay>) => update((i) => ((i.days[d] = { ...i.days[d], ...patch }), i));
  const setWeeks = (n: 1 | 2) => update((i) => ({ ...i, days: n === 2 ? [...i.days.slice(0, 7), ...i.days.slice(0, 7).map((d) => ({ ...d }))] : i.days.slice(0, 7) }));
  const StatusIcon = { ok: CheckCircle2, warnings: AlertTriangle, violations: XCircle }[r.status];

  return (
    <>
      <PageHero title={t('workSchedule.heroTitle')} subtitle={t('workSchedule.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{t('workSchedule.presets.title')}:</span>
            {(Object.keys(PLAN_PRESETS) as PlanPreset[]).map((k) => {
              const Icon = PRESET_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={preset === k}
                  className={clsx('inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold', preset === k ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}
                  onClick={() => {
                    setInput(PLAN_PRESETS[k]());
                    setPreset(k);
                  }}
                >
                  <Icon className="size-4" aria-hidden /> {t(`workSchedule.presets.${k}`)}
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
            <form className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="ws-form-h">
              <h2 id="ws-form-h" className="font-display text-lg font-semibold text-ink">
                {t('workSchedule.form.title')}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ws-sector" className="label">
                    {t('workSchedule.form.sector')}
                  </label>
                  <select id="ws-sector" className="input" value={input.sector} onChange={(e) => update((i) => ({ ...i, sector: e.target.value as Sector }))}>
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {t(`workSchedule.sectors.${s}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="label">{t('workSchedule.form.weeks')}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {([1, 2] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={input.days.length === n * 7}
                        className={clsx('min-h-11 rounded-xl border px-2 text-sm font-semibold', input.days.length === n * 7 ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}
                        onClick={() => setWeeks(n)}
                      >
                        {t(n === 1 ? 'workSchedule.form.oneWeek' : 'workSchedule.form.twoWeeks')}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <p className="text-[11px] leading-snug text-muted">{t('workSchedule.form.hint')}</p>

              <ul className="space-y-3">
                {input.days.map((x, d) => {
                  const res = r.days[d];
                  return (
                    <li key={d} className={clsx('rounded-2xl border p-3', d % 7 === 6 ? 'border-primary/30 bg-sunken' : 'border-line')}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{dayLabel(d)}</span>
                        <label className="text-sm">
                          <span className="sr-only">{t('workSchedule.form.shift', { day: dayLabel(d) })}</span>
                          <select
                            className="input min-h-9 py-1 text-sm"
                            value=""
                            onChange={(e) => e.target.value && setDay(d, { ...SHIFT_PRESETS[e.target.value as ShiftPreset] })}
                          >
                            <option value="">{t('workSchedule.form.shiftPlaceholder')}</option>
                            {SHIFT_KEYS.map((k) => (
                              <option key={k} value={k}>
                                {t(`workSchedule.shifts.${k}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {x.off ? (
                        <p className="mt-2 text-sm text-muted">
                          {t('workSchedule.form.dayOff')}{' '}
                          <button type="button" className="font-semibold text-link hover:underline" onClick={() => setDay(d, { ...SHIFT_PRESETS.early })}>
                            {t('workSchedule.form.addShift')}
                          </button>
                        </p>
                      ) : (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <label className="text-xs text-muted">
                            {t('workSchedule.form.start')}
                            <input type="time" className="input mt-1 min-h-10 py-1.5 tabular-nums" value={x.start} onChange={(e) => setDay(d, { start: e.target.value })} />
                          </label>
                          <label className="text-xs text-muted">
                            {t('workSchedule.form.end')}
                            <input type="time" className="input mt-1 min-h-10 py-1.5 tabular-nums" value={x.end} onChange={(e) => setDay(d, { end: e.target.value })} />
                          </label>
                          <label className="text-xs text-muted">
                            {t('workSchedule.form.break')}
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={600}
                              step={5}
                              className="input mt-1 min-h-10 py-1.5 tabular-nums"
                              value={x.breakMin}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v) && v >= 0 && v <= 600) setDay(d, { breakMin: Math.round(v) });
                              }}
                            />
                          </label>
                        </div>
                      )}
                      {!res.off && (
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
                          <span>{t('workSchedule.form.worked', { h: hm(res.work) })}</span>
                          {res.restBefore != null && <span className={clsx(res.restBefore < 660 && 'font-semibold text-warning-fg')}>{t('workSchedule.form.restBefore', { h: hm(res.restBefore) })}</span>}
                          {res.night && (
                            <span className="inline-flex items-center gap-1">
                              <Moon className="size-3" aria-hidden /> {t('workSchedule.form.night')}
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
                onClick={() => {
                  setInput(DEFAULT_SCHEDULE);
                  setPreset('nurse');
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
              </button>
            </form>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-24" aria-live="polite">
              <div className={clsx('rounded-3xl border p-5', r.status === 'ok' ? 'border-success-border bg-success-bg' : r.status === 'warnings' ? 'border-warning-border bg-warning-bg' : 'border-danger-border bg-danger-bg')}>
                <p className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                  <StatusIcon className="size-6 shrink-0" aria-hidden /> {t(`workSchedule.result.${r.status}`)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {r.weeks.map((m, n) => (
                    <div key={n}>
                      <dt className="text-xs text-muted">{t('workSchedule.result.week', { n: n + 1 })}</dt>
                      <dd className={clsx('font-semibold tabular-nums', m > 2_880 ? 'text-warning-fg' : 'text-ink')}>{hm(m)} h</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('workSchedule.result.findings')}</h2>
                {r.findings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t('workSchedule.result.none')}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {r.findings.map((f, k) => {
                      const Icon = f.severity === 'violation' ? XCircle : f.severity === 'warning' ? AlertTriangle : Info;
                      return (
                        <li key={k} className="rounded-xl border border-line p-3 text-sm">
                          <p className="flex items-start gap-2">
                            <Icon className={clsx('mt-0.5 size-4 shrink-0', f.severity === 'violation' ? 'text-danger-fg' : f.severity === 'warning' ? 'text-warning-fg' : 'text-muted')} aria-hidden />
                            <span className="text-ink">
                              <span className="font-semibold">{dayLabel(f.day)}:</span> {t(`workSchedule.codes.${f.code}`, { m: hm(f.minutes) })}
                            </span>
                          </p>
                          <p className="mt-1 pl-6 text-xs text-muted" translate="no">
                            {f.rule}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('workSchedule.rules.title')}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                  {(Array.isArray(t('workSchedule.rules.items', { returnObjects: true })) ? (t('workSchedule.rules.items', { returnObjects: true }) as string[]) : []).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>

              <GlossaryLinks
                terms={[
                  { slug: 'arbeitszeit', label: 'Arbeitszeit' },
                  { slug: 'schichtarbeit', label: 'Schichtarbeit' },
                  { slug: 'ueberstunden', label: 'Überstunden' },
                  { slug: 'tarifvertrag', label: 'Tarifvertrag' },
                  { slug: 'betriebsrat', label: 'Betriebsrat' },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Link to="/shift-pay-calculator" className={buttonClass({ variant: 'outline' })}>
                  <BadgeEuro className="size-4" aria-hidden /> {t('workSchedule.actions.shiftPay')}
                </Link>
                <Link to="/holiday-planner" className={buttonClass({ variant: 'ghost' })}>
                  {t('workSchedule.actions.holidays')}
                </Link>
              </div>
              <Disclaimer>{t('workSchedule.disclaimer')}</Disclaimer>
              <Sources checked={SCHEDULE_CHECKED} items={SOURCES} />
            </div>
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/work-schedule-check" />
    </>
  );
}
