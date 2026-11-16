import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, MapPin, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { registerCopy } from '@/i18n';
import { pagesWhichCity } from '@/i18n/pagesWhichCity';
import { useL10n } from '@/lib/l10n';
import { DEFAULT_ANSWERS, QUESTION_KEYS, QUESTIONS, encodeAnswers, rankCities, type Answers, type QuestionKey } from '@/lib/cityQuiz/score';
import { trackToolUse } from '@/lib/toolAnalytics';
import { EmbedLayout } from './EmbedLayout';

registerCopy(pagesWhichCity);

const SLUG = 'which-city';
const TOTAL = QUESTION_KEYS.length;

/** Compact "Which German city suits you?" (same questions, scoring and copy as /which-city). */
export default function WhichCityEmbed() {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Answers>(DEFAULT_ANSWERS);
  const [done, setDone] = useState<Answers | null>(null);

  const choose = <K extends QuestionKey>(q: K, v: Answers[K]) => {
    trackToolUse(SLUG);
    const next = { ...draft, [q]: v };
    setDraft(next);
    if (step < TOTAL - 1) setStep(step + 1);
    else setDone(next);
  };
  const retake = () => {
    setDraft(DEFAULT_ANSWERS);
    setStep(0);
    setDone(null);
  };

  const top = done ? rankCities(done)[0] : null;
  const q = QUESTION_KEYS[step];
  const name = top ? top.city.name[locale] || top.city.name.en : '';
  const reasons = top && done ? top.reasons.map((k) => t(`whichCity.reasons.${k}.${done[k]}`, { city: name })).filter(Boolean).slice(0, 3) : [];

  return (
    <EmbedLayout widget={SLUG} fullQuery={top && done ? `r=${top.city.slug}&a=${encodeAnswers(done)}` : ''}>
      {top ? (
        <div className="space-y-3" aria-live="polite">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2742] to-[#1f4f7d] p-4 text-white">
            <p className="text-xs font-semibold text-[#f5b544]">{t('whichCity.result.lead')}</p>
            <p className="mt-1 flex items-center gap-2 font-display text-3xl font-semibold">
              <MapPin className="size-6 shrink-0 text-[#f5b544]" aria-hidden /> {name}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#9fd3a8]">
              {t('whichCity.result.match', { pct: top.match })} · {top.city.state}
            </p>
            <ul className="mt-3 space-y-1.5">
              {(reasons.length ? reasons : [top.city.description[locale] || top.city.description.en]).map((r) => (
                <li key={r} className="flex gap-2 text-sm leading-snug">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#f5b544]" aria-hidden /> {r}
                </li>
              ))}
            </ul>
          </section>
          <button type="button" onClick={retake} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
            <RotateCcw className="size-4" aria-hidden /> {t('whichCity.result.retake')}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => e.preventDefault()} aria-labelledby="wce-q">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
            <span>{t('whichCity.progress', { n: step + 1, total: TOTAL })}</span>
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-muted hover:bg-sunken hover:text-ink">
                <ArrowLeft className="size-3.5" aria-hidden /> {t('whichCity.back')}
              </button>
            )}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-sunken" aria-hidden>
            <div className="h-1.5 rounded-full bg-primary transition-[width]" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
          </div>
          <fieldset className="mt-3">
            <legend id="wce-q" className="font-display text-lg font-semibold text-ink">
              {t(`whichCity.q.${q}.title`)}
            </legend>
            <div className="mt-2 grid gap-2">
              {(QUESTIONS[q] as readonly string[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => choose(q, o as Answers[typeof q])}
                  aria-pressed={draft[q] === o && step > 0}
                  className={clsx(
                    'min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus/40',
                    draft[q] === o && step > 0 ? 'border-primary bg-primary/10 text-ink' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
                  )}
                >
                  {t(`whichCity.q.${q}.options.${o}`)}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      )}
    </EmbedLayout>
  );
}
