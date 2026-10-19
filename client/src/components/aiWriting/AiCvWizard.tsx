import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesAiWriting } from '@/i18n/pagesAiWriting';
import { Spinner } from '@/components/ui/Spinner';
import type { CvData } from '@/components/cv/types';
import { mergeCv, useAiWritingError, type CvDraftResponse } from './api';

registerCopy(pagesAiWriting);

type Answers = { target: string; jobs: string; education: string; languages: string; strengths: string };
const EMPTY: Answers = { target: '', jobs: '', education: '', languages: '', strengths: '' };
const MAX: Record<keyof Answers, number> = { target: 200, jobs: 3000, education: 1500, languages: 600, strengths: 800 };
/** Wizard steps: one or two questions each. */
const STEPS: (keyof Answers)[][] = [['target'], ['jobs'], ['education', 'languages'], ['strengths']];

const Field = ({ name, value, onChange }: { name: keyof Answers; value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const long = name !== 'target';
  return (
    <div>
      <label htmlFor={id} className="label">
        {t(`aiw.cv.${name}`)}
        {name === 'target' && ' *'}
      </label>
      {long ? (
        <textarea id={id} className="input min-h-28" value={value} maxLength={MAX[name]} placeholder={t(`aiw.cv.${name}Ph`)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="input" value={value} maxLength={MAX[name]} placeholder={t(`aiw.cv.${name}Ph`)} onChange={(e) => onChange(e.target.value)} autoFocus />
      )}
    </div>
  );
};

const Preview = ({ cv }: { cv: CvData }) => {
  const { t } = useTranslation();
  const range = (from: string | null, to: string | null) => `${from ?? '…'} – ${to ?? t('aiw.cv.now')}`;
  return (
    <div className="space-y-4 text-sm">
      {cv.headline && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.headline')}</p>
          <p className="font-bold text-ink">{cv.headline}</p>
        </div>
      )}
      {cv.summary && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.summary')}</p>
          <p className="text-ink">{cv.summary}</p>
        </div>
      )}
      {cv.experience.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.experience')}</p>
          <ul className="mt-1 space-y-2">
            {cv.experience.map((e, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface/50 p-3">
                <p className="font-semibold text-ink">{e.title}</p>
                <p className="text-xs text-muted">
                  {[e.employer, e.city, e.country].filter(Boolean).join(', ')} · {range(e.from, e.to)}
                </p>
                {e.tasks.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-ink/90">
                    {e.tasks.map((task, j) => (
                      <li key={j}>{task}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cv.education.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.education2')}</p>
          <ul className="mt-1 space-y-1">
            {cv.education.map((e, i) => (
              <li key={i} className="text-ink">
                <span className="font-semibold">{e.degree}</span>
                {e.institution && `, ${e.institution}`} <span className="text-xs text-muted">· {range(e.from, e.to)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        {cv.languages.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.languages2')}</p>
            <p className="text-ink">{cv.languages.map((l) => `${l.language} (${l.level === 'native' ? t('aiw.cv.native') : l.level})`).join(', ')}</p>
          </div>
        )}
        {cv.drivingLicences.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.licences')}</p>
            <p className="text-ink">{cv.drivingLicences.join(', ')}</p>
          </div>
        )}
      </div>
      {cv.skills.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted uppercase">{t('aiw.cv.skills')}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cv.skills.map((s) => (
              <span key={s} className="badge bg-brand-50 text-brand-700">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * "AI ilə yaz" for the CV builder: a 4-step wizard → German CV draft → preview → the client chooses to
 * replace the CV or add to it. Nothing reaches the CV before that confirmation.
 */
export const AiCvWizard = ({ current, onApply, className }: { current: CvData; onApply: (data: CvData) => void; className?: string }) => {
  const { t } = useTranslation();
  const onError = useAiWritingError();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CvData | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  const start = () => {
    setStep(0);
    setDraft(null);
    setOpen(true);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const res = await api.post<CvDraftResponse>('/ai-writing/cv-draft', Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.trim()])));
      setDraft(res.data.draft);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const apply = (mode: 'replace' | 'merge') => {
    if (!draft) return;
    onApply(mode === 'replace' ? draft : mergeCv(current, draft));
    toast.success(t('aiw.cv.applied'));
    setOpen(false);
  };

  const last = step === STEPS.length - 1;
  const canNext = step > 0 || answers.target.trim().length >= 2;

  return (
    <>
      <button type="button" className={clsx('btn-primary btn-sm w-full', className)} onClick={start}>
        <Sparkles className="size-4" aria-hidden /> {t('aiw.button')}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-navy-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !busy && setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="card flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-b-none sm:max-h-[90dvh] sm:rounded-b-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-line p-4 sm:p-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-ink">
                    <Sparkles className="size-5 text-brand-600" aria-hidden /> {draft ? t('aiw.cv.previewTitle') : t('aiw.cv.title')}
                  </h2>
                  <p className="mt-1 text-xs text-muted">{draft ? t('aiw.cv.previewHint') : t('aiw.cv.intro')}</p>
                </div>
                <button type="button" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface" aria-label={t('aiw.cv.discard')} onClick={() => !busy && setOpen(false)}>
                  <X className="size-5" aria-hidden />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
                {draft ? (
                  <Preview cv={draft} />
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs font-semibold text-brand-600">{t('aiw.cv.step', { n: step + 1, total: STEPS.length })}</p>
                    {STEPS[step].map((name) => (
                      <Field key={name} name={name} value={answers[name]} onChange={(v) => setAnswers((a) => ({ ...a, [name]: v }))} />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-between sm:p-5">
                {draft ? (
                  <>
                    <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface" onClick={() => setDraft(null)}>
                      <ArrowLeft className="size-4" aria-hidden /> {t('aiw.cv.back')}
                    </button>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface" onClick={() => apply('merge')}>
                        {t('aiw.cv.merge')}
                      </button>
                      <button type="button" className="btn-primary min-h-11" onClick={() => apply('replace')}>
                        {t('aiw.cv.replace')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn min-h-11 border border-line text-ink hover:bg-surface disabled:opacity-50" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}>
                      <ArrowLeft className="size-4" aria-hidden /> {t('aiw.cv.back')}
                    </button>
                    {last ? (
                      <button type="button" className="btn-primary min-h-11" disabled={busy || answers.target.trim().length < 2} onClick={() => void generate()}>
                        {busy ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />} {busy ? t('aiw.working') : t('aiw.cv.generate')}
                      </button>
                    ) : (
                      <button type="button" className="btn-primary min-h-11" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                        {t('aiw.cv.next')} <ArrowRight className="size-4" aria-hidden />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default AiCvWizard;
