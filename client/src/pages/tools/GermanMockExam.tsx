import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Clock, Download, Ear, ExternalLink, GraduationCap, Info, Mic, PenLine, RotateCcw, Send, XCircle, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { EmailResult } from '@/components/tools/EmailResult';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { PartView, type ExamApi } from '@/components/germanExam/Parts';
import { useScriptSpeech } from '@/components/germanExam/useScriptSpeech';
import { downloadResultCard } from '@/components/games/shareCard';
import { registerCopy } from '@/i18n';
import { pagesMockExam } from '@/i18n/pagesMockExam';
import { usePageTitle } from '@/lib/usePageTitle';
import { mmss } from '@/lib/games/common';
import { MOCK_EXAM_FAQ } from '@/lib/germanExam/faq';
import { clearModule, emptySaved, expireDeadlines, loadSaved, storeSaved, type SavedExam } from '@/lib/germanExam/progress';
import { examOutcome, grade, moduleResult, secondsLeft, type ModuleResult } from '@/lib/germanExam/scoring';
import { findSet, setsOf } from '@/lib/germanExam/sets';
import type { ExamLevel, ExamModule, ExamSet, ModuleKey } from '@/lib/germanExam/types';

registerCopy(pagesMockExam);

const MODULE_ICON: Record<ModuleKey, LucideIcon> = { hoeren: Ear, lesen: BookOpen, schreiben: PenLine, sprechen: Mic };
const MODULE_DE: Record<ModuleKey, string> = { hoeren: 'Hören', lesen: 'Lesen', schreiben: 'Schreiben', sprechen: 'Sprechen' };
const SOURCES: Record<ExamLevel, string> = {
  a1: 'https://www.goethe.de/resources/files/pdf325/durchfuehrungsbestimmungen_a1_start_deutsch_1.pdf',
  b1: 'https://www.goethe.de/resources/files/pdf325/durchfuehrungsbestimmungen_b1-1.pdf',
};
const LEVEL_PATH = (l: ExamLevel) => `/german-mock-exam/${l}`;

type View = { kind: 'overview' } | { kind: 'run'; module: ModuleKey } | { kind: 'review'; module: ModuleKey };

/** Ticks every second while `on` (timer display); the server render and first client render use 0. */
const useNow = (on: boolean) => {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  return now;
};

const PassBadge = ({ passed, orientation }: { passed: boolean; orientation?: boolean }) => {
  const { t } = useTranslation();
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', passed ? 'border-success-border bg-success-bg text-success-fg' : 'border-danger-border bg-danger-bg text-danger-fg')}>
      {passed ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
      {orientation ? t('mockExam.result.orientation') : passed ? t('mockExam.result.passed') : t('mockExam.result.failed')}
    </span>
  );
};

const Faq = ({ items, title }: { items: { q: string; a: string }[]; title: string }) => (
  <section aria-labelledby="mock-faq-h" className="space-y-3">
    <h2 id="mock-faq-h" className="font-display text-xl font-semibold text-ink">
      {title}
    </h2>
    {items.map((f) => (
      <details key={f.q} className="group rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer list-none font-semibold text-ink marker:hidden">
          <span className="flex items-start justify-between gap-3">
            {f.q} <ArrowRight className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
          </span>
        </summary>
        <p className="mt-2 text-sm leading-relaxed text-ink">{f.a}</p>
      </details>
    ))}
  </section>
);

const useFaq = () => {
  const { i18n } = useTranslation();
  const lng = (i18n.resolvedLanguage ?? 'az').slice(0, 2) as keyof typeof MOCK_EXAM_FAQ;
  return MOCK_EXAM_FAQ[lng] ?? MOCK_EXAM_FAQ.en;
};

