import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import type { L10n } from '@/lib/types';
import { L10nInput, emptyL10n } from '@/components/admin/L10nInput';
import { Button, IconButton } from '@/components/ui/Button';
import type { AdminQuestion, QuestionKind } from '../api';

export interface QuestionDraft {
  kind: QuestionKind;
  prompt: L10n;
  options: L10n[];
  correct: number[];
  explanation: L10n;
}

export const toQuestionDrafts = (qs: AdminQuestion[]): QuestionDraft[] =>
  qs.map((q) => ({
    kind: q.kind,
    prompt: { ...emptyL10n(), ...(q.prompt ?? {}) },
    options: q.options.map((o) => ({ ...emptyL10n(), ...o })),
    correct: q.correct,
    explanation: { ...emptyL10n(), ...(q.explanation ?? {}) },
  }));

const blank = (): QuestionDraft => ({ kind: 'SINGLE', prompt: emptyL10n(), options: [emptyL10n(), emptyL10n()], correct: [0], explanation: emptyL10n() });

export const questionsValid = (qs: QuestionDraft[]) => qs.every((q) => q.correct.length > 0 && (q.kind === 'MULTIPLE' || q.correct.length === 1) && q.correct.every((i) => i < q.options.length));

/** Quiz questions in four languages: single / multiple choice, right options, explanation. */
export function QuizEditor({ value, onChange }: { value: QuestionDraft[]; onChange: (v: QuestionDraft[]) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
  const set = (i: number, q: QuestionDraft) => onChange(value.map((x, j) => (j === i ? q : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-sm text-muted">{t('courseAdmin.quiz.empty')}</p>}
      {value.map((q, i) => {
        const expanded = open === i;
        const setCorrect = (oi: number, on: boolean) =>
          set(i, { ...q, correct: q.kind === 'SINGLE' ? (on ? [oi] : []) : on ? [...q.correct, oi].sort((a, b) => a - b) : q.correct.filter((x) => x !== oi) });
        return (
          <div key={i} className={clsx('rounded-xl border', q.correct.length ? 'border-line' : 'border-danger-border')}>
            <div className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-h-10 min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : i)}>
                {i + 1}. {q.prompt.az || t('courseAdmin.quiz.prompt')}
              </button>
              <IconButton icon={ArrowUp} label={t('courseAdmin.lesson.up')} size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon={ArrowDown} label={t('courseAdmin.lesson.down')} size="sm" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon={Trash2} label={t('courseAdmin.quiz.remove')} size="sm" variant="danger" onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </div>
            {expanded && (
              <div className="space-y-3 border-t border-line p-3">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('courseAdmin.lesson.kind')}>
                  {(['SINGLE', 'MULTIPLE'] as const).map((k) => (
                    <label key={k} className={clsx('inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold', q.kind === k ? 'border-primary bg-primary/[0.06]' : 'border-line')}>
                      <input type="radio" className="accent-primary" checked={q.kind === k} onChange={() => set(i, { ...q, kind: k, correct: k === 'SINGLE' ? q.correct.slice(0, 1) : q.correct })} />
                      {t(`courseAdmin.quiz.kind.${k}`)}
                    </label>
                  ))}
                </div>
                <L10nInput label={t('courseAdmin.quiz.prompt')} value={q.prompt} onChange={(v) => set(i, { ...q, prompt: v })} required multiline rows={2} />
                {q.options.map((o, oi) => (
                  <div key={oi} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <L10nInput label={t('courseAdmin.quiz.option', { n: oi + 1 })} value={o} onChange={(v) => set(i, { ...q, options: q.options.map((x, j) => (j === oi ? v : x)) })} required />
                    </div>
                    <label className="mb-1 inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink">
                      <input type={q.kind === 'SINGLE' ? 'radio' : 'checkbox'} name={`correct-${i}`} className="size-4 accent-primary" checked={q.correct.includes(oi)} onChange={(e) => setCorrect(oi, e.target.checked)} />
                      {t('courseAdmin.quiz.correct')}
                    </label>
                    <IconButton
                      icon={X}
                      size="sm"
                      label={t('courseAdmin.quiz.removeOption')}
                      disabled={q.options.length <= 2}
                      onClick={() => set(i, { ...q, options: q.options.filter((_, j) => j !== oi), correct: q.correct.filter((x) => x !== oi).map((x) => (x > oi ? x - 1 : x)) })}
                    />
                  </div>
                ))}
                {q.options.length < 8 && (
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => set(i, { ...q, options: [...q.options, emptyL10n()] })}>
                    {t('courseAdmin.quiz.addOption')}
                  </Button>
                )}
                <L10nInput label={t('courseAdmin.quiz.explanation')} value={q.explanation} onChange={(v) => set(i, { ...q, explanation: v })} multiline rows={2} />
              </div>
            )}
          </div>
        );
      })}
      {!questionsValid(value) && <p className="text-xs font-semibold text-danger-fg">{t('courseAdmin.quiz.needCorrect')}</p>}
      <Button
        variant="secondary"
        size="sm"
        icon={Plus}
        onClick={() => {
          onChange([...value, blank()]);
          setOpen(value.length);
        }}
      >
        {t('courseAdmin.quiz.add')}
      </Button>
    </div>
  );
}
