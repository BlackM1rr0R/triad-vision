import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookA, Banknote, Briefcase, CheckCircle2, CircleAlert, Download, Flame, HeartPulse, Info, Landmark, Languages, Link2, Phone, Play, RotateCcw, Square, Trophy, Volume2, XCircle, type LucideIcon } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { copyLink, downloadResultCard } from '@/components/games/shareCard';
import { useSpeak } from '@/components/games/useSpeak';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesGermanSimulator } from '@/i18n/pagesGermanSimulator';
import { useBrand } from '@/lib/brand';
import { localePath } from '@/lib/localeRouter';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, pickTx, saveProgress, seededRandom, shuffle } from '@/lib/games/common';
import { SCENES, sceneById } from '@/lib/games/simulator/scenes';
import { scorePath, type Outcome, type Scene, type Step } from '@/lib/games/simulator/types';

registerCopy(pagesGames);
registerCopy(pagesGermanSimulator);

const PATH = '/german-simulator';
const BEST_KEY = 'simulator.best';
const ICONS: Record<string, LucideIcon> = { anmeldung: Landmark, bank: Banknote, doctor: HeartPulse, work: Briefcase, heating: Flame };
const OUTCOME_TONE: Record<Outcome, string> = {
  success: 'border-success-border bg-success-bg text-success-fg',
  partial: 'border-warning-border bg-warning-bg text-warning-fg',
  fail: 'border-danger-border bg-danger-bg text-danger-fg',
};