/** Structure table of a set (= the real exam's module structure) with the official rules and source. */
const Structure = ({ set }: { set: ExamSet }) => {
  const { t } = useTranslation();
  const level = set.level;
  return (
    <section aria-labelledby="mock-structure-h" className="space-y-3 rounded-3xl border border-line bg-card p-4 sm:p-6">
      <h2 id="mock-structure-h" className="font-display text-xl font-semibold text-ink">
        {t('mockExam.structure.title')}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t('mockExam.structure.colModule')}
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                {t('mockExam.structure.colTime')}
              </th>
              <th scope="col" className="py-2 font-semibold">
                {t('mockExam.structure.colParts')}
              </th>
            </tr>
          </thead>
          <tbody>
            {set.modules.map((m) => (
              <tr key={m.key} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 font-semibold text-ink">
                  {t(`mockExam.modules.${m.key}`)} <span className="font-normal text-muted">({MODULE_DE[m.key]})</span>
                </th>
                <td className="py-2 pr-3 tabular-nums text-ink">
                  {t('mockExam.overview.minutes', { n: m.minutes })}
                  {m.prepMinutes ? ` ${t('mockExam.overview.prep', { n: m.prepMinutes })}` : ''}
                </td>
                <td className="py-2 tabular-nums text-ink">{m.parts.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
        <li>{t(level === 'a1' ? 'mockExam.structure.a1Pass' : 'mockExam.structure.b1Pass')}</li>
        <li>{t(level === 'a1' ? 'mockExam.structure.a1Speaking' : 'mockExam.structure.b1Speaking')}</li>
        <li>{t('mockExam.structure.playsNote')}</li>
      </ul>
      <p className="text-sm">
        <a href={SOURCES[level]} className="inline-flex items-center gap-1 font-semibold text-link hover:underline" target="_blank" rel="noopener noreferrer">
          {t('mockExam.structure.source', { level: level === 'a1' ? 'A1: Start Deutsch 1' : 'B1' })} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </p>
      <p className="text-xs text-muted">{t('mockExam.structure.asOf')}</p>
    </section>
  );
};

const Disclaimer = () => {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-3 text-sm leading-relaxed text-warning-fg" role="note">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('mockExam.disclaimer')}
    </p>
  );
};

const MoreLinks = ({ level }: { level?: ExamLevel }) => {
  const { t } = useTranslation();
  const other: ExamLevel | null = level === 'a1' ? 'b1' : level === 'b1' ? 'a1' : null;
  const links: { to: string; label: string }[] = [
    { to: '/german-level-test-self', label: t('mockExam.links.selfTest') },
    ...(other ? [{ to: LEVEL_PATH(other), label: t('mockExam.links.otherLevel', { level: other.toUpperCase() }) }] : []),
    { to: '/account/german', label: t('mockExam.links.account') },
    { to: '/pronunciation', label: t('mockExam.links.pronunciation') },
    { to: '/german-simulator', label: t('mockExam.links.simulator') },
  ];
  return (
    <section aria-labelledby="mock-links-h" className="space-y-3">
      <h2 id="mock-links-h" className="font-display text-xl font-semibold text-ink">
        {t('mockExam.links.title')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="flex min-h-12 items-center justify-between gap-2 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold text-ink hover:border-line-strong hover:bg-sunken">
              {l.label} <ArrowRight className="size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <GlossaryChips slugs={['sprachzertifikat', 'integrationskurs', 'auslaenderbehoerde']} />
    </section>
  );
};

/** /german-mock-exam: choose A1 or B1. */
const Hub = () => {
  const { t } = useTranslation();
  usePageTitle(t('mockExam.hubTitle'));
  const faq = useFaq();
  return (
    <>
      <PageHero title={t('mockExam.hubTitle')} subtitle={t('mockExam.hubSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-4xl space-y-8">
          <p className="inline-flex rounded-full border border-line bg-sunken px-3 py-1 text-xs font-semibold text-muted">{t('mockExam.independent')}</p>
          <section aria-labelledby="mock-levels-h" className="space-y-3">
            <h2 id="mock-levels-h" className="font-display text-xl font-semibold text-ink">
              {t('mockExam.chooseLevel')}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {(['a1', 'b1'] as const).map((l) => {
                const set = setsOf(l)[0];
                const total = set.modules.reduce((s, m) => s + m.minutes + (m.prepMinutes ?? 0), 0);
                return (
                  <li key={l}>
                    <Link to={LEVEL_PATH(l)} className="group flex h-full flex-col gap-3 rounded-3xl border border-line bg-card p-5 transition-colors hover:border-primary/40 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40">
                      <span className="flex items-center gap-3">
                        <span className="grid size-12 place-items-center rounded-2xl chip-soft font-display text-lg font-bold">{l.toUpperCase()}</span>
                        <span className="font-display text-lg font-semibold text-ink">{t(`mockExam.${l}Title`)}</span>
                      </span>
                      <span className="text-sm leading-relaxed text-muted">{t(l === 'a1' ? 'mockExam.hubA1' : 'mockExam.hubB1')}</span>
                      <span className="flex flex-wrap gap-1.5 text-xs text-muted">
                        {set.modules.map((m) => (
                          <span key={m.key} className="rounded-full border border-line px-2 py-0.5">
                            {t(`mockExam.modules.${m.key}`)}
                          </span>
                        ))}
                        <span className="rounded-full border border-line px-2 py-0.5 tabular-nums">≈ {t('mockExam.overview.minutes', { n: total })}</span>
                      </span>
                      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-link">
                        {t('mockExam.open')} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <Disclaimer />
          <MoreLinks />
          <Faq items={faq} title={t('mockExam.faqTitle')} />
        </div>
      </section>
      <RelatedGuides tool="/german-mock-exam" />
    </>
  );
};

/** Module timer bar while a module runs. */
const RunBar = ({ module, deadline, now, onSubmit, onBack }: { module: ExamModule; deadline: number; now: number; onSubmit: () => void; onBack: () => void }) => {
  const { t } = useTranslation();
  const left = now ? secondsLeft(deadline, now) : (module.minutes + (module.prepMinutes ?? 0)) * 60;
  const low = left < 5 * 60;
  return (
    <div className="sticky top-16 z-20 -mx-4 border-b border-line bg-card/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={onBack} title={t('mockExam.run.back')}>
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">{t('mockExam.run.back')}</span>
        </button>
        <p className={clsx('flex items-center gap-1.5 text-sm font-semibold tabular-nums', low ? 'text-danger-fg' : 'text-ink')} role="timer" aria-live={low ? 'polite' : 'off'}>
          <Clock className="size-4" aria-hidden /> {t('mockExam.run.timeLeft')}: {mmss(left)}
        </p>
        <button type="button" className={buttonClass({ size: 'sm' })} onClick={onSubmit}>
          <Send className="size-4" aria-hidden /> {t('mockExam.run.submit')}
        </button>
      </div>
    </div>
  );
};

const ResultPanel = ({ set, saved }: { set: ExamSet; saved: SavedExam }) => {
  const { t } = useTranslation();
  const level = set.level;
  const done = Object.fromEntries(set.modules.filter((m) => saved.done[m.key]).map((m) => [m.key, moduleResult(level, m, saved.answers)])) as Partial<Record<ModuleKey, ModuleResult>>;
  const outcome = examOutcome(level, set.modules, done);
  if (!outcome.modules.length) return null;
  const pts = (r: ModuleResult) => (level === 'a1' ? r.points.toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(r.points));
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('mockExam.result.cardLead', { level: level.toUpperCase() }),
        big: outcome.total !== null ? `${outcome.total} / 100` : `${outcome.modules.filter((r) => r.passed).length} / ${set.modules.length}`,
        sub: outcome.passed === null ? undefined : outcome.passed ? t('mockExam.result.passed') : t('mockExam.result.failed'),
        lines: outcome.modules.map((r) => `${MODULE_DE[r.key]}: ${pts(r)} / ${r.pointsMax}`),
        footer: t('mockExam.result.cardFooter'),
        filename: `mock-exam-${level}`,
      });
    } catch {
      toast.error(t('mockExam.result.cardFailed'));
    }
  };
  return (
    <section aria-labelledby="mock-result-h" className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mock-result-h" className="text-sm font-semibold text-muted">
            {t('mockExam.result.title')}
          </h2>
          {outcome.total !== null ? (
            <p className="mt-1 flex flex-wrap items-center gap-3 font-display text-3xl font-semibold text-ink">
              {t('mockExam.result.total', { points: outcome.total })}
              <PassBadge passed={!!outcome.passed} />
              <span className="text-base font-normal text-muted">{t(`mockExam.result.grades.${grade(outcome.total)}`)}</span>
            </p>
          ) : outcome.passed !== null ? (
            <p className="mt-1">
              <PassBadge passed={outcome.passed} />
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink">{t('mockExam.result.incomplete')}</p>
          )}
        </div>
        <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => void card()}>
          <Download className="size-4" aria-hidden /> {t('mockExam.result.download')}
        </button>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {outcome.modules.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
            <span className="text-sm font-semibold text-ink">{t(`mockExam.modules.${r.key}`)}</span>
            <span className="flex items-center gap-2 text-sm tabular-nums text-ink">
              {t('mockExam.result.points', { points: pts(r), max: r.pointsMax })}
              <PassBadge passed={r.passed} orientation={level === 'a1'} />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t(level === 'a1' ? 'mockExam.result.a1Note' : 'mockExam.result.b1Note')}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{t('mockExam.result.selfScored')}</p>
      <EmailResult
        tool={`german-mock-exam/${level}`}
        countUse="mount"
        className="mt-4"
        summary={[
          {
            label: t('mockExam.result.cardLead', { level: level.toUpperCase() }),
            value:
              outcome.total !== null
                ? `${t('mockExam.result.total', { points: outcome.total })} · ${outcome.passed ? t('mockExam.result.passed') : t('mockExam.result.failed')}`
                : outcome.passed !== null
                  ? outcome.passed
                    ? t('mockExam.result.passed')
                    : t('mockExam.result.failed')
                  : t('mockExam.result.incomplete'),
          },
          ...outcome.modules.map((r) => ({ label: t(`mockExam.modules.${r.key}`), value: t('mockExam.result.points', { points: pts(r), max: r.pointsMax }) })),
        ]}
      />
    </section>
  );
};

/** /german-mock-exam/a1 and /b1: overview → module (timer) → review; progress in localStorage. */
const LevelExam = ({ level }: { level: ExamLevel }) => {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const sets = setsOf(level);
  const set = findSet(level, params.get('set'));
  usePageTitle(t(`mockExam.${level}Title`));
  const faq = useFaq();
  const speech = useScriptSpeech();
  const [saved, setSaved] = useState<SavedExam>(emptySaved);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: 'overview' });
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'reset' } | { kind: 'redo'; module: ModuleKey } | { kind: 'submit'; module: ModuleKey; open: number }>(null);
  const [recordings, setRecordings] = useState<Record<string, string>>({});
  const recRef = useRef(recordings);
  recRef.current = recordings;
  const top = useRef<HTMLDivElement>(null);

  // Load after mount (server render: empty); expire modules whose time ran out while the page was closed.
  useEffect(() => {
    setSaved(expireDeadlines(loadSaved(set.id), Date.now()));
    setLoaded(true);
    setView({ kind: 'overview' });
  }, [set.id]);
  useEffect(() => {
    if (loaded) storeSaved(set.id, saved);
  }, [saved, loaded, set.id]);
  useEffect(() => () => Object.values(recRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  const update = useCallback((fn: (s: SavedExam) => SavedExam) => setSaved((s) => fn(s)), []);
  const go = (v: View) => {
    speech.stop();
    setView(v);
    setOnlyMistakes(false);
    window.requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const runningModule = view.kind === 'run' ? set.modules.find((m) => m.key === view.module) : undefined;
  const deadline = runningModule ? saved.deadlines[runningModule.key] : undefined;
  const now = useNow(!!deadline);

  const finish = useCallback(
    (key: ModuleKey, timeUp = false) => {
      speech.stop();
      update((s) => {
        const deadlines = { ...s.deadlines };
        delete deadlines[key];
        return { ...s, done: { ...s.done, [key]: new Date().toISOString() }, deadlines };
      });
      if (timeUp) toast.info(t('mockExam.run.timeUp'));
      go({ kind: 'review', module: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [update, t],
  );

  useEffect(() => {
    if (runningModule && deadline && now && now >= deadline) finish(runningModule.key, true);
  }, [now, deadline, runningModule, finish]);

  const start = (m: ExamModule) => {
    update((s) => (s.deadlines[m.key] ? s : { ...s, deadlines: { ...s.deadlines, [m.key]: Date.now() + (m.minutes + (m.prepMinutes ?? 0)) * 60_000 } }));
    go({ kind: 'run', module: m.key });
  };
  const redo = (key: ModuleKey) => {
    const m = set.modules.find((x) => x.key === key)!;
    update((s) => clearModule(s, m));
    for (const p of m.parts) {
      const u = recordings[p.id];
      if (u) URL.revokeObjectURL(u);
    }
    setRecordings((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !m.parts.some((p) => p.id === k))));
    start(m);
  };
  const askSubmit = (m: ExamModule) => {
    const open = m.parts.reduce((n, p) => n + (p.type === 'choice' ? p.questions.filter((q) => saved.answers.choice[q.id] === undefined).length : p.type === 'form' ? p.fields.filter((f) => !saved.answers.form[f.id]?.trim()).length : 0), 0);
    if (open) setConfirm({ kind: 'submit', module: m.key, open });
    else finish(m.key);
  };

  const api: ExamApi = {
    set,
    saved,
    choose: (qid, index) => update((s) => ({ ...s, answers: { ...s.answers, choice: { ...s.answers.choice, [qid]: index } } })),
    fill: (fid, value) => update((s) => ({ ...s, answers: { ...s.answers, form: { ...s.answers.form, [fid]: value.slice(0, 80) } } })),
    write: (pid, text) => update((s) => ({ ...s, texts: { ...s.texts, [pid]: text.slice(0, 4000) } })),
    tick: (pid, rid, on) =>
      update((s) => {
        const cur = new Set(s.answers.rubric[pid] ?? []);
        if (on) cur.add(rid);
        else cur.delete(rid);
        return { ...s, answers: { ...s.answers, rubric: { ...s.answers.rubric, [pid]: [...cur] } } };
      }),
    consumePlay: (sid, limit) => {
      const used = saved.plays[sid] ?? 0;
      if (used >= limit) return false;
      update((s) => ({ ...s, plays: { ...s.plays, [sid]: (s.plays[sid] ?? 0) + 1 } }));
      return true;
    },
    revealTranscript: (sid) => update((s) => (s.transcripts.includes(sid) ? s : { ...s, transcripts: [...s.transcripts, sid] })),
    recordings,
    setRecording: (pid, url) =>
      setRecordings((r) => {
        const next = { ...r };
        if (url) next[pid] = url;
        else delete next[pid];
        return next;
      }),
    speech,
  };

  /** Running task number of the first question of each part (Aufgabe 1 … n per module). */
  const startNos = (m: ExamModule) => {
    let n = 1;
    return m.parts.map((p) => {
      const s = n;
      n += p.type === 'choice' ? p.questions.length : 0;
      return s;
    });
  };

  const reviewModule = view.kind === 'review' ? set.modules.find((m) => m.key === view.module) : undefined;
  const nextModule = reviewModule ? set.modules.find((m) => !saved.done[m.key] && m.key !== reviewModule.key) : undefined;

  return (
    <>
      <PageHero title={t(`mockExam.${level}Title`)} subtitle={t(`mockExam.${level}Subtitle`)} crumb={{ to: '/german-mock-exam', label: t('mockExam.hubTitle') }} />
      <section className="section">
        <div ref={top} className="container-x max-w-4xl scroll-mt-24 space-y-6">
          {runningModule && deadline ? (
            <>
              <RunBar module={runningModule} deadline={deadline} now={now} onSubmit={() => askSubmit(runningModule)} onBack={() => go({ kind: 'overview' })} />
              <h2 className="flex items-center gap-2 font-display text-2xl font-semibold text-ink">
                {(() => {
                  const I = MODULE_ICON[runningModule.key];
                  return <I className="size-6 text-primary" aria-hidden />;
                })()}
                {t(`mockExam.modules.${runningModule.key}`)} <span className="text-base font-normal text-muted">({MODULE_DE[runningModule.key]})</span>
              </h2>
              {runningModule.key === 'hoeren' && <p className="text-xs text-muted">{t('mockExam.audio.voiceNote')}</p>}
              {runningModule.prepMinutes ? <p className="text-sm text-muted">{t('mockExam.structure.b1Speaking')}</p> : null}
              {runningModule.parts.map((p, i) => (
                <PartView key={p.id} part={p} n={i + 1} mode="run" api={api} startNo={startNos(runningModule)[i]} />
              ))}
              <div className="flex justify-end">
                <button type="button" className={buttonClass({ size: 'lg' })} onClick={() => askSubmit(runningModule)}>
                  <Send className="size-4" aria-hidden /> {t('mockExam.run.submit')}
                </button>
              </div>
            </>
          ) : reviewModule ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => go({ kind: 'overview' })}>
                  <ArrowLeft className="size-4" aria-hidden /> {t('mockExam.review.back')}
                </button>
                {reviewModule.parts.some((p) => p.type === 'choice') && (
                  <div className="flex gap-1 rounded-xl border border-line p-1" role="group">
                    {[false, true].map((only) => (
                      <button
                        key={String(only)}
                        type="button"
                        aria-pressed={onlyMistakes === only}
                        onClick={() => setOnlyMistakes(only)}
                        className={clsx('min-h-9 rounded-lg px-3 text-sm font-semibold', onlyMistakes === only ? 'bg-primary text-primary-contrast' : 'text-ink hover:bg-sunken')}
                      >
                        {only ? t('mockExam.review.onlyMistakes') : t('mockExam.review.all')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ModuleScore set={set} module={reviewModule} saved={saved} />
              {reviewModule.parts.map((p, i) => (
                <PartView key={p.id} part={p} n={i + 1} mode="review" api={api} startNo={startNos(reviewModule)[i]} onlyMistakes={onlyMistakes} />
              ))}
              <div className="flex flex-wrap justify-between gap-2">
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => go({ kind: 'overview' })}>
                  <ArrowLeft className="size-4" aria-hidden /> {t('mockExam.review.back')}
                </button>
                {nextModule && (
                  <button type="button" className={buttonClass()} onClick={() => (saved.deadlines[nextModule.key] ? go({ kind: 'run', module: nextModule.key }) : start(nextModule))}>
                    {t('mockExam.review.next')}: {t(`mockExam.modules.${nextModule.key}`)} <ArrowRight className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="inline-flex rounded-full border border-line bg-sunken px-3 py-1 text-xs font-semibold text-muted">{t('mockExam.independent')}</p>
                {sets.length > 1 && (
                  <label className="ml-auto flex items-center gap-2 text-sm">
                    <span className="font-semibold text-ink">{t('mockExam.setLabel')}</span>
                    <select className="input min-h-10 w-auto py-1" value={set.id} onChange={(e) => setParams(new URLSearchParams({ set: e.target.value }), { replace: true })}>
                      {sets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <ResultPanel set={set} saved={saved} />
              <ul className="grid gap-3 sm:grid-cols-2">
                {set.modules.map((m) => {
                  const I = MODULE_ICON[m.key];
                  const isDone = !!saved.done[m.key];
                  const running = !!saved.deadlines[m.key] && !isDone;
                  const r = isDone ? moduleResult(level, m, saved.answers) : null;
                  return (
                    <li key={m.key} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
                      <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">
                          <I className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-ink">
                            {t(`mockExam.modules.${m.key}`)} <span className="font-normal text-muted">({MODULE_DE[m.key]})</span>
                          </h3>
                          <p className="text-xs text-muted tabular-nums">
                            {t('mockExam.overview.minutes', { n: m.minutes })}
                            {m.prepMinutes ? ` ${t('mockExam.overview.prep', { n: m.prepMinutes })}` : ''} · {t('mockExam.overview.parts', { n: m.parts.length })}
                          </p>
                        </div>
                        <span className={clsx('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', isDone ? 'border-success-border bg-success-bg text-success-fg' : running ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-line bg-sunken text-muted')}>
                          {isDone ? t('mockExam.overview.done') : running ? t('mockExam.overview.inProgress') : t('mockExam.overview.notStarted')}
                        </span>
                      </div>
                      {r && (
                        <p className="flex items-center gap-2 text-sm tabular-nums text-ink">
                          {t('mockExam.result.points', { points: level === 'a1' ? r.points.toLocaleString(undefined, { maximumFractionDigits: 1 }) : r.points, max: r.pointsMax })}
                          <span className="text-muted">· {t('mockExam.result.raw', { raw: r.raw, max: r.max })}</span>
                          <PassBadge passed={r.passed} orientation={level === 'a1'} />
                        </p>
                      )}
                      <div className="mt-auto flex flex-wrap gap-2">
                        {isDone ? (
                          <>
                            <button type="button" className={buttonClass({ size: 'sm' })} onClick={() => go({ kind: 'review', module: m.key })}>
                              <ClipboardCheck className="size-4" aria-hidden /> {t('mockExam.overview.review')}
                            </button>
                            <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => setConfirm({ kind: 'redo', module: m.key })}>
                              <RotateCcw className="size-4" aria-hidden /> {t('mockExam.overview.redo')}
                            </button>
                          </>
                        ) : (
                          <button type="button" className={buttonClass({ size: 'sm' })} onClick={() => (running ? go({ kind: 'run', module: m.key }) : start(m))} disabled={!loaded}>
                            <GraduationCap className="size-4" aria-hidden /> {running ? t('mockExam.overview.continue') : t('mockExam.overview.start')}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                <span>{t('mockExam.overview.saved')}</span>
                <button type="button" className="min-h-10 font-semibold text-link hover:underline" onClick={() => setConfirm({ kind: 'reset' })}>
                  {t('mockExam.overview.resetAll')}
                </button>
              </div>
              <Disclaimer />
              <Structure set={set} />
              <MoreLinks level={level} />
              <Faq items={faq} title={t('mockExam.faqTitle')} />
            </>
          )}
        </div>
      </section>
      {view.kind === 'overview' && <RelatedGuides tool={LEVEL_PATH(level)} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone={confirm?.kind === 'submit' ? 'primary' : 'danger'}
        title={confirm?.kind === 'submit' ? t('mockExam.run.submit') : confirm?.kind === 'redo' ? t('mockExam.overview.redo') : t('mockExam.overview.resetAll')}
        message={confirm?.kind === 'submit' ? t('mockExam.run.confirmSubmit', { n: confirm.open }) : confirm?.kind === 'redo' ? t('mockExam.overview.confirmRedo') : t('mockExam.overview.confirmReset')}
        confirmLabel={confirm?.kind === 'submit' ? t('mockExam.run.submit') : confirm?.kind === 'redo' ? t('mockExam.overview.redo') : t('mockExam.overview.resetAll')}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.kind === 'submit') finish(c.module);
          else if (c.kind === 'redo') redo(c.module);
          else {
            Object.values(recordings).forEach((u) => URL.revokeObjectURL(u));
            setRecordings({});
            setSaved(emptySaved());
            go({ kind: 'overview' });
          }
        }}
      />
    </>
  );
};

/** Score line at the top of a module review. */
const ModuleScore = ({ set, module, saved }: { set: ExamSet; module: ExamModule; saved: SavedExam }) => {
  const { t } = useTranslation();
  const r = moduleResult(set.level, module, saved.answers);
  const selfScored = module.parts.some((p) => p.type === 'writing' || p.type === 'speaking');
  const perfect = !selfScored && r.raw === r.max;
  return (
    <div className="rounded-3xl border border-primary/30 bg-card p-5 sm:p-6" aria-live="polite">
      <h2 className="font-display text-2xl font-semibold text-ink">{t('mockExam.review.title', { module: t(`mockExam.modules.${module.key}`) })}</h2>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-lg tabular-nums text-ink">
        <span className="font-semibold">{t('mockExam.result.points', { points: set.level === 'a1' ? r.points.toLocaleString(undefined, { maximumFractionDigits: 1 }) : r.points, max: r.pointsMax })}</span>
        <span className="text-sm text-muted">{t('mockExam.result.raw', { raw: r.raw, max: r.max })}</span>
        <PassBadge passed={r.passed} orientation={set.level === 'a1'} />
      </p>
      {perfect && <p className="mt-2 text-sm font-semibold text-success-fg">{t('mockExam.review.perfect')}</p>}
      {selfScored && <p className="mt-2 text-sm text-muted">{t('mockExam.result.selfScored')}</p>}
    </div>
  );
};

/**
 * /german-mock-exam (level choice), /german-mock-exam/a1, /german-mock-exam/b1 — independent practice tests in the
 * module structure of the Goethe-Zertifikat A1 / B1 (lib/germanExam). Everything runs in the browser: listening via
 * speechSynthesis, optional recording via MediaRecorder (kept in memory), progress in localStorage. No AI marking:
 * writing and speaking are self-scored with a rubric next to a model answer.
 */
export default function GermanMockExamPage({ level }: { level?: ExamLevel }) {
  return level ? <LevelExam key={level} level={level} /> : <Hub />;
}

