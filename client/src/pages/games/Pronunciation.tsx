import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, BookA, Info, Languages, Mic, MicOff, ShieldCheck, Snail, Square, Volume2 } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { buttonClass } from '@/components/ui/Button';
import { RelatedGuides } from '@/components/guides/RelatedGuides';
import { GameLinks } from '@/components/games/GameLinks';
import { useGermanRecognition } from '@/components/games/useRecognition';
import { useSpeak } from '@/components/games/useSpeak';
import { registerCopy } from '@/i18n';
import { pagesGames } from '@/i18n/pagesGames';
import { pagesPronunciation } from '@/i18n/pagesPronunciation';
import { usePageTitle } from '@/lib/usePageTitle';
import { loadProgress, pickTx, saveProgress } from '@/lib/games/common';
import { useReadyReport } from '@/lib/readyProgress/sync'; // Germany Ready: results of signed-in clients
import { alignWords, type AlignResult } from '@/lib/games/pronunciation/align';
import { SENTENCES, SENTENCE_LEVELS, SENTENCE_TOPICS, type SentenceLevel, type SentenceTopic } from '@/lib/games/pronunciation/sentences';

registerCopy(pagesGames);
registerCopy(pagesPronunciation);

const PATH = '/pronunciation';
const BEST_KEY = 'pron.best';

