import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Delete, Download, ExternalLink, Info, Languages, Link2, Minus, Nfc, Plus, RotateCcw, Stamp, Ticket, Trophy, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesTicketMachine } from '@/i18n/pagesTicketMachine';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { DEUTSCHLANDTICKET } from '@/lib/cities/data';
import { loadProgress, pickTx, saveProgress } from '@/lib/games/common';
import { TICKET_BEST_KEY } from '@/lib/games/street/progress';
import { useReadyReport } from '@/lib/readyProgress/sync';
import {
  CASH,
  GROUP_MAX,
  MAX_TASK_POINTS,
  PENALTY_FARE,
  PENALTY_REDUCED,
  START_STATION,
  TASK_ROUND,
  TICKET_AS_OF,
  TICKET_SOURCES,
  TICKET_TYPES,
  TYPE_DE,
  ZONES,
  changeCoins,
  choiceProblems,
  emptyChoice,
  needsStamp,
  newSeed,
  parseSeed,
  pickTasks,
  priceOf,
  scoreTask,
  searchStations,
  stationById,
  zoneFor,
  type TaskResult,
  type TicketChoice,
  type TicketTask,
  type Zone,
} from '@/lib/games/ticket/machine';

registerCopy(pagesGames);
registerCopy(pagesTicketMachine);

const PATH = '/ticket-machine';
type Screen = 'start' | 'dest' | 'zone' | 'type' | 'persons' | 'pay' | 'print';
type PayMethod = 'cash' | 'card' | 'contactless';

/** Euro without Intl (same on server and browser): "3,40 €". */
const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const ZONE_DE: Record<Zone, string> = { A: 'Tarifbereich A (Innenstadt)', AB: 'Tarifbereich AB (Stadtgebiet)', ABC: 'Tarifbereich ABC (mit Umland)' };
const KEYS = ['QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNM'];

/** A machine button: German label, optional translation under it (help toggle). */
const MBtn = ({ de, tx, onClick, active, disabled, wide, icon }: { de: string; tx?: string | null; onClick: () => void; active?: boolean; disabled?: boolean; wide?: boolean; icon?: ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active === undefined ? undefined : active}
    className={clsx(
      'flex min-h-12 flex-col items-start justify-center rounded-lg border-2 px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-40 motion-reduce:transition-none',
      active ? 'border-amber-300 bg-amber-300 text-slate-900' : 'border-slate-500 bg-slate-700 text-white hover:border-amber-300',
      wide && 'col-span-full',
    )}
  >
    <span className="flex items-center gap-1.5" lang="de">
      {icon} {de}
    </span>
    {tx && <span className={clsx('mt-0.5 text-xs font-normal', active ? 'text-slate-800' : 'text-slate-300')}>{tx}</span>}
  </button>
);

const Stepper = ({ de, tx, value, min, max, onChange, labels }: { de: string; tx?: string | null; value: number; min: number; max: number; onChange: (n: number) => void; labels: { less: string; more: string } }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-slate-500 bg-slate-700 px-3 py-2 text-white">
    <span>
      <span className="block text-sm font-semibold" lang="de">
        {de}
      </span>
      {tx && <span className="block text-xs text-slate-300">{tx}</span>}
    </span>
    <span className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid size-10 place-items-center rounded-md bg-slate-600 hover:bg-slate-500 disabled:opacity-40" aria-label={`${de}: ${labels.less}`}>
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="w-6 text-center text-lg font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid size-10 place-items-center rounded-md bg-slate-600 hover:bg-slate-500 disabled:opacity-40" aria-label={`${de}: ${labels.more}`}>
        <Plus className="size-4" aria-hidden />
      </button>
    </span>
  </div>
);

