import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, BadgeEuro, Briefcase, CheckCircle2, Copy, Info, Plus, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { registerCopy } from '@/i18n';
import { pagesDrivingTime } from '@/i18n/pagesDrivingTime';
import { usePageTitle } from '@/lib/usePageTitle';
import {
  BLOCK_KINDS,
  checkDriver,
  DAY,
  DAY_PRESETS,
  DEFAULT_DRIVER,
  DRIVING_CHECKED,
  hm,
  WEEK_PRESETS,
  type Block,
  type BlockKind,
  type DayPreset,
  type DriverFinding,
  type DriverInput,
  type WeekPreset,
} from '@/lib/publicCalc/drivingTime';
import { Disclaimer, GlossaryLinks, Sources, ToolFaq, useFaq, useMoney } from '@/components/tools/calc/CalcShared';

registerCopy(pagesDrivingTime);

const SOURCES = [
  { label: 'VO (EG) Nr. 561/2006 – Lenk- und Ruhezeiten (EUR-Lex)', url: 'https://eur-lex.europa.eu/eli/reg/2006/561/oj' },
  { label: '§ 21a ArbZG – Beschäftigung im Straßentransport', url: 'https://www.gesetze-im-internet.de/arbzg/__21a.html' },
  { label: '§§ 3, 4 ArbZG – Arbeitszeit und Ruhepausen', url: 'https://www.gesetze-im-internet.de/arbzg/BJNR117100994.html' },
  { label: '§ 8a FPersG – Bußgeld Unternehmen (Abs. 1, bis 30.000 €) und Fahrer (Abs. 2, bis 5.000 €)', url: 'https://www.gesetze-im-internet.de/fahrpersstg/__8a.html' },
  { label: 'IHK Schleswig-Holstein – Lenk- und Ruhezeiten, Bußgeldkataloge Fahrpersonalrecht (LASI LV 48)', url: 'https://www.ihk.de/schleswig-holstein/produktmarken/branchen/verkehrswirtschaft/regeln-pflichten-verkehrsgewerbe/sozialvorschriften-lenk-und-ruhezeiten-im-strassenverkehr-1355012' },
];

const KIND_COLOR: Record<BlockKind, string> = {
  drive: 'bg-sky-500',
  work: 'bg-amber-500',
  break: 'bg-emerald-500',
  rest: 'bg-slate-300 dark:bg-slate-600',
};

const ARBZG_CODES = new Set(['arbzgWeek60', 'arbzgWeek48', 'arbzgDay', 'arbzgBreak', 'arbzgSixHours']);

