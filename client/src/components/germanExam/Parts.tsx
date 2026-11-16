import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, ChevronDown, FileText, Lightbulb, Square, Volume2, XCircle } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Recorder } from '@/components/germanExam/Recorder';
import type { useScriptSpeech } from '@/components/germanExam/useScriptSpeech';
import { countWords, type SavedExam } from '@/lib/germanExam/progress';
import { formFieldCorrect, partMax, partScore, rubricIds } from '@/lib/germanExam/scoring';
import type { AudioLine, ChoicePart, ChoiceQuestion, ExamPart, ExamSet, FormPart, RubricItem, SpeakingPart, Stimulus, WritingPart } from '@/lib/germanExam/types';

/** What the part views need from the page (state lives in GermanMockExam.tsx). */
export interface ExamApi {
  set: ExamSet;
  saved: SavedExam;
  choose: (qid: string, index: number) => void;
  fill: (fid: string, value: string) => void;
  write: (pid: string, text: string) => void;
  tick: (pid: string, rid: string, on: boolean) => void;
  /** Counts one play of a clip; false when no plays are left. */
  consumePlay: (sid: string, limit: number) => boolean;
  revealTranscript: (sid: string) => void;
  recordings: Record<string, string>;
  setRecording: (pid: string, url: string | null) => void;
  speech: ReturnType<typeof useScriptSpeech>;
}

export type Mode = 'run' | 'review';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const SHORT = new Set(['Richtig', 'Falsch', 'Ja', 'Nein']);

