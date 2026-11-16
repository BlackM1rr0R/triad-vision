import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Info, Languages, MessageSquareQuote, RotateCcw, ShieldCheck, Snail, Volume2, XCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GlossaryChips } from '@/components/glossary/GlossaryChips';
import { HotspotMap } from '@/components/hotspots/HotspotMap';
import { useSpeak } from '@/components/games/useSpeak';
import { registerCopy } from '@/i18n';
import { pagesWorkScenes } from '@/i18n/pagesWorkScenes';
import { usePageTitle } from '@/lib/usePageTitle';
import { pickTx } from '@/lib/games/common';
import { SCENE_META, WORK_SCENES_PATH, sceneMeta } from '@/lib/workScenes/meta';
import { WORK_SCENES_AS_OF, type SceneSpot, type WorkScene } from '@/lib/workScenes/types';
import { answerQuiz, currentTarget, isFinished, nextQuestion, quizOptions, quizPercent, startQuiz, type QuizItem, type QuizState } from '@/lib/workScenes/quiz';

registerCopy(pagesWorkScenes);

/** Speak buttons (normal / slow) for a German text; nothing on the server render or without speech synthesis. */
const SpeakButtons = ({ id, text }: { id: string; text: string }) => {
  const { t } = useTranslation();
  const { available, speaking, speak } = useSpeak();
  if (!available) return null;
  return (
    <span className="inline-flex gap-1">
      <button type="button" onClick={() => speak(id, text)} aria-label={`${t('ws.labels.listen')}: ${text}`} title={t('ws.labels.listen')} className={clsx('grid size-10 place-items-center rounded-lg border border-line hover:bg-sunken', speaking === id && 'border-primary text-primary')}>
        <Volume2 className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => speak(`${id}-slow`, text, 0.6)} aria-label={`${t('ws.labels.listenSlow')}: ${text}`} title={t('ws.labels.listenSlow')} className={clsx('grid size-10 place-items-center rounded-lg border border-line hover:bg-sunken', speaking === `${id}-slow` && 'border-primary text-primary')}>
        <Snail className="size-4" aria-hidden />
      </button>
    </span>
  );
};

const Detail = ({ spot, n, total }: { spot: SceneSpot; n: number; total: number }) => {
  const { t, i18n } = useTranslation();
  const tx = (v: SceneSpot['name']) => pickTx(v, i18n.language);
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('ws.point', { n, total })}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-semibold text-ink" lang="de">
          {spot.de}
        </h2>
        <SpeakButtons id={spot.id} text={spot.de} />
      </div>
      {spot.plural && (
        <p className="text-sm text-muted">
          {t('ws.labels.plural')}: <span lang="de">{spot.plural}</span>
        </p>
      )}
      <p className="flex items-center gap-1.5 text-base font-semibold text-ink">
        <Languages className="size-4 text-info-fg" aria-hidden /> {tx(spot.name)}
      </p>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Info className="size-4 text-info-fg" aria-hidden /> {t('ws.labels.what')}
        </h3>
        <p className="mt-1 text-sm text-ink/85">{tx(spot.what)}</p>
      </div>
      <div className="rounded-xl border border-warning-border bg-warning-bg p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-warning-fg">
          <ShieldCheck className="size-4" aria-hidden /> {t('ws.labels.safety')}
        </h3>
        <p className="mt-1 text-sm text-warning-fg">{tx(spot.safety)}</p>
      </div>
      <div className="rounded-xl border border-danger-border bg-danger-bg p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-danger-fg">
          <AlertTriangle className="size-4" aria-hidden /> {t('ws.labels.mistake')}
        </h3>
        <p className="mt-1 text-sm text-danger-fg">{tx(spot.mistake)}</p>
      </div>
      <div className="rounded-xl bg-sunken p-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <MessageSquareQuote className="size-4 text-muted" aria-hidden /> {t('ws.labels.example')}
        </h3>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-sm italic text-ink" lang="de">
            {spot.example}
          </p>
          <SpeakButtons id={`${spot.id}-ex`} text={spot.example} />
        </div>
      </div>
      {spot.glossary && spot.glossary.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('ws.labels.glossary')}</h3>
          <GlossaryChips slugs={spot.glossary} className="mt-1.5 flex flex-wrap gap-2" />
        </div>
      )}
    </div>
  );
};