/** 24-h bar of one day (unplanned time = rest). */
const DayBar = ({ blocks, label }: { blocks: Block[]; label: string }) => {
  const used = blocks.reduce((s, b) => s + b.minutes, 0);
  const parts = used < DAY ? [...blocks, { kind: 'rest' as const, minutes: DAY - used }] : blocks;
  const total = Math.max(DAY, used);
  return (
    <div className="relative" role="img" aria-label={label}>
      <div className="flex h-4 w-full overflow-hidden rounded-full border border-line">
        {parts.map((b, k) => (
          <span key={k} className={clsx('h-full', KIND_COLOR[b.kind])} style={{ width: `${(b.minutes / total) * 100}%` }} />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted tabular-nums" aria-hidden>
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
};

/**
 * /driving-time-calculator — lorry / bus driver timeline (one or two weeks) checked against VO (EG) 561/2006 and
 * §21a ArbZG, with indicative fines. All maths in lib/publicCalc/drivingTime.ts; nothing is sent or stored.
 */
export default function DrivingTimeCalculatorPage() {
  const { t } = useTranslation();
  usePageTitle(t('drivingTime.heroTitle'));
  const money = useMoney();
  const faq = useFaq('drivingTime.faq');
  const [input, setInput] = useState<DriverInput>(DEFAULT_DRIVER);
  const [preset, setPreset] = useState<WeekPreset | null>('legal');
  const r = useMemo(() => checkDriver(input), [input]);
  const weekdays = t('drivingTime.weekdays', { returnObjects: true }) as unknown;
  const rulesRaw = t('drivingTime.rules.items', { returnObjects: true }) as unknown;
  const rules = Array.isArray(rulesRaw) ? (rulesRaw as string[]) : [];
  const wd = (d: number) => (Array.isArray(weekdays) ? String(weekdays[d % 7]) : String(d + 1));
  const dayLabel = (d: number) => (input.days.length > 7 ? t('drivingTime.dayWeek', { day: wd(d), week: Math.floor(d / 7) + 1 }) : wd(d));

  const setDays = (fn: (days: Block[][]) => Block[][]) => {
    setPreset(null);
    setInput((i) => ({ days: fn(i.days.map((d) => d.map((b) => ({ ...b })))) }));
  };
  const setBlock = (d: number, k: number, patch: Partial<Block>) => setDays((days) => ((days[d][k] = { ...days[d][k], ...patch }), days));
  const removeBlock = (d: number, k: number) => setDays((days) => (days[d].splice(k, 1), days));
  const addBlock = (d: number) => setDays((days) => (days[d].push({ kind: 'drive', minutes: 60 }), days));
  const applyDay = (d: number, p: DayPreset) => setDays((days) => ((days[d] = DAY_PRESETS[p].map((b) => ({ ...b }))), days));
  const copyPrev = (d: number) => setDays((days) => ((days[d] = days[d - 1].map((b) => ({ ...b }))), days));
  const setWeeks = (n: 1 | 2) =>
    setDays((days) => (n === 2 ? [...days.slice(0, 7), ...days.slice(0, 7).map((d) => d.map((b) => ({ ...b })))] : days.slice(0, 7)));

  const findingText = (f: DriverFinding) => t(`drivingTime.codes.${f.code}`, { m: hm(f.minutes) });
  const statusIcon = { ok: CheckCircle2, warnings: AlertTriangle, violations: XCircle }[r.status];
  const StatusIcon = statusIcon;

  return (
    <>
      <PageHero title={t('drivingTime.heroTitle')} subtitle={t('drivingTime.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{t('drivingTime.presets.title')}:</span>
            {(Object.keys(WEEK_PRESETS) as WeekPreset[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={preset === k}
                className={clsx('inline-flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold', preset === k ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken')}
                onClick={() => {
                  setInput(WEEK_PRESETS[k]());
                  setPreset(k);
                }}
              >
                {t(`drivingTime.presets.${k}`)}
              </button>
            ))}
            <span className="ml-auto inline-flex rounded-xl border border-line bg-card p-1" role="group" aria-label={t('drivingTime.weeks.label')}>
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={input.days.length === n * 7}
                  className={clsx('min-h-9 rounded-lg px-3 text-sm font-semibold', input.days.length === n * 7 ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
                  onClick={() => setWeeks(n)}
                >
                  {t(n === 1 ? 'drivingTime.weeks.one' : 'drivingTime.weeks.two')}
                </button>
              ))}
            </span>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-xs text-muted" aria-hidden>
                {BLOCK_KINDS.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5">
                    <span className={clsx('size-3 rounded-sm', KIND_COLOR[k])} /> {t(`drivingTime.kinds.${k}`)}
                  </span>
                ))}
              </div>
              <p className="text-sm text-muted">{t('drivingTime.editor.hint')}</p>
              {input.days.map((blocks, d) => {
                const used = blocks.reduce((s, b) => s + b.minutes, 0);
                return (
                  <fieldset key={d} className="rounded-2xl border border-line bg-card p-3 sm:p-4">
                    <legend className="sr-only">{dayLabel(d)}</legend>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-ink">{dayLabel(d)}</h3>
                      <span className={clsx('text-xs tabular-nums', used > DAY ? 'font-semibold text-danger-fg' : 'text-muted')}>
                        {t('drivingTime.editor.planned', { h: hm(used) })}
                      </span>
                    </div>
                    <div className="mt-2">
                      <DayBar blocks={blocks} label={t('drivingTime.editor.barLabel', { day: dayLabel(d) })} />
                    </div>
                    <ul className="mt-3 space-y-2">
                      {blocks.map((b, k) => (
                        <li key={k} className="flex items-center gap-2">
                          <span className={clsx('size-3 shrink-0 rounded-sm', KIND_COLOR[b.kind])} aria-hidden />
                          <select
                            className="input min-h-10 flex-1 py-1.5"
                            aria-label={t('drivingTime.editor.kind', { n: k + 1 })}
                            value={b.kind}
                            onChange={(e) => setBlock(d, k, { kind: e.target.value as BlockKind })}
                          >
                            {BLOCK_KINDS.map((x) => (
                              <option key={x} value={x}>
                                {t(`drivingTime.kinds.${x}`)}
                              </option>
                            ))}
                          </select>
                          <label className="relative w-28 shrink-0">
                            <span className="sr-only">{t('drivingTime.editor.duration', { n: k + 1 })}</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0.25}
                              max={24}
                              step={0.25}
                              className="input min-h-10 py-1.5 pr-7 tabular-nums"
                              value={Math.round((b.minutes / 60) * 100) / 100}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (Number.isFinite(v) && v > 0 && v <= 24) setBlock(d, k, { minutes: Math.round((v * 60) / 5) * 5 });
                              }}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted">h</span>
                          </label>
                          <span className="hidden w-12 text-right text-xs tabular-nums text-muted sm:inline">{hm(b.minutes)}</span>
                          <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} aria-label={t('drivingTime.editor.remove', { n: k + 1 })} onClick={() => removeBlock(d, k)}>
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => addBlock(d)}>
                        <Plus className="size-4" aria-hidden /> {t('drivingTime.editor.add')}
                      </button>
                      {d > 0 && (
                        <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => copyPrev(d)}>
                          <Copy className="size-4" aria-hidden /> {t('drivingTime.editor.copyPrev')}
                        </button>
                      )}
                      <label className="ml-auto">
                        <span className="sr-only">{t('drivingTime.editor.template', { day: dayLabel(d) })}</span>
                        <select
                          className="input min-h-9 py-1 text-sm"
                          value=""
                          onChange={(e) => e.target.value && applyDay(d, e.target.value as DayPreset)}
                        >
                          <option value="">{t('drivingTime.editor.templatePlaceholder')}</option>
                          {(Object.keys(DAY_PRESETS) as DayPreset[]).map((p) => (
                            <option key={p} value={p}>
                              {t(`drivingTime.dayPresets.${p}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                );
              })}
              <button
                type="button"
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
                onClick={() => {
                  setInput(DEFAULT_DRIVER);
                  setPreset('legal');
                }}
              >
                <RotateCcw className="size-4" aria-hidden /> {t('calcCommon.reset')}
              </button>
            </div>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-24" aria-live="polite">
              <div
                className={clsx(
                  'rounded-3xl border p-5',
                  r.status === 'ok' ? 'border-success-border bg-success-bg' : r.status === 'warnings' ? 'border-warning-border bg-warning-bg' : 'border-danger-border bg-danger-bg',
                )}
              >
                <p className="flex items-center gap-2 font-display text-xl font-bold text-ink">
                  <StatusIcon className="size-6 shrink-0" aria-hidden /> {t(`drivingTime.result.${r.status}`)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {r.weeks.map((w, n) => (
                    <div key={n} className="col-span-2 grid grid-cols-2 gap-2">
                      <div>
                        <dt className="text-xs text-muted">{t('drivingTime.result.weekDrive', { n: n + 1 })}</dt>
                        <dd className={clsx('font-semibold tabular-nums', w.drive > 3_360 ? 'text-danger-fg' : 'text-ink')}>{hm(w.drive)} / 56:00</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">{t('drivingTime.result.weekWork', { n: n + 1 })}</dt>
                        <dd className={clsx('font-semibold tabular-nums', w.drive + w.work > 3_600 ? 'text-danger-fg' : 'text-ink')}>{hm(w.drive + w.work)} / 48:00</dd>
                      </div>
                    </div>
                  ))}
                  {r.twoWeeks != null && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted">{t('drivingTime.result.twoWeeks')}</dt>
                      <dd className={clsx('font-semibold tabular-nums', r.twoWeeks > 5_400 ? 'text-danger-fg' : 'text-ink')}>{hm(r.twoWeeks)} / 90:00</dd>
                    </div>
                  )}
                </dl>
              </div>
              <EmailResult
                tool="driving-time-calculator"
                summary={[
                  { label: t('drivingTime.result.findings'), value: t(`drivingTime.result.${r.status}`) },
                  ...r.weeks.flatMap((w, n) => [
                    { label: t('drivingTime.result.weekDrive', { n: n + 1 }), value: `${hm(w.drive)} / 56:00` },
                    { label: t('drivingTime.result.weekWork', { n: n + 1 }), value: `${hm(w.drive + w.work)} / 48:00` },
                  ]),
                  ...(r.twoWeeks != null ? [{ label: t('drivingTime.result.twoWeeks'), value: `${hm(r.twoWeeks)} / 90:00` }] : []),
                  ...r.findings.slice(0, 3).map((f) => ({ label: dayLabel(f.day), value: findingText(f) })),
                ]}
              />

              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('drivingTime.result.findings')}</h2>
                {r.findings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t('drivingTime.result.none')}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {r.findings.map((f, k) => {
                      const Icon = f.severity === 'violation' ? XCircle : f.severity === 'warning' ? AlertTriangle : Info;
                      return (
                        <li key={k} className="rounded-xl border border-line p-3 text-sm">
                          <p className="flex items-start gap-2">
                            <Icon className={clsx('mt-0.5 size-4 shrink-0', f.severity === 'violation' ? 'text-danger-fg' : f.severity === 'warning' ? 'text-warning-fg' : 'text-muted')} aria-hidden />
                            <span className="text-ink">
                              <span className="font-semibold">{dayLabel(f.day)}:</span> {findingText(f)}
                            </span>
                          </p>
                          <p className="mt-1 pl-6 text-xs text-muted">
                            <span translate="no">{f.rule}</span>
                            {f.severity === 'violation' &&
                              (f.fine ? (
                                <> · {t('drivingTime.result.fine', { driver: money(f.fine.driver), company: money(f.fine.company) })}</>
                              ) : (
                                <> · {t(ARBZG_CODES.has(f.code) ? 'drivingTime.result.fineArbzg' : 'drivingTime.result.fineMax')}</>
                              ))}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {r.fines.driver + r.fines.company > 0 && (
                  <div className="mt-3 rounded-xl bg-sunken p-3 text-sm">
                    <p className="font-semibold text-ink">{t('drivingTime.result.finesTotal', { driver: money(r.fines.driver), company: money(r.fines.company) })}</p>
                    <p className="mt-1 text-xs text-muted">{t('drivingTime.result.fineNote')}</p>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                <h2 className="font-display text-lg font-semibold text-ink">{t('drivingTime.rules.title')}</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
                  {rules.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>

              <GlossaryLinks
                terms={[
                  { slug: 'arbeitszeit', label: 'Arbeitszeit' },
                  { slug: 'ueberstunden', label: 'Überstunden' },
                  { slug: 'schichtarbeit', label: 'Schichtarbeit' },
                  { slug: 'tarifvertrag', label: 'Tarifvertrag' },
                  { slug: 'fuehrerschein-umschreibung', label: 'Führerschein-Umschreibung' },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Link to="/shift-pay-calculator" className={buttonClass({ variant: 'outline' })}>
                  <BadgeEuro className="size-4" aria-hidden /> {t('drivingTime.actions.shiftPay')}
                </Link>
                <Link to="/jobs" className={buttonClass({ variant: 'ghost' })}>
                  <Briefcase className="size-4" aria-hidden /> {t('drivingTime.actions.jobs')}
                </Link>
              </div>
              <Disclaimer>{t('drivingTime.disclaimer')}</Disclaimer>
              <Sources checked={DRIVING_CHECKED} items={SOURCES} />
            </div>
          </div>
        </div>
      </section>
      <ToolFaq items={faq} />
      <RelatedGuides tool="/driving-time-calculator" />
    </>
  );
}