/** The text with every occurrence of the `marks` (evidence sentences) highlighted. */
export const Highlight = ({ text, marks }: { text: string; marks?: string[] }): ReactNode => {
  const hits = (marks ?? []).filter(Boolean).map((m) => ({ m, i: text.indexOf(m) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
  if (!hits.length) return <>{text}</>;
  const { m, i } = hits[0];
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-warning-bg px-0.5 text-warning-fg">{m}</mark>
      <Highlight text={text.slice(i + m.length)} marks={marks} />
    </>
  );
};

const Card = ({ children, className }: { children: ReactNode; className?: string }) => <div className={clsx('rounded-2xl border border-line bg-card p-4 sm:p-5', className)}>{children}</div>;

const Transcript = ({ lines, marks }: { lines: AudioLine[]; marks?: string[] }) => {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-line bg-sunken p-3 text-sm leading-relaxed text-ink" lang="de">
      <p className="mb-1 text-xs font-semibold text-muted" lang={undefined}>
        {t('mockExam.audio.transcript')}
      </p>
      {lines.map((l, i) => (
        <p key={i}>
          <Highlight text={l.text} marks={marks} />
        </p>
      ))}
    </div>
  );
};

/** A listening clip: play button with the remaining plays (as in the exam), transcript fallback without speech. */
const AudioClip = ({ stimulus, limit, api, label }: { stimulus: Stimulus; limit: number; api: ExamApi; label?: string }) => {
  const { t } = useTranslation();
  const lines = stimulus.audio ?? [];
  const used = api.saved.plays[stimulus.id] ?? 0;
  const left = Math.max(0, limit - used);
  const playing = api.speech.playing === stimulus.id;
  const transcriptOpen = api.saved.transcripts.includes(stimulus.id);
  if (!api.speech.available) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted">{t('mockExam.audio.noSpeech')}</p>
        {transcriptOpen ? (
          <Transcript lines={lines} />
        ) : (
          <button type="button" className={buttonClass({ variant: 'outline', size: 'sm' })} onClick={() => api.revealTranscript(stimulus.id)}>
            <FileText className="size-4" aria-hidden /> {t('mockExam.audio.showTranscript')}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {playing ? (
        <button type="button" className={buttonClass({ variant: 'outline' })} onClick={api.speech.stop}>
          <Square className="size-4" aria-hidden /> {t('mockExam.audio.stop')}
        </button>
      ) : (
        <button
          type="button"
          className={buttonClass({ variant: 'primary' })}
          disabled={left === 0}
          onClick={() => {
            if (api.consumePlay(stimulus.id, limit)) api.speech.play(stimulus.id, lines, api.set.audioRate);
          }}
        >
          <Volume2 className="size-4" aria-hidden /> {label ? `${t('mockExam.audio.play')} ${label}` : t('mockExam.audio.play')}
        </button>
      )}
      <span className={clsx('text-sm font-semibold tabular-nums', left ? 'text-muted' : 'text-danger-fg')} aria-live="polite">
        {playing ? t('mockExam.audio.playing') : left ? t('mockExam.audio.playsLeft', { n: left }) : t('mockExam.audio.noPlaysLeft')}
      </span>
    </div>
  );
};

const optionLabel = (q: ChoiceQuestion, i: number) => {
  const o = q.options[i];
  if (SHORT.has(o) || o.length <= 2) return o;
  return `${LETTERS[i]}) ${o}`;
};

/** One choice question: radio group (run) or the answer check with the evidence (review). */
const Question = ({ q, no, mode, api }: { q: ChoiceQuestion; no: number; mode: Mode; api: ExamApi }) => {
  const { t } = useTranslation();
  const given = api.saved.answers.choice[q.id];
  const compact = q.options.every((o) => o.length <= 12);
  const name = `q-${q.id}`;
  if (mode === 'review') {
    const ok = given === q.answer;
    return (
      <li className={clsx('rounded-xl border p-3', ok ? 'border-success-border bg-success-bg/40' : 'border-danger-border bg-danger-bg/40')}>
        <p className="flex items-start gap-2 text-sm font-semibold text-ink">
          {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-label={t('mockExam.review.right')} /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-label={t('mockExam.review.wrong')} />}
          <span>
            {no}. <span lang="de">{q.prompt}</span>
          </span>
        </p>
        <dl className="mt-2 grid gap-1 pl-6 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted">{t('mockExam.review.yourAnswer')}:</dt>
            <dd className={clsx('font-semibold', ok ? 'text-success-fg' : 'text-danger-fg')} lang="de">
              {given === undefined ? t('mockExam.review.noAnswer') : optionLabel(q, given)}
            </dd>
          </div>
          {!ok && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted">{t('mockExam.review.correctAnswer')}:</dt>
              <dd className="font-semibold text-ink" lang="de">
                {optionLabel(q, q.answer)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-muted">{t('mockExam.review.evidence')}</dt>
            <dd className="mt-0.5 rounded-lg bg-sunken px-2 py-1 italic text-ink" lang="de">
              „{q.evidence}“
            </dd>
          </div>
        </dl>
      </li>
    );
  }
  return (
    <li>
      <fieldset>
        <legend className="text-sm font-semibold text-ink">
          {no}. <span lang="de">{q.prompt}</span>
        </legend>
        <div className={clsx('mt-2 gap-2', compact ? 'flex flex-wrap' : 'grid')}>
          {q.options.map((_, i) => (
            <label
              key={i}
              className={clsx(
                'flex min-h-11 cursor-pointer items-center rounded-xl border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                compact && 'justify-center font-semibold',
                given === i ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
              )}
              lang="de"
            >
              <input type="radio" className="sr-only" name={name} checked={given === i} onChange={() => api.choose(q.id, i)} />
              {optionLabel(q, i)}
            </label>
          ))}
        </div>
      </fieldset>
    </li>
  );
};

const ReadingText = ({ s, marks }: { s: Stimulus; marks?: string[] }) => (
  <article className="rounded-xl border border-line bg-sunken p-3 text-sm leading-relaxed text-ink sm:p-4" lang="de">
    {s.title && <h4 className="mb-1 font-semibold">{s.title}</h4>}
    {(s.text ?? '').split('\n').map((line, i) => (
      <p key={i} className={i ? 'mt-1.5' : undefined}>
        <Highlight text={line} marks={marks} />
      </p>
    ))}
  </article>
);

/** Review: the source text / transcript behind a question, collapsed. */
const SourceToggle = ({ children, label }: { children: ReactNode; label: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={clsx('size-4 transition-transform', open && 'rotate-180')} aria-hidden /> {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
};

const ChoicePartView = ({ part, mode, api, startNo, onlyMistakes }: { part: ChoicePart; mode: Mode; api: ExamApi; startNo: number; onlyMistakes: boolean }) => {
  const { t } = useTranslation();
  const listening = part.plays !== undefined;
  const numberOf = (q: ChoiceQuestion) => startNo + part.questions.indexOf(q);
  const visible = (q: ChoiceQuestion) => mode === 'run' || !onlyMistakes || api.saved.answers.choice[q.id] !== q.answer;

  if (part.shared) {
    const qs = part.questions.filter(visible);
    return (
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-muted">{part.questions[0]?.options.length > 3 ? t('mockExam.run.ads') : t('mockExam.run.opinions')}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {part.stimuli.map((s) => (
              <ReadingText key={s.id} s={s} marks={mode === 'review' ? part.questions.filter((q) => q.stimulus === s.id && visible(q)).map((q) => q.evidence) : undefined} />
            ))}
          </div>
          {part.questions[0]?.options.includes('0') && <p className="mt-2 text-xs text-muted">{t('mockExam.run.none')}</p>}
        </div>
        <ol className="space-y-3">
          {qs.map((q) => (
            <Question key={q.id} q={q} no={numberOf(q)} mode={mode} api={api} />
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {part.stimuli.map((s, si) => {
        const qs = part.questions.filter((q) => q.stimulus === s.id && visible(q));
        if (!qs.length) return null;
        const marks = mode === 'review' ? qs.map((q) => q.evidence) : undefined;
        return (
          <div key={s.id} className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
            {listening ? (
              mode === 'run' ? (
                <AudioClip stimulus={s} limit={part.plays ?? 1} api={api} label={part.stimuli.length > 1 ? String(si + 1) : undefined} />
              ) : (
                <SourceToggle label={t('mockExam.audio.transcript')}>
                  <Transcript lines={s.audio ?? []} marks={marks} />
                </SourceToggle>
              )
            ) : s.text && (s.title || s.text.length > 90) ? (
              mode === 'run' ? (
                <ReadingText s={s} />
              ) : (
                <SourceToggle label={s.title ?? t('mockExam.audio.transcript')}>
                  <ReadingText s={s} marks={marks} />
                </SourceToggle>
              )
            ) : (
              s.text && (
                <p className="text-sm font-semibold text-ink" lang="de">
                  {s.text}
                </p>
              )
            )}
            <ol className="space-y-3">
              {qs.map((q) => (
                <Question key={q.id} q={q} no={numberOf(q)} mode={mode} api={api} />
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
};

const FormPartView = ({ part, mode, api }: { part: FormPart; mode: Mode; api: ExamApi }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-sunken p-3 text-sm leading-relaxed text-ink sm:p-4" lang="de">
        {part.situation}
      </p>
      <div className="rounded-xl border border-line p-3 sm:p-4" lang="de">
        <p className="mb-2 text-xs font-semibold text-muted" lang={undefined}>
          {t('mockExam.form.given')}
        </p>
        <dl className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
          {part.given.map((g) => (
            <div key={g.label} className="flex gap-2">
              <dt className="text-muted">{g.label}:</dt>
              <dd className="font-semibold text-ink">{g.value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          {part.fields.map((f, i) => {
            const v = api.saved.answers.form[f.id] ?? '';
            const ok = formFieldCorrect(f, v);
            return (
              <div key={f.id}>
                <label htmlFor={`f-${f.id}`} className="label">
                  {i + 1}. {f.label}
                </label>
                {mode === 'run' ? (
                  <input id={`f-${f.id}`} className="input" value={v} autoComplete="off" spellCheck={false} onChange={(e) => api.fill(f.id, e.target.value)} />
                ) : (
                  <p className={clsx('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', ok ? 'border-success-border bg-success-bg/40' : 'border-danger-border bg-danger-bg/40')} id={`f-${f.id}`}>
                    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden /> : <XCircle className="mt-0.5 size-4 shrink-0 text-danger-fg" aria-hidden />}
                    <span>
                      <span className="block">{t('mockExam.form.yours', { value: v || '—' })}</span>
                      {!ok && <span className="block font-semibold">{t('mockExam.form.correct', { value: f.accept[0] })}</span>}
                    </span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Self-assessment checklist with the points of each line and the total. */
const Rubric = ({ pid, items, api }: { pid: string; items: RubricItem[]; api: ExamApi }) => {
  const { t } = useTranslation();
  const ids = rubricIds(items);
  const ticked = new Set(api.saved.answers.rubric[pid] ?? []);
  const max = items.reduce((s, r) => s + r.points, 0);
  const got = items.reduce((s, r, i) => s + (ticked.has(ids[i]) ? r.points : 0), 0);
  return (
    <fieldset className="rounded-xl border border-primary/30 p-3 sm:p-4">
      <legend className="px-1 font-display text-base font-semibold text-ink">{t('mockExam.writing.selfScore')}</legend>
      <p className="text-xs text-muted">{t('mockExam.writing.selfScoreHint')}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((r, i) => (
          <li key={ids[i]}>
            <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-1 py-1 text-sm text-ink hover:bg-sunken">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--tv-primary,currentColor)]" checked={ticked.has(ids[i])} onChange={(e) => api.tick(pid, ids[i], e.target.checked)} />
              <span className="flex-1">{t(`mockExam.rubric.${r.key}`, { p: r.param })}</span>
              <span className="shrink-0 font-semibold tabular-nums text-muted">{r.points}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right text-sm font-semibold text-ink tabular-nums" aria-live="polite">
        {t('mockExam.writing.total', { points: got, max })}
      </p>
    </fieldset>
  );
};

const WritingPartView = ({ part, mode, api }: { part: WritingPart; mode: Mode; api: ExamApi }) => {
  const { t } = useTranslation();
  const text = api.saved.texts[part.id] ?? '';
  const words = countWords(text);
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-line bg-sunken p-3 text-sm leading-relaxed text-ink sm:p-4" lang="de">
        <p>{part.situation}</p>
        {part.quote && (
          <blockquote className="rounded-lg border-l-4 border-primary bg-card px-3 py-2 italic">
            „{part.quote.text}“ <span className="not-italic text-muted">— {part.quote.author}</span>
          </blockquote>
        )}
        <ul className="list-disc space-y-1 pl-5 font-semibold">
          {part.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
      {mode === 'run' ? (
        <div>
          <label htmlFor={`w-${part.id}`} className="label">
            {t('mockExam.writing.points')} ({t('mockExam.writing.target', { n: part.words })})
          </label>
          <textarea id={`w-${part.id}`} className="input min-h-48 leading-relaxed" lang="de" spellCheck={false} placeholder={t('mockExam.writing.placeholder')} value={text} onChange={(e) => api.write(part.id, e.target.value)} />
          <p className={clsx('mt-1 text-right text-xs font-semibold tabular-nums', words >= part.words * 0.8 ? 'text-success-fg' : 'text-muted')} aria-live="polite">
            {t('mockExam.writing.words', { n: words })} / {t('mockExam.writing.target', { n: part.words })}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-line p-3">
              <p className="mb-1 text-xs font-semibold text-muted">
                {t('mockExam.writing.yourText')} · {t('mockExam.writing.words', { n: words })}
              </p>
              {text.trim() ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" lang="de">
                  {text}
                </p>
              ) : (
                <p className="text-sm text-muted">{t('mockExam.writing.empty')}</p>
              )}
            </div>
            <div className="rounded-xl border border-success-border bg-success-bg/30 p-3">
              <p className="mb-1 text-xs font-semibold text-success-fg">{t('mockExam.writing.model')}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink" lang="de">
                {part.model}
              </p>
            </div>
          </div>
          <Rubric pid={part.id} items={part.rubric} api={api} />
        </>
      )}
    </div>
  );
};

const SpeakingPartView = ({ part, mode, api }: { part: SpeakingPart; mode: Mode; api: ExamApi }) => {
  const { t } = useTranslation();
  const [showPhrases, setShowPhrases] = useState(mode === 'review');
  const examinerId = `${part.id}-examiner`;
  return (
    <div className="space-y-4">
      {part.situation && (
        <p className="rounded-xl border border-line bg-sunken p-3 text-sm leading-relaxed text-ink sm:p-4" lang="de">
          {part.situation}
        </p>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted">{t('mockExam.speaking.cards')}</p>
        <ul className={clsx('gap-2', part.cards.some((c) => c.length > 40) ? 'grid' : 'flex flex-wrap')} lang="de">
          {part.cards.map((c) => (
            <li key={c} className="rounded-xl border-2 border-dashed border-primary/40 bg-card px-3 py-2 text-sm font-semibold text-ink">
              {c}
            </li>
          ))}
        </ul>
      </div>
      {part.examiner && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3">
          <span className="text-xs font-semibold text-muted">{t('mockExam.speaking.examiner')}</span>
          {api.speech.available ? (
            <button
              type="button"
              className={buttonClass({ variant: 'outline', size: 'sm' })}
              onClick={() => (api.speech.playing === examinerId ? api.speech.stop() : api.speech.play(examinerId, [{ voice: 'm1', text: part.examiner! }], api.set.audioRate))}
            >
              {api.speech.playing === examinerId ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />} {t('mockExam.speaking.playExaminer')}
            </button>
          ) : null}
          {(!api.speech.available || mode === 'review') && (
            <p className="w-full text-sm italic text-ink" lang="de">
              „{part.examiner}“
            </p>
          )}
        </div>
      )}
      <div>
        <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:underline" aria-expanded={showPhrases} onClick={() => setShowPhrases((v) => !v)}>
          <Lightbulb className="size-4" aria-hidden /> {showPhrases ? t('mockExam.speaking.hidePhrases') : t('mockExam.speaking.showPhrases')}
        </button>
        {showPhrases && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink" lang="de">
            {part.phrases.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted">{t('mockExam.speaking.tip')}</p>
      <Recorder url={api.recordings[part.id] ?? null} onChange={(url) => api.setRecording(part.id, url)} />
      {mode === 'review' && <Rubric pid={part.id} items={part.rubric} api={api} />}
    </div>
  );
};

/** One exam part ("Teil n"): task hint (reader's language), German instruction, then the tasks. */
export const PartView = ({ part, n, mode, api, startNo, onlyMistakes = false }: { part: ExamPart; n: number; mode: Mode; api: ExamApi; startNo: number; onlyMistakes?: boolean }) => {
  const { t } = useTranslation();
  const max = partMax(part);
  const score = partScore(part, api.saved.answers);
  return (
    <Card>
      <section aria-labelledby={`part-${part.id}`} className="space-y-4">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`part-${part.id}`} className="font-display text-lg font-semibold text-ink">
              {t('mockExam.run.part', { n })}
            </h3>
            {mode === 'review' && (
              <span className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-sm font-semibold tabular-nums text-ink">
                {score} / {max}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{t(`mockExam.hints.${part.hint}`)}</p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-ink" lang="de">
            {part.instruction}
          </p>
        </header>
        {part.type === 'choice' && <ChoicePartView part={part} mode={mode} api={api} startNo={startNo} onlyMistakes={onlyMistakes} />}
        {part.type === 'form' && <FormPartView part={part} mode={mode} api={api} />}
        {part.type === 'writing' && <WritingPartView part={part} mode={mode} api={api} />}
        {part.type === 'speaking' && <SpeakingPartView part={part} mode={mode} api={api} />}
      </section>
    </Card>
  );
};