/** The printed ticket (slides out of the slot; no animation with reduced motion). */
const PrintedTicket = ({ c, printedAt, stampedAt }: { c: TicketChoice; printedAt: string; stampedAt: string | null }) => {
  const station = stationById(c.station);
  return (
    <div className="mx-auto w-full max-w-xs animate-[ticket-out_0.9s_ease-out] rounded-md border border-slate-300 bg-[#fffdf5] p-3 font-mono text-[12px] leading-snug text-slate-900 shadow-lg motion-reduce:animate-none" lang="de">
      <style>{'@keyframes ticket-out{from{transform:translateY(-40px);opacity:0}to{transform:none;opacity:1}}'}</style>
      <p className="flex justify-between border-b border-dashed border-slate-400 pb-1 font-bold">
        <span>MUSTERVERBUND</span>
        <span>{c.cls === 1 ? '1. Kl.' : '2. Kl.'}</span>
      </p>
      <p className="mt-1 font-bold">{TYPE_DE[c.type]}</p>
      <p>{ZONE_DE[c.zone]}</p>
      <p>
        {START_STATION} → {station ? station.name : '—'}
      </p>
      <p>
        {c.type === 'dayGroup' ? `${c.adults + c.children} Personen` : `${c.adults} Erw. · ${c.children} Kind`}
      </p>
      <p className="mt-1 flex justify-between border-t border-dashed border-slate-400 pt-1 font-bold">
        <span>Preis</span>
        <span>{eur(priceOf(c))}</span>
      </p>
      {needsStamp(c.type) ? (
        stampedAt ? (
          <p className="mt-2 inline-block -rotate-3 rounded border-2 border-violet-700 px-2 py-0.5 font-bold text-violet-700">ENTWERTET {stampedAt}</p>
        ) : (
          <p className="mt-2 font-bold text-red-700">Vor Fahrtantritt entwerten!</p>
        )
      ) : (
        <p className="mt-2">Gültig ab {printedAt} (bereits entwertet)</p>
      )}
      <p className="mt-2 text-[10px] text-slate-500">TRAININGSSIMULATION · KEIN GÜLTIGER FAHRSCHEIN</p>
    </div>
  );
};

const now = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * /ticket-machine — a GENERIC regional transport ticket machine (fictional "Musterverbund", neutral design, no
 * operator branding): machine UI in German, help in the visitor's language (toggle shows translations on the
 * buttons too). Destination via on-screen keyboard or direct fare zone, ticket type, persons, class, BahnCard
 * note, Deutschlandticket note, simulated payment (no card data is entered or sent), printed ticket and stamping.
 * Tasks mode: 5 seeded tasks scored by lib/games/ticket/machine (scoreTask), best score in localStorage.
 */