const Chips = <T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { value: T; label: ReactNode; count: number }[]; onChange: (v: T) => void }) => (
  <fieldset>
    <legend className="label">{legend}</legend>
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={!o.count}
          onClick={() => onChange(o.value)}
          className={clsx(
            'min-h-10 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40 disabled:opacity-40',
            value === o.value ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  </fieldset>
);

const Result = ({ r }: { r: AlignResult }) => {
  const { t } = useTranslation();
  const tone = r.percent >= 80 ? 'border-success-border bg-success-bg text-success-fg' : r.percent >= 50 ? 'border-warning-border bg-warning-bg text-warning-fg' : 'border-danger-border bg-danger-bg text-danger-fg';
  return (
    <div className="space-y-2">
      <p className={clsx('inline-flex rounded-full border px-3 py-1 text-sm font-semibold tabular-nums', tone)}>{t('pronunciation.result', { pct: r.percent })}</p>
      <p className="text-lg leading-relaxed" lang="de">
        {r.words.map((w, i) => (
          <span key={i}>
            <span
              className={clsx(w.status === 'ok' ? 'text-success-fg' : 'rounded bg-danger-bg px-0.5 font-semibold text-danger-fg underline decoration-wavy')}
              title={w.status === 'wrong' ? t('pronunciation.heardAs', { word: w.heard }) : w.status === 'missing' ? t('pronunciation.missing') : undefined}
            >
              {w.word}
            </span>
            {w.status !== 'ok' && <span className="sr-only"> ({w.status === 'wrong' ? t('pronunciation.heardAs', { word: w.heard }) : t('pronunciation.missing')})</span>}{' '}
          </span>
        ))}
      </p>
      {r.extra.length > 0 && <p className="text-xs text-muted">{t('pronunciation.extra', { words: r.extra.join(', ') })}</p>}
      <p className="text-xs text-muted">{t('pronunciation.legend')}</p>
    </div>
  );
};

/**
 * /pronunciation — listen (speechSynthesis de-DE, normal and slow), speak (Web Speech API SpeechRecognition,
 * de-DE, where the browser has it) and see a word-level comparison (lib/games/pronunciation/align.ts). Without
 * recognition (Firefox, some Safari) a notice and listen-only practice. Nothing is uploaded by us; best scores per
 * sentence in localStorage.
 */
export default function PronunciationPage() {
  const { t, i18n } = useTranslation();
  usePageTitle(t('pronunciation.heroTitle'));
  const lng = i18n.resolvedLanguage ?? 'az';
  const isDe = lng.startsWith('de');
  const [level, setLevel] = useState<SentenceLevel>('A1');
  const [topic, setTopic] = useState<SentenceTopic>('everyday');
  const [index, setIndex] = useState(0);
  const [showTx, setShowTx] = useState(!isDe);
  const [result, setResult] = useState<{ id: string; heard: string; r: AlignResult } | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  useEffect(() => setBest(loadProgress<Record<string, number>>(BEST_KEY, {})), []);
  const report = useReadyReport();
  const speech = useSpeak();
  const rec = useGermanRecognition();

  const counts = useMemo(() => {
    const byLevel = Object.fromEntries(SENTENCE_LEVELS.map((l) => [l, SENTENCES.filter((s) => s.level === l && s.topic === topic).length]));
    const byTopic = Object.fromEntries(SENTENCE_TOPICS.map((tp) => [tp, SENTENCES.filter((s) => s.topic === tp && s.level === level).length]));
    return { byLevel, byTopic };
  }, [level, topic]);
  const list = useMemo(() => SENTENCES.filter((s) => s.level === level && s.topic === topic), [level, topic]);
  const current = list[Math.min(index, list.length - 1)];

  const choose = (l: SentenceLevel, tp: SentenceTopic) => {
    // Keep a valid combination: if the topic has nothing at this level, take the first level that has sentences.
    const has = (lv: SentenceLevel) => SENTENCES.some((s) => s.level === lv && s.topic === tp);
    const lv = has(l) ? l : (SENTENCE_LEVELS.find(has) ?? l);
    setLevel(lv);
    setTopic(tp);
    setIndex(0);
    setResult(null);
  };
  const go = (d: 1 | -1) => {
    setIndex((i) => (i + d + list.length) % list.length);
    setResult(null);
    speech.stop();
  };

  const record = async () => {
    if (!current) return;
    if (rec.listening) return rec.stop();
    speech.stop();
    const heard = await rec.listen();
    const r = alignWords(current.de, heard);
    setResult({ id: current.id, heard, r });
    if (heard) report({ activityId: 'pronunciation', item: current.id, score: r.percent, max: 100 }); // Germany Ready sync
    if (heard && r.percent > (best[current.id] ?? -1)) {
      const next = { ...best, [current.id]: r.percent };
      setBest(next);
      saveProgress(BEST_KEY, next);
    }
  };

  const shown = result && current && result.id === current.id ? result : null;

  return (
    <>
      <PageHero title={t('pronunciation.heroTitle')} subtitle={t('pronunciation.heroSubtitle')} crumb={{ to: '/tools', label: t('siteNav.tools') }} />
      <section className="section">
        <div className="container-x grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div className="min-w-0 space-y-4">
            <div className="space-y-3 rounded-3xl border border-line bg-card p-4 sm:p-5">
              <Chips legend={t('pronunciation.topic')} value={topic} onChange={(v) => choose(level, v)} options={SENTENCE_TOPICS.map((v) => ({ value: v, label: t(`pronunciation.topics.${v}`), count: SENTENCES.filter((s) => s.topic === v).length }))} />
              <Chips legend={t('pronunciation.level')} value={level} onChange={(v) => choose(v, topic)} options={SENTENCE_LEVELS.map((v) => ({ value: v, label: v, count: counts.byLevel[v] }))} />
            </div>

            {current && (
              <div className="rounded-3xl border border-primary/30 bg-card p-5 shadow-[var(--tv-shadow-raised)] sm:p-7">
                <div className="flex items-center justify-between gap-2 text-sm font-semibold text-muted">
                  <span>{t('pronunciation.counter', { n: Math.min(index, list.length - 1) + 1, total: list.length })}</span>
                  {best[current.id] !== undefined && <span className="tabular-nums">{t('pronunciation.best', { pct: best[current.id] })}</span>}
                </div>
                <p className="mt-3 font-display text-2xl font-semibold leading-snug text-ink sm:text-3xl" lang="de">
                  {current.de}
                </p>
                {!isDe && (
                  <div className="mt-2">
                    <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline" aria-expanded={showTx} onClick={() => setShowTx((v) => !v)}>
                      <Languages className="size-4" aria-hidden /> {showTx ? t('pronunciation.hideTranslation') : t('pronunciation.showTranslation')}
                    </button>
                    {showTx && <p className="text-sm text-muted">{pickTx(current.tx, lng)}</p>}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  {speech.available ? (
                    <>
                      <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => (speech.speaking === current.id ? speech.stop() : speech.speak(current.id, current.de))}>
                        {speech.speaking === current.id ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />} {speech.speaking === current.id ? t('games.common.stop') : t('pronunciation.listen')}
                      </button>
                      <button type="button" className={buttonClass({ variant: 'outline' })} onClick={() => speech.speak(`${current.id}-slow`, current.de, 0.6)}>
                        <Snail className="size-4" aria-hidden /> {t('pronunciation.listenSlow')}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm text-muted">{t('games.common.noSpeech')}</p>
                  )}
                  {rec.supported && (
                    <button type="button" className={buttonClass({ variant: rec.listening ? 'danger' : 'primary' })} onClick={() => void record()} aria-pressed={rec.listening}>
                      {rec.listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />} {rec.listening ? t('pronunciation.stopRecording') : t('pronunciation.record')}
                    </button>
                  )}
                </div>

                <div className="mt-4 min-h-6" aria-live="polite">
                  {rec.listening && (
                    <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <span className="size-2.5 rounded-full bg-danger-fg motion-safe:animate-pulse" aria-hidden /> {t('pronunciation.recording')} {rec.interim && <span className="font-normal text-muted">«{rec.interim}»</span>}
                    </p>
                  )}
                  {!rec.listening && rec.error && <p className="text-sm text-danger-fg" role="alert">{t(`pronunciation.errors.${rec.error}`)}</p>}
                  {!rec.listening && shown && (
                    <div className="space-y-3">
                      {shown.heard ? (
                        <>
                          <p className="text-sm text-muted">
                            {t('pronunciation.heard')} <span className="text-ink" lang="de">«{shown.heard}»</span>
                          </p>
                          <Result r={shown.r} />
                        </>
                      ) : (
                        !rec.error && <p className="text-sm text-muted">{t('pronunciation.nothing')}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex justify-between gap-2">
                  <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => go(-1)}>
                    <ArrowLeft className="size-4" aria-hidden /> {t('pronunciation.prev')}
                  </button>
                  <button type="button" className={buttonClass({ variant: 'ghost' })} onClick={() => go(1)}>
                    {t('pronunciation.next')} <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            {!rec.supported && (
              <div className="flex items-start gap-2 rounded-2xl border border-warning-border bg-warning-bg p-4 text-sm text-warning-fg" role="note">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold">{t('pronunciation.unsupported.title')}</p>
                  <p className="mt-1">{t('pronunciation.unsupported.text')}</p>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section aria-labelledby="pron-privacy-h" className="rounded-3xl border border-line bg-card p-4 text-sm leading-relaxed text-ink sm:p-5">
              <h2 id="pron-privacy-h" className="flex items-center gap-2 font-display text-base font-semibold">
                <ShieldCheck className="size-4 text-primary" aria-hidden /> {t('pronunciation.privacy.title')}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>{t('pronunciation.privacy.mic')}</li>
                <li>{t('pronunciation.privacy.upload')}</li>
                <li>{t('pronunciation.privacy.vendor')}</li>
                <li>{t('pronunciation.privacy.progress')}</li>
              </ul>
            </section>
            <section aria-labelledby="pron-tips-h" className="rounded-3xl border border-line bg-card p-4 text-sm leading-relaxed text-ink sm:p-5">
              <h2 id="pron-tips-h" className="font-display text-base font-semibold">
                {t('pronunciation.tips.title')}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                <li>{t('pronunciation.tips.one')}</li>
                <li>{t('pronunciation.tips.two')}</li>
                <li>{t('pronunciation.tips.three')}</li>
              </ul>
              <Link to="/glossary" className="mt-3 inline-flex min-h-10 items-center gap-1.5 font-semibold text-link hover:underline">
                <BookA className="size-4" aria-hidden /> {t('pronunciation.glossaryLink')}
              </Link>
            </section>
          </aside>
        </div>
        <div className="container-x mt-8 max-w-5xl">
          <GameLinks current={PATH} />
        </div>
      </section>
      <RelatedGuides tool={PATH} />
    </>
  );
}