/** Quiz panel: the four options for the highlighted hotspot, feedback, and the result at the end. */
const QuizPanel = ({ scene, state, setState, onExit }: { scene: WorkScene; state: QuizState | null; setState: (s: QuizState | null) => void; onExit: () => void }) => {
  const { t, i18n } = useTranslation();
  const items: QuizItem[] = scene.spots;
  const target = state ? currentTarget(state) : null;
  // Options are fixed per question (memo on the target id), shuffled on the client after the user starts.
  const options = useMemo(() => (target ? quizOptions(target, items) : []), [target]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = (id: string) => scene.spots.find((s) => s.id === id)!;

  if (!state) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink/85">{t('ws.quiz.intro')}</p>
        <button type="button" className="btn-primary min-h-11 px-5" onClick={() => setState(startQuiz(items))}>
          {t('ws.quiz.start')}
        </button>
      </div>
    );
  }

  if (isFinished(state)) {
    return (
      <div className="space-y-4">
        <p className="font-display text-2xl font-semibold text-ink">{t('ws.quiz.result', { correct: state.correct, total: state.order.length, percent: quizPercent(state) })}</p>
        {state.missed.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-ink">{t('ws.quiz.review')}</p>
            <ul className="mt-2 space-y-1.5">
              {state.missed.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-sm">
                  <span>
                    <strong lang="de">{byId(id).de}</strong> — {pickTx(byId(id).name, i18n.language)}
                  </span>
                  <SpeakButtons id={`miss-${id}`} text={byId(id).de} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary inline-flex min-h-11 items-center gap-1.5 px-5" onClick={() => setState(startQuiz(items))}>
            <RotateCcw className="size-4" aria-hidden /> {t('ws.quiz.again')}
          </button>
          <button type="button" className="btn-secondary min-h-11 px-5" onClick={onExit}>
            {t('ws.quiz.back')}
          </button>
        </div>
      </div>
    );
  }

  const answered = state.answer !== null;
  const right = target ? byId(target) : null;
  const last = state.index === state.order.length - 1;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{t('ws.quiz.progress', { n: state.index + 1, total: state.order.length })}</span>
        <span>{t('ws.quiz.score', { correct: state.correct })}</span>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">{t('ws.quiz.question')}</h2>
      <ul className="grid gap-2">
        {options.map((o) => {
          const isRight = o.id === target;
          const chosen = state.answer === o.id;
          return (
            <li key={o.id}>
              <button
                type="button"
                lang="de"
                disabled={answered}
                onClick={() => setState(answerQuiz(state, o.id))}
                className={clsx(
                  'flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-4 text-left font-semibold transition-colors',
                  !answered && 'border-line bg-card text-ink hover:border-primary',
                  answered && isRight && 'border-success-border bg-success-bg text-success-fg',
                  answered && chosen && !isRight && 'border-danger-border bg-danger-bg text-danger-fg',
                  answered && !isRight && !chosen && 'border-line bg-card text-muted',
                )}
              >
                {o.de}
                {answered && isRight && <CheckCircle2 className="size-5" aria-hidden />}
                {answered && chosen && !isRight && <XCircle className="size-5" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      {answered && right && (
        <div className="space-y-3" aria-live="polite">
          <p className={clsx('text-sm font-semibold', state.answer === target ? 'text-success-fg' : 'text-danger-fg')}>
            {state.answer === target ? t('ws.quiz.correct') : `${t('ws.quiz.wrong')} ${right.de}`}
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-sunken px-3 py-2 text-sm">
            <span>
              <strong lang="de">{right.de}</strong> — {pickTx(right.name, i18n.language)}
            </span>
            <SpeakButtons id={`q-${right.id}`} text={right.de} />
          </div>
          <button type="button" className="btn-primary inline-flex min-h-11 items-center gap-1.5 px-5" onClick={() => setState(nextQuestion(state))}>
            {last ? t('ws.quiz.finish') : t('ws.quiz.next')} <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * One work scene (/work-scenes/<scene>): the self-drawn workplace with numbered hotspots (shared engine
 * components/hotspots/HotspotMap, as /german-apartment), a detail panel per hotspot (German term with article,
 * read aloud in de-DE, translation, explanation, safety rule, common mistake, example, glossary links), a
 * "Quiz me" mode (highlighted hotspot, pick the German word from four), the full crawlable word list, sources
 * with the as-of date, and links to the portal vocabulary, the job search and the other scenes.
 * The selected point lives in the URL (?spot=…) so it can be shared.
 */
export function WorkScenePage({ scene, art }: { scene: WorkScene; art: ReactNode }) {
  const { t, i18n } = useTranslation();
  const meta = sceneMeta(scene.id);
  const title = t(`ws.scenes.${scene.id}.title`);
  usePageTitle(title);
  const [params, setParams] = useSearchParams();
  const selected = scene.spots.find((s) => s.id === params.get('spot')) ?? null;
  const [mode, setMode] = useState<'explore' | 'quiz'>('explore');
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const total = scene.spots.length;
  const numberOf = (id: string) => scene.spots.findIndex((s) => s.id === id) + 1;
  const tx = (v: SceneSpot['name']) => pickTx(v, i18n.language);
  const quizTarget = mode === 'quiz' && quiz ? currentTarget(quiz) : null;

  const select = (id: string, focusPanel = false) => {
    const p = new URLSearchParams(params);
    p.set('spot', id);
    setParams(p, { replace: true, preventScrollReset: true });
    if (focusPanel) requestAnimationFrame(() => panelRef.current?.focus());
  };
  const step = (dir: 1 | -1) => {
    const i = selected ? scene.spots.findIndex((h) => h.id === selected.id) : -1;
    const next = scene.spots[(i + dir + total) % total];
    if (next) select(next.id);
  };

  const spots = scene.spots.map((s) => {
    const n = numberOf(s.id);
    if (mode === 'quiz') {
      const isTarget = s.id === quizTarget;
      return { id: s.id, x: s.x, y: s.y, content: isTarget ? '?' : n, label: isTarget ? t('ws.quiz.target') : String(n), target: isTarget, hidden: !isTarget };
    }
    return { id: s.id, x: s.x, y: s.y, content: n, label: `${n}. ${s.de}`, title: s.de, active: selected?.id === s.id };
  });

  return (
    <>
      <PageHero title={title} subtitle={t(`ws.scenes.${scene.id}.subtitle`)} crumb={{ to: WORK_SCENES_PATH, label: t('ws.hubTitle') }} />
      <section className="section">
        <div className="container-x space-y-4">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ws.modeLabel')}>
            {(['explore', 'quiz'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={clsx('inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors', mode === m ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink/80 hover:border-primary')}
              >
                {m === 'quiz' && <GraduationCap className="size-4" aria-hidden />}
                {t(m === 'explore' ? 'ws.modeExplore' : 'ws.modeQuiz')}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{mode === 'explore' ? t('ws.howTo') : t('ws.quiz.intro')}</p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
            <HotspotMap
              width={scene.width}
              height={scene.height}
              mapLabel={t('ws.mapLabel', { count: total })}
              zoomLabels={{ in: t('ws.zoomIn'), out: t('ws.zoomOut'), reset: t('ws.zoomReset') }}
              onSelect={(id) => (mode === 'explore' ? select(id, true) : undefined)}
              spots={spots}
            >
              <div className="overflow-hidden rounded-2xl">{art}</div>
            </HotspotMap>

            <div
              ref={panelRef}
              tabIndex={-1}
              aria-live="polite"
              className="rounded-3xl border border-line bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus sm:p-5 lg:sticky lg:top-24"
              onKeyDown={(e) => {
                if (mode !== 'explore') return;
                if (e.key === 'ArrowRight') step(1);
                if (e.key === 'ArrowLeft') step(-1);
              }}
            >
              {mode === 'quiz' ? (
                <QuizPanel scene={scene} state={quiz} setState={setQuiz} onExit={() => setMode('explore')} />
              ) : (
                <>
                  {selected ? <Detail spot={selected} n={numberOf(selected.id)} total={total} /> : <p className="text-sm text-muted">{t('ws.empty')}</p>}
                  <div className="mt-4 flex justify-between gap-2 border-t border-line pt-3">
                    <button type="button" onClick={() => step(-1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                      <ChevronLeft className="size-4" aria-hidden /> {t('ws.prev')}
                    </button>
                    <button type="button" onClick={() => step(1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-ink/80 hover:bg-sunken">
                      {t('ws.next')} <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Portal vocabulary + job search for this profession */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <GraduationCap className="size-5 text-primary" aria-hidden /> {t('ws.vocabTitle')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('ws.vocabText', { field: t(`ws.fields.${meta.vocabField}`) })}</p>
              <Link to="/account/german" className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link underline hover:text-link-hover">
                {t('ws.vocabLink')} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            <div className="rounded-3xl border border-line bg-card p-4 sm:p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                <Briefcase className="size-5 text-primary" aria-hidden /> {t('ws.jobsLink', { q: meta.jobSearch })}
              </h2>
              <Link to={`/jobs?search=${encodeURIComponent(meta.jobSearch)}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link underline hover:text-link-hover">
                {t('ws.jobsLink', { q: meta.jobSearch })} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>

          {/* All words (also the crawlable / no-picture version) */}
          <section aria-labelledby="ws-list" className="pt-4">
            <h2 id="ws-list" className="font-display text-2xl font-semibold text-ink">
              {t('ws.listTitle')}
            </h2>
            <ul className="mt-4 grid gap-2 md:grid-cols-2">
              {scene.spots.map((s) => (
                <li key={s.id}>
                  <details className="group rounded-lg bg-sunken px-3 py-2" open={selected?.id === s.id || undefined}>
                    <summary className="cursor-pointer text-sm font-semibold text-ink marker:text-muted">
                      {numberOf(s.id)}. <span lang="de">{s.de}</span> — <span className="font-normal">{tx(s.name)}</span>
                    </summary>
                    <p className="mt-2 text-sm text-ink/85">{tx(s.what)}</p>
                    <p className="mt-1.5 text-sm text-warning-fg">
                      <strong>{t('ws.labels.safety')}:</strong> {tx(s.safety)}
                    </p>
                    <p className="mt-1.5 text-sm text-danger-fg">
                      <strong>{t('ws.labels.mistake')}:</strong> {tx(s.mistake)}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ws-sources" className="rounded-3xl border border-line bg-card p-4 sm:p-5">
            <h2 id="ws-sources" className="font-display text-lg font-semibold text-ink">
              {t('ws.sourcesTitle')}
            </h2>
            <p className="mt-2 text-sm text-ink/85">{t('ws.sourcesText', { asOf: WORK_SCENES_AS_OF })}</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {scene.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline hover:text-link-hover">
                    {s.label} <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="ws-more" className="space-y-3">
            <h2 id="ws-more" className="font-display text-lg font-semibold text-ink">
              {t('ws.otherScenes')}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SCENE_META.filter((m) => m.id !== scene.id).map((m) => (
                <li key={m.id}>
                  <Link to={m.path} className="group flex h-full flex-col rounded-2xl border border-line bg-card p-4 transition-colors hover:border-line-strong hover:bg-sunken">
                    <span className="flex items-center gap-1 text-sm font-semibold text-ink">
                      {t(`ws.scenes.${m.id}.title`)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-0.5 text-xs leading-snug text-muted">{t(`ws.scenes.${m.id}.teaser`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </section>
      <RelatedGuides tool={meta.path} />
    </>
  );
}