export default function TicketMachinePage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('ticket.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const brand = useBrand();
  const [params, setParams] = useSearchParams();
  const sharedSeed = parseSeed(params.get('seed'));
  const [mode, setMode] = useState<'free' | 'tasks'>(sharedSeed ? 'tasks' : 'free');
  const [seed, setSeed] = useState<number>(() => sharedSeed ?? 0);
  const tasks = useMemo<TicketTask[]>(() => (seed ? pickTasks(seed) : []), [seed]);
  const [taskIdx, setTaskIdx] = useState(0);
  const [results, setResults] = useState<TaskResult[]>([]);
  const [checked, setChecked] = useState<TaskResult | null>(null);
  const [best, setBest] = useState(0);
  useEffect(() => setBest(loadProgress<number>(TICKET_BEST_KEY, 0) || 0), []);
  const report = useReadyReport();

  const [helpTx, setHelpTx] = useState(true);
  const [screen, setScreen] = useState<Screen>('start');
  const [query, setQuery] = useState('');
  const [c, setC] = useState<TicketChoice>(emptyChoice);
  const [info, setInfo] = useState<'dticket' | 'bahncard' | null>(null);
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [inserted, setInserted] = useState(0);
  const [cardStep, setCardStep] = useState<0 | 1>(0);
  const [printedAt, setPrintedAt] = useState('');
  const [stampedAt, setStampedAt] = useState<string | null>(null);
  const [change, setChange] = useState<number[]>([]);

  const tx = (key: string) => (helpTx && !lng.startsWith('de') ? t(`ticket.ui.${key}`) : null);
  const price = priceOf(c);
  const problems = choiceProblems(c);
  const task = mode === 'tasks' ? tasks[taskIdx] : undefined;
  const total = results.reduce((s, r) => s + r.points, 0);
  const finished = mode === 'tasks' && tasks.length > 0 && results.length >= tasks.length;
  const stationList = searchStations(query);

  const reset = () => {
    setScreen('start');
    setQuery('');
    setC(emptyChoice());
    setInfo(null);
    setMethod(null);
    setInserted(0);
    setCardStep(0);
    setStampedAt(null);
    setChange([]);
    setChecked(null);
  };
  const set = (patch: Partial<TicketChoice>) => setC((prev) => ({ ...prev, ...patch }));

  const startTasks = (s: number) => {
    setMode('tasks');
    setSeed(s);
    setTaskIdx(0);
    setResults([]);
    reset();
    setParams(new URLSearchParams({ seed: String(s) }), { replace: true, preventScrollReset: true });
  };
  const switchMode = (m: 'free' | 'tasks') => {
    if (m === 'tasks') startTasks(seed || newSeed());
    else {
      setMode('free');
      reset();
      setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
    }
  };

  const print = () => {
    setPrintedAt(now());
    setScreen('print');
  };
  const insert = (v: number) => {
    const next = Math.round((inserted + v) * 100) / 100;
    setInserted(next);
    if (next >= price) {
      setChange(changeCoins(next, price));
      print();
    }
  };

  const check = () => {
    if (!task) return;
    const r = scoreTask(task, c);
    setChecked(r);
    setResults((prev) => [...prev, r]);
  };
  const nextTask = () => {
    if (taskIdx + 1 < tasks.length) setTaskIdx(taskIdx + 1);
    reset();
  };
  useEffect(() => {
    if (!finished) return;
    // "Germany ready" progress of signed-in clients (lib/readyProgress): one finished task round.
    report({ activityId: 'ticket-machine', item: 'tasks', score: total, max: TASK_ROUND * MAX_TASK_POINTS });
    if (total > best) {
      setBest(total);
      saveProgress(TICKET_BEST_KEY, total);
    }
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => ((await copyLink(`${window.location.origin}${localePath(PATH)}?seed=${seed}`)) ? toast.success(t('games.common.copied')) : toast.error(t('games.common.copyFailed')));
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('ticket.result.cardLead'),
        big: t('ticket.result.total', { score: total, max: TASK_ROUND * MAX_TASK_POINTS }),
        sub: t('ticket.result.cardSub', { valid: results.filter((r) => r.valid).length, n: results.length }),
        lines: tasks.map((tk, i) => `${pickTx(tk.text, lng)} — ${results[i]?.points ?? 0}`),
        footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
        filename: `ticket-machine-${total}`,
      });
    } catch {
      toast.error(t('games.common.cardFailed'));
    }
  };

  const station = stationById(c.station);
  const labels = { less: t('ticket.less'), more: t('ticket.more') };

  // Help text for the current screen (in the visitor's language), plus contextual notes.
  const help: ReactNode = (
    <div className="space-y-3 text-sm leading-relaxed text-ink">
      <p>{t(`ticket.help.${screen}`)}</p>
      {(screen === 'zone' || screen === 'type' || screen === 'dest') && <p className="rounded-xl bg-sunken p-3">{t('ticket.help.zoneExplain')}</p>}
      {screen === 'type' && (
        <ul className="space-y-1.5">
          {TICKET_TYPES.map((ty) => (
            <li key={ty}>
              <strong lang="de">{TYPE_DE[ty]}:</strong> {t(`ticket.help.types.${ty}`)}
            </li>
          ))}
        </ul>
      )}
      {screen === 'persons' && (
        <ul className="list-disc space-y-1.5 pl-5">
          <li>{t('ticket.help.children')}</li>
          <li>{t('ticket.help.cls')}</li>
          <li>{t('ticket.help.bahncard')}</li>
        </ul>
      )}
      {screen === 'pay' && <p className="rounded-xl border border-info-border bg-info-bg p-3 text-info-fg">{t('ticket.help.safe')}</p>}
      {screen === 'print' && <p>{needsStamp(c.type) ? t('ticket.help.stamp') : t('ticket.help.validated')}</p>}
      {(info === 'dticket' || screen === 'start') && (
        <p className={clsx('rounded-xl p-3', info === 'dticket' ? 'border border-warning-border bg-warning-bg' : 'bg-sunken')}>{t('ticket.help.dticket', { price: DEUTSCHLANDTICKET })}</p>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted">
        <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden /> {t('ticket.help.penalty', { fine: PENALTY_FARE, reduced: PENALTY_REDUCED })}
      </p>
    </div>
  );

  const mistakeText = (m: string, r: TaskResult) => t(`ticket.mistakes.${m}`, { fine: PENALTY_FARE, paid: eur(r.paid), best: eur(r.best) });

  return (
    <>
      <PageHero title={t('ticket.heroTitle')} subtitle={t('ticket.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x space-y-6">
          <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm text-warning-fg">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('ticket.disclaimer')}
          </p>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ticket.modeLabel')}>
            {(['free', 'tasks'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => switchMode(m)}
                className={clsx('min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors', mode === m ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink/80 hover:border-primary')}
              >
                {t(`ticket.modes.${m}`)}
              </button>
            ))}
            <label className="ml-auto inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" className="size-4 accent-[var(--tv-primary,#1f4f7d)]" checked={helpTx} onChange={(e) => setHelpTx(e.target.checked)} />
              <Languages className="size-4" aria-hidden /> {t('ticket.translations')}
            </label>
          </div>

          {mode === 'tasks' && task && !finished && (
            <div className="rounded-2xl border border-primary/40 bg-card p-4" aria-live="polite">
              <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{t('ticket.task.label', { n: taskIdx + 1, total: tasks.length })}</span>
                <span className="tabular-nums">
                  {t('games.common.score')}: {total}
                </span>
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-ink">{pickTx(task.text, lng)}</p>
              <p className="mt-1 text-xs text-muted">{t('ticket.task.hint', { start: START_STATION })}</p>
            </div>
          )}

          {finished ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7" aria-live="polite">
                <p className="text-sm font-semibold text-muted">{t('ticket.result.title')}</p>
                <p className="mt-1 font-display text-4xl font-semibold text-ink tabular-nums">{t('ticket.result.total', { score: total, max: TASK_ROUND * MAX_TASK_POINTS })}</p>
                <p className="mt-2 text-sm text-ink">{t(`ticket.result.grade.${total >= 450 ? 'top' : total >= 300 ? 'good' : 'low'}`)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <Trophy className="size-4" aria-hidden /> {t('games.common.best', { value: best })}
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => startTasks(newSeed())}>
                    <RotateCcw className="size-4" aria-hidden /> {t('ticket.result.again')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'outline', size: 'lg' })} onClick={() => void card()}>
                    <Download className="size-4" aria-hidden /> {t('games.common.card')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'lg' })} onClick={() => void share()}>
                    <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
                  </button>
                </div>
              </div>
              <ol className="space-y-2">
                {tasks.map((tk, i) => (
                  <li key={tk.id} className="rounded-2xl border border-line bg-card p-4 text-sm">
                    <p className="flex justify-between gap-3 font-semibold text-ink">
                      <span>{pickTx(tk.text, lng)}</span>
                      <span className="tabular-nums">{results[i]?.points ?? 0}</span>
                    </p>
                    {results[i]?.mistakes.map((m) => (
                      <p key={m} className="mt-1 text-muted">
                        • {mistakeText(m, results[i])}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
              {/* The machine: neutral grey cabinet, no operator branding. */}
              <div className="rounded-[2rem] border-4 border-slate-600 bg-slate-800 p-3 shadow-xl sm:p-4">
                <div className="flex items-center justify-between px-1 pb-2 text-xs font-bold uppercase tracking-widest text-slate-300" lang="de">
                  <span className="flex items-center gap-1.5">
                    <Ticket className="size-4" aria-hidden /> Fahrkartenautomat
                  </span>
                  <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] text-slate-900">Simulation</span>
                </div>
                <div className="min-h-[24rem] rounded-xl border-4 border-slate-900 bg-slate-900 p-3 sm:p-4" role="region" aria-label={t('ticket.screenLabel')} aria-live="polite">
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-700 pb-2 text-xs text-slate-300" lang="de">
                    <span>Start: {START_STATION}</span>
                    {screen !== 'start' && (
                      <button type="button" onClick={reset} className="rounded px-2 py-1 font-semibold text-amber-300 hover:bg-slate-800">
                        Abbrechen{tx('cancel') ? ` · ${tx('cancel')}` : ''}
                      </button>
                    )}
                  </div>

                  {screen === 'start' && (
                    <div className="space-y-3">
                      <p className="text-lg font-bold text-white" lang="de">
                        Willkommen! Bitte wählen Sie:
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <MBtn de="Fahrkarte kaufen (Ziel eingeben)" tx={tx('buy')} onClick={() => setScreen('dest')} />
                        <MBtn de="Tarifbereich direkt wählen" tx={tx('zoneDirect')} onClick={() => setScreen('zone')} />
                        <MBtn de="Deutschlandticket" tx={tx('dticket')} onClick={() => setInfo('dticket')} active={info === 'dticket'} />
                        <MBtn de="Sprache / Language" tx={tx('language')} icon={<Languages className="size-4" aria-hidden />} onClick={() => setHelpTx((v) => !v)} active={helpTx} />
                      </div>
                      {info === 'dticket' && (
                        <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-slate-900" lang="de">
                          Das Deutschlandticket gibt es nur im Abo (online, App oder Kundencenter) — nicht an diesem Automaten.
                        </p>
                      )}
                    </div>
                  )}

                  {screen === 'dest' && (
                    <div className="space-y-3">
                      <label htmlFor="tm-search" className="block text-sm font-bold text-white" lang="de">
                        Ziel eingeben {tx('search') && <span className="font-normal text-slate-300">· {tx('search')}</span>}
                      </label>
                      <input
                        id="tm-search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoComplete="off"
                        className="w-full rounded-md border-2 border-slate-500 bg-white px-3 py-2 font-mono text-lg uppercase text-slate-900 focus:border-amber-300 focus:outline-none"
                      />
                      <div className="space-y-1" aria-label={t('ticket.keyboard')} role="group">
                        {KEYS.map((row) => (
                          <div key={row} className="flex justify-center gap-1">
                            {row.split('').map((k) => (
                              <button key={k} type="button" onClick={() => setQuery((q) => q + k)} className="h-9 min-w-0 flex-1 rounded bg-slate-600 text-sm font-bold text-white hover:bg-slate-500 sm:h-10" aria-label={k}>
                                {k}
                              </button>
                            ))}
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setQuery((q) => `${q} `)} className="h-9 flex-[3] rounded bg-slate-600 text-xs font-bold text-white hover:bg-slate-500" lang="de">
                            Leertaste
                          </button>
                          <button type="button" onClick={() => setQuery((q) => q.slice(0, -1))} className="grid h-9 flex-1 place-items-center rounded bg-slate-600 text-white hover:bg-slate-500" aria-label={t('ticket.backspace')}>
                            <Delete className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                        {stationList.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => {
                                set({ station: s.id, zone: zoneFor(s) });
                                setScreen('type');
                              }}
                              className="flex w-full items-center justify-between rounded-md bg-slate-700 px-3 py-2 text-left text-sm text-white hover:bg-slate-600"
                              lang="de"
                            >
                              <span>{s.name}</span>
                              <span className="rounded bg-slate-900 px-1.5 text-xs text-amber-300">Zone {s.zone}</span>
                            </button>
                          </li>
                        ))}
                        {stationList.length === 0 && (
                          <li className="text-sm text-slate-300" lang="de">
                            Kein Ziel gefunden.
                          </li>
                        )}
                      </ul>
                    </div>
                  )}

                  {screen === 'zone' && (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-white" lang="de">
                        Tarifbereich wählen
                      </p>
                      <div className="grid gap-2">
                        {ZONES.map((z) => (
                          <MBtn
                            key={z}
                            de={ZONE_DE[z]}
                            tx={tx(`zone${z}`)}
                            onClick={() => {
                              set({ zone: z, station: null });
                              setScreen('type');
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {screen === 'type' && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300" lang="de">
                        {station ? `Ziel: ${station.name} (Zone ${station.zone})` : 'Ohne Ziel'} · {ZONE_DE[c.zone]}
                      </p>
                      <div className="flex flex-wrap gap-1" role="group" aria-label={t('ticket.zoneChange')}>
                        {ZONES.map((z) => (
                          <button key={z} type="button" aria-pressed={c.zone === z} onClick={() => set({ zone: z })} className={clsx('min-h-9 rounded px-3 text-xs font-bold', c.zone === z ? 'bg-amber-300 text-slate-900' : 'bg-slate-700 text-white hover:bg-slate-600')}>
                            {z}
                          </button>
                        ))}
                      </div>
                      <p className="text-sm font-bold text-white" lang="de">
                        Fahrkarte wählen
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {TICKET_TYPES.map((ty) => (
                          <MBtn
                            key={ty}
                            de={TYPE_DE[ty]}
                            tx={tx(`types.${ty}`)}
                            active={c.type === ty}
                            onClick={() => {
                              set({ type: ty });
                              setScreen('persons');
                            }}
                          />
                        ))}
                        <MBtn de="Deutschlandticket" tx={tx('dticket')} onClick={() => setInfo('dticket')} active={info === 'dticket'} />
                      </div>
                      {info === 'dticket' && (
                        <p className="rounded-lg bg-amber-100 p-3 text-sm font-semibold text-slate-900" lang="de">
                          Nur im Abo erhältlich — nicht an diesem Automaten.
                        </p>
                      )}
                    </div>
                  )}

                  {screen === 'persons' && (
                    <div className="space-y-2">
                      <p className="text-sm text-slate-300" lang="de">
                        {TYPE_DE[c.type]} · {ZONE_DE[c.zone]}
                      </p>
                      <Stepper de="Erwachsene" tx={tx('adults')} value={c.adults} min={0} max={9} onChange={(n) => set({ adults: n })} labels={labels} />
                      <Stepper de="Kinder (6–14 Jahre)" tx={tx('children')} value={c.children} min={0} max={9} onChange={(n) => set({ children: n })} labels={labels} />
                      <div className="grid grid-cols-2 gap-2">
                        <MBtn de="2. Klasse" tx={tx('cls2')} active={c.cls === 2} onClick={() => set({ cls: 2 })} />
                        <MBtn de="1. Klasse" tx={tx('cls1')} active={c.cls === 1} onClick={() => set({ cls: 1 })} />
                      </div>
                      <MBtn
                        de={c.bahncard ? 'BahnCard: nicht gültig für Verbundfahrkarten' : 'BahnCard-Rabatt?'}
                        tx={tx('bahncard')}
                        active={c.bahncard}
                        onClick={() => {
                          set({ bahncard: !c.bahncard });
                          setInfo('bahncard');
                        }}
                        wide
                      />
                      {problems.includes('groupTooBig') && (
                        <p className="rounded bg-red-200 p-2 text-sm font-semibold text-red-900" lang="de">
                          Gruppenkarte: höchstens {GROUP_MAX} Personen.
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-3 pt-2">
                        <p className="text-2xl font-bold text-amber-300 tabular-nums" lang="de">
                          {eur(price)}
                        </p>
                        <MBtn de="Weiter zur Bezahlung" tx={tx('toPay')} onClick={() => setScreen('pay')} disabled={problems.length > 0} />
                      </div>
                    </div>
                  )}

                  {screen === 'pay' && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-300" lang="de">
                        Zu zahlen
                      </p>
                      <p className="text-3xl font-bold text-amber-300 tabular-nums" lang="de">
                        {eur(Math.max(0, price - inserted))}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <MBtn de="Bargeld" tx={tx('cash')} active={method === 'cash'} onClick={() => setMethod('cash')} />
                        <MBtn de="Karte" tx={tx('card')} icon={<CreditCard className="size-4" aria-hidden />} active={method === 'card'} onClick={() => setMethod('card')} />
                        <MBtn de="Kontaktlos" tx={tx('contactless')} icon={<Nfc className="size-4" aria-hidden />} active={method === 'contactless'} onClick={() => setMethod('contactless')} />
                      </div>
                      {method === 'cash' && (
                        <div>
                          <p className="text-xs text-slate-300" lang="de">
                            Münzen / Scheine einwerfen · eingeworfen: {eur(inserted)}
                          </p>
                          <div className="mt-2 grid grid-cols-4 gap-1.5">
                            {CASH.map((v) => (
                              <button key={v} type="button" onClick={() => insert(v)} className={clsx('min-h-10 font-bold text-slate-900', v >= 5 ? 'rounded bg-emerald-200 hover:bg-emerald-100' : 'rounded-full bg-amber-200 hover:bg-amber-100')}>
                                {v >= 1 ? `${v} €` : `${Math.round(v * 100)} ct`}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {method === 'card' &&
                        (cardStep === 0 ? (
                          <MBtn de="Karte einstecken (simuliert)" tx={tx('insertCard')} onClick={() => setCardStep(1)} wide />
                        ) : (
                          <MBtn de="PIN am Gerät bestätigen (simuliert)" tx={tx('confirmPin')} onClick={print} wide />
                        ))}
                      {method === 'contactless' && <MBtn de="Karte oder Handy an das Lesefeld halten (simuliert)" tx={tx('tap')} icon={<Nfc className="size-4" aria-hidden />} onClick={print} wide />}
                    </div>
                  )}

                  {screen === 'print' && (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-white" lang="de">
                        Bitte entnehmen Sie Ihre Fahrkarte{change.length > 0 ? ` und das Rückgeld (${eur(change.reduce((s, v) => s + v, 0))})` : ''}.
                      </p>
                      <div className="rounded-lg bg-slate-950 px-3 pt-1 pb-3">
                        <div className="mx-auto mb-2 h-2 w-40 rounded-full bg-black" aria-hidden />
                        <PrintedTicket c={c} printedAt={printedAt} stampedAt={stampedAt} />
                      </div>
                      {needsStamp(c.type) && !stampedAt && (
                        <MBtn de="Im Entwerter stempeln" tx={tx('stamp')} icon={<Stamp className="size-4" aria-hidden />} onClick={() => setStampedAt(now())} wide />
                      )}
                      {mode === 'tasks' ? (
                        !checked && <MBtn de="Fahrkartenkontrolle!" tx={tx('check')} onClick={check} wide />
                      ) : (
                        <MBtn de="Neue Fahrkarte" tx={tx('newTicket')} onClick={reset} wide />
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex justify-center gap-6 text-[10px] uppercase tracking-widest text-slate-400" aria-hidden>
                  <span>Münzen</span>
                  <span>Karte</span>
                  <span>Fahrkarte</span>
                </div>
              </div>

              <div className="space-y-4 lg:sticky lg:top-24">
                {checked && task && (
                  <div className={clsx('rounded-3xl border p-4 sm:p-5', checked.valid && !checked.mistakes.length ? 'border-success-border bg-success-bg' : checked.valid ? 'border-warning-border bg-warning-bg' : 'border-danger-border bg-danger-bg')} aria-live="assertive">
                    <p className="flex items-center gap-2 font-semibold text-ink">
                      {checked.valid ? <CheckCircle2 className="size-5 text-success-fg" aria-hidden /> : <XCircle className="size-5 text-danger-fg" aria-hidden />}
                      {checked.valid ? t('ticket.check.valid') : t('ticket.check.invalid', { fine: PENALTY_FARE })} · {t('ticket.check.points', { n: checked.points })}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-ink">
                      {checked.mistakes.length === 0 && <li>{t('ticket.check.perfect')}</li>}
                      {checked.mistakes.map((m) => (
                        <li key={m}>• {mistakeText(m, checked)}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted">{t('ticket.check.prices', { paid: eur(checked.paid), best: eur(checked.best) })}</p>
                    <button type="button" className={clsx(buttonClass({ size: 'md' }), 'mt-3')} onClick={nextTask} autoFocus>
                      {taskIdx + 1 < tasks.length ? t('ticket.check.next') : t('ticket.check.finish')} <ArrowRight className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
                <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
                  <h2 className="mb-2 font-display text-lg font-semibold text-ink">{t('ticket.helpTitle')}</h2>
                  {help}
                </div>
              </div>
            </div>
          )}

          <section aria-labelledby="tm-notes" className="space-y-2 text-sm leading-relaxed text-ink">
            <h2 id="tm-notes" className="font-display text-lg font-semibold">
              {t('ticket.notes.title')}
            </h2>
            <p>{t('ticket.notes.text', { fine: PENALTY_FARE, reduced: PENALTY_REDUCED, price: DEUTSCHLANDTICKET })}</p>
            <p className="text-xs text-muted">{t('games.common.asOf', { date: TICKET_AS_OF.split('-').reverse().join('.') })}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {TICKET_SOURCES.map((s) => (
                <li key={s.key}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                    {s.label} <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                </li>
              ))}
              <li>
                <Link to="/glossary/deutschlandticket" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('games.common.glossary')}: Deutschlandticket
                </Link>
              </li>
              <li>
                <Link to="/weekend-trips" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('ticket.notes.trips')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
              <li>
                <Link to="/german-street" className="inline-flex min-h-10 items-center gap-1 font-semibold text-link hover:underline">
                  {t('ticket.notes.street')} <ArrowRight className="size-4" aria-hidden />
                </Link>
              </li>
            </ul>
          </section>

          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