/** Stable reply order per node (so the good reply is not always first), the same on every render. */
const orderFor = (sceneId: string, nodeId: string) => {
  let h = 0;
  for (const ch of `${sceneId}:${nodeId}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return shuffle([0, 1, 2], seededRandom(h));
};

const SceneList = ({ best, onPick }: { best: Record<string, number>; onPick: (id: string) => void }) => {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'az';
  return (
    <section aria-labelledby="sim-pick-h">
      <h2 id="sim-pick-h" className="font-display text-xl font-semibold text-ink">
        {t('simulator.pick')}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {SCENES.map((s) => {
          const Icon = ICONS[s.id] ?? Landmark;
          return (
            <li key={s.id} className="flex flex-col rounded-3xl border border-line bg-card p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{pickTx(s.title, lng)}</h3>
                  <p className="mt-1 text-sm leading-snug text-muted">{pickTx(s.setting, lng)}</p>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                <span className="text-xs font-semibold text-muted tabular-nums">{best[s.id] !== undefined ? t('simulator.best', { pct: best[s.id] }) : ''}</span>
                <button type="button" className={buttonClass({ size: 'sm' })} onClick={() => onPick(s.id)}>
                  <Play className="size-4" aria-hidden /> {best[s.id] !== undefined ? t('simulator.replay') : t('simulator.play')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const Player = ({ scene, onExit, onFinish }: { scene: Scene; onExit: () => void; onFinish: (pct: number) => void }) => {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'az';
  const isDe = lng.startsWith('de');
  const brand = useBrand();
  const speech = useSpeak();
  const byId = useMemo(() => new Map(scene.nodes.map((n) => [n.id, n])), [scene]);
  const [nodeId, setNodeId] = useState(scene.start);
  const [steps, setSteps] = useState<Step[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [showTx, setShowTx] = useState(!isDe);
  const bottom = useRef<HTMLDivElement>(null);
  const node = byId.get(nodeId)!;
  const finished = !!node.end;
  const score = scorePath(scene, steps);

  useEffect(() => {
    if (!steps.length) return; // not on opening the scene
    bottom.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, picked]);

  useEffect(() => {
    if (finished) onFinish(score.percent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const choose = (i: number) => {
    if (picked !== null) return;
    speech.stop();
    setPicked(i);
    setSteps((s) => [...s, { node: nodeId, choice: i }]);
  };
  const advance = () => {
    if (picked === null) return;
    setNodeId(node.choices[picked].next);
    setPicked(null);
  };
  const restart = () => {
    speech.stop();
    setNodeId(scene.start);
    setSteps([]);
    setPicked(null);
  };

  const shareUrl = () => `${window.location.origin}${localePath(PATH)}?scene=${scene.id}`;
  const share = async () => ((await copyLink(shareUrl())) ? toast.success(t('games.common.copied')) : toast.error(t('games.common.copyFailed')));
  const card = async () => {
    try {
      await downloadResultCard({
        lead: t('simulator.cardLead'),
        big: `${score.percent} %`,
        sub: t('simulator.cardSub', { scene: pickTx(scene.title, lng), outcome: t(`simulator.outcome.${node.end?.outcome ?? 'partial'}`) }),
        lines: scene.phrases.slice(0, 4).map((p) => p.de),
        footer: t('games.common.playAt', { domain: brand.domain, path: PATH }),
        filename: `german-simulator-${scene.id}-${score.percent}`,
      });
    } catch {
      toast.error(t('games.common.cardFailed'));
    }
  };

  const Speak = ({ id, text }: { id: string; text: string }) =>
    speech.available ? (
      <button
        type="button"
        className="grid size-10 shrink-0 place-items-center rounded-full text-link hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
        onClick={() => (speech.speaking === id ? speech.stop() : speech.speak(id, text))}
        aria-label={speech.speaking === id ? t('games.common.stop') : t('games.common.listen')}
      >
        {speech.speaking === id ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      </button>
    ) : null;

  // The transcript: every visited node with the reply chosen there.
  const history = steps.map((s) => ({ node: byId.get(s.node)!, choice: byId.get(s.node)!.choices[s.choice] }));
  const current = picked === null ? null : node.choices[picked];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={onExit}>
          <ArrowLeft className="size-4" aria-hidden /> {t('simulator.back')}
        </button>
        {!isDe && (
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="size-4 accent-[var(--tv-primary,#1f4f7d)]" checked={showTx} onChange={(e) => setShowTx(e.target.checked)} />
            <Languages className="size-4" aria-hidden /> {t('simulator.showTx')}
          </label>
        )}
      </div>

      <div className="rounded-3xl border border-line bg-card p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">{pickTx(scene.title, lng)}</h2>
        <p className="mt-1 text-sm text-muted">{pickTx(scene.setting, lng)}</p>

        <ol className="mt-5 space-y-3" aria-label={pickTx(scene.title, lng)}>
          {history.map((h, i) => (
            <li key={i} className="space-y-3">
              <Bubble who={scene.speaker} de={h.node.de} tx={showTx ? pickTx(h.node.tx, lng) : null} speak={<Speak id={`${h.node.id}-${i}`} text={h.node.de} />} />
              <Bubble mine who={t('simulator.you')} de={h.choice.de} tx={showTx ? pickTx(h.choice.tx, lng) : null} quality={h.choice.quality} />
            </li>
          ))}
          {picked === null && (
            <li>
              <Bubble who={scene.speaker} de={node.de} tx={showTx ? pickTx(node.tx, lng) : null} speak={<Speak id={node.id} text={node.de} />} />
            </li>
          )}
        </ol>

        <div aria-live="polite" className="mt-4">
          {current && (
            <div className={clsx('rounded-2xl border p-3 text-sm', current.quality === 'good' ? OUTCOME_TONE.success : current.quality === 'ok' ? OUTCOME_TONE.partial : OUTCOME_TONE.fail)}>
              <p className="flex items-center gap-1.5 font-semibold">
                {current.quality === 'good' ? <CheckCircle2 className="size-4" aria-hidden /> : current.quality === 'ok' ? <CircleAlert className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                {current.quality === 'good' ? t('simulator.good') : t(`simulator.quality.${current.quality}`)}
              </p>
              {current.feedback && <p className="mt-1">{pickTx(current.feedback, lng)}</p>}
              <button type="button" className={clsx(buttonClass({ size: 'sm' }), 'mt-3')} onClick={advance} autoFocus>
                {t('simulator.continue')} <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          )}

          {!current && finished && node.end && (
            <div className="space-y-4">
              <div className={clsx('rounded-2xl border p-4', OUTCOME_TONE[node.end.outcome])}>
                <p className="font-display text-lg font-semibold">{t(`simulator.outcome.${node.end.outcome}`)}</p>
                <p className="mt-1 text-sm">{pickTx(node.end.summary, lng)}</p>
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {t('simulator.score', { pct: score.percent })} · {t('simulator.steps', { n: steps.length })}
                </p>
                {score.percent < 100 && <p className="mt-1 text-xs">{t('simulator.tryBetter')}</p>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button type="button" className={buttonClass()} onClick={restart}>
                  <RotateCcw className="size-4" aria-hidden /> {t('simulator.replay')}
                </button>
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={onExit}>
                  {t('simulator.back')}
                </button>
                <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => void card()}>
                  <Download className="size-4" aria-hidden /> {t('games.common.card')}
                </button>
                <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => void share()}>
                  <Link2 className="size-4" aria-hidden /> {t('games.common.share')}
                </button>
              </div>
              <section aria-labelledby="sim-phrases-h" className="rounded-2xl border border-line bg-sunken p-4">
                <h3 id="sim-phrases-h" className="font-semibold text-ink">
                  {t('simulator.phrases')}
                </h3>
                <ul className="mt-2 divide-y divide-line">
                  {scene.phrases.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 py-2">
                      <Speak id={`phrase-${i}`} text={p.de} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink" lang="de">
                          {p.de}
                        </p>
                        {!isDe && <p className="text-xs text-muted">{pickTx(p.tx, lng)}</p>}
                      </div>
                      {p.glossary && (
                        <Link to={`/glossary/${p.glossary}`} className="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-semibold text-link hover:underline" aria-label={t('simulator.toGlossary', { term: p.de })}>
                          <BookA className="size-4" aria-hidden /> <span className="max-sm:sr-only">{t('games.common.glossary')}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {!current && !finished && (
            <fieldset>
              <legend className="label">{t('simulator.yourReply')}</legend>
              <div className="grid gap-2">
                {orderFor(scene.id, node.id).map((i) => {
                  const c = node.choices[i];
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => choose(i)}
                      className="min-h-11 rounded-2xl border border-line bg-card px-4 py-3 text-left transition-colors hover:border-primary hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40"
                    >
                      <span className="block font-semibold text-ink" lang="de">
                        {c.de}
                      </span>
                      {showTx && <span className="mt-0.5 block text-xs text-muted">{pickTx(c.tx, lng)}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>
        <div ref={bottom} />
      </div>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden /> {t('simulator.disclaimer')}
      </p>
      <p className="text-sm text-ink">
        <a href={`tel:${brand.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-link hover:underline">
          <Phone className="size-4" aria-hidden /> {t('simulator.phone', { phone: brand.phone })}
        </a>
      </p>
    </div>
  );
};

const Bubble = ({ who, de, tx, mine, speak, quality }: { who: string; de: string; tx: string | null; mine?: boolean; speak?: ReactNode; quality?: 'good' | 'ok' | 'bad' }) => (
  <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
    <div className={clsx('max-w-[85%] rounded-2xl border px-3.5 py-2.5', mine ? 'rounded-br-md border-primary/30 bg-primary/10' : 'rounded-bl-md border-line bg-sunken')}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {who}
        {quality && quality !== 'good' && <span className={clsx('size-1.5 rounded-full', quality === 'ok' ? 'bg-warning-fg' : 'bg-danger-fg')} aria-hidden />}
      </p>
      <div className="flex items-start gap-1">
        <p className="text-ink" lang="de">
          {de}
        </p>
        {speak}
      </div>
      {tx && <p className="mt-0.5 text-xs text-muted">{tx}</p>}
    </div>
  </div>
);

/**
 * /german-simulator — scripted dialogue scenes (lib/games/simulator): the other person speaks German (read aloud
 * with speechSynthesis de-DE, translation toggle), you pick one of three replies; wrong or rude replies branch to
 * realistic consequences and recovery. Scene end: outcome, score, key phrases linked to /glossary. ?scene=<id>
 * opens a scene directly (share link); best scores in localStorage.
 */
export default function GermanSimulatorPage() {
  const { t } = useTranslation();
  usePageTitle(t('simulator.heroTitle'));
  const [params, setParams] = useSearchParams();
  const scene = sceneById(params.get('scene'));
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => setBest(loadProgress<Record<string, number>>(BEST_KEY, {})), []);

  const open = (id: string | null) => {
    setParams(id ? new URLSearchParams({ scene: id }) : new URLSearchParams(), { replace: false, preventScrollReset: true });
  };
  const finish = (id: string, pct: number) => {
    if (pct > (best[id] ?? -1)) {
      const next = { ...best, [id]: pct };
      setBest(next);
      saveProgress(BEST_KEY, next);
    }
  };

  return (
    <>
      <PageHero title={t('simulator.heroTitle')} subtitle={t('simulator.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x max-w-3xl space-y-8">
          {scene ? <Player key={scene.id} scene={scene} onExit={() => open(null)} onFinish={(pct) => finish(scene.id, pct)} /> : <SceneList best={best} onPick={open} />}
          {Object.keys(best).length > 0 && !scene && (
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Trophy className="size-3.5" aria-hidden /> {t('games.common.progressNote')}
            </p>
          )}
          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
