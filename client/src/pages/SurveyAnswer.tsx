import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock, MessageSquareHeart, SearchX, Star } from 'lucide-react';
import { Lost, Success } from '@/components/illustrations';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesSurvey } from '@/i18n/pagesSurvey';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesSurvey);

interface SurveyInfo {
  caseNumber: string | null;
  staffFirstName: string | null;
  trigger: 'VISA_APPROVED' | 'CASE_CLOSED';
  answered: boolean;
  expired: boolean;
}

const RATING_KEYS = ['communication', 'speed', 'clarity', 'support'] as const;
type RatingKey = (typeof RATING_KEYS)[number];
const COMMENT_MAX = 2000;

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
    <div className="container-x">
      <div className="card mx-auto w-full max-w-2xl rounded-3xl p-5 sm:p-10">{children}</div>
    </div>
  </section>
);

const Message = ({ icon: Icon, tone, title, text, children }: { icon: typeof CheckCircle2; tone: 'good' | 'warn' | 'muted'; title: string; text: string; children?: ReactNode }) => (
  <div className="py-4 text-center" role={tone === 'warn' ? 'alert' : 'status'}>
    {tone === 'good' ? (
      <Success className="mx-auto w-36" />
    ) : tone === 'muted' ? (
      <Lost className="mx-auto w-40" />
    ) : (
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning-bg text-warning-fg">
        <Icon className="size-7" aria-hidden />
      </span>
    )}
    <h1 className="mt-5 font-display text-2xl font-semibold text-ink">{title}</h1>
    <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
    {children && <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">{children}</div>}
  </div>
);

/** 0–10 recommendation scale: a radiogroup of big tap targets (6 + 5 per row on phones, one row from sm). */
const ScoreScale = ({ value, onChange, labelId }: { value: number | null; onChange: (v: number) => void; labelId: string }) => {
  const { t } = useTranslation();
  return (
    <div>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-6 gap-2 sm:grid-cols-11 sm:gap-1.5">
        {Array.from({ length: 11 }, (_, n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(n)}
              className={clsx(
                'grid h-12 place-items-center rounded-xl border text-base font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-11',
                active ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong hover:bg-sunken',
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs text-muted">
        <span>0 · {t('surveyPage.npsLow')}</span>
        <span className="text-right">10 · {t('surveyPage.npsHigh')}</span>
      </div>
    </div>
  );
};

const Stars = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => {
  const { t } = useTranslation();
  const id = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
      <span id={id} className="text-sm font-medium text-ink">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <div role="radiogroup" aria-labelledby={id} className="flex" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={t('surveyPage.starLabel', { n })}
              onMouseEnter={() => setHover(n)}
              onClick={() => onChange(value === n ? 0 : n)}
              className="grid size-10 place-items-center rounded-md transition focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Star className={clsx('size-6 transition', n <= shown ? 'fill-highlight text-highlight' : 'text-line')} aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function SurveyAnswer() {
  const { t } = useTranslation();
  usePageTitle(t('surveyPage.title'));
  const { token = '' } = useParams();
  const scaleLabel = useId();
  const commentId = useId();
  const { data, isLoading, error } = useQuery({
    queryKey: ['survey', token],
    queryFn: async () => (await api.get<SurveyInfo>(`/surveys/${encodeURIComponent(token)}`)).data,
    retry: false,
    enabled: !!token,
  });
  const [score, setScore] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({ communication: 0, speed: 0, clarity: 0, support: 0 });
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { suggestReview: boolean }>(null);
  const [answeredNow, setAnsweredNow] = useState(false);
  const [expiredNow, setExpiredNow] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (score === null) {
      setFormError(t('surveyPage.scoreRequired'));
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      const picked = Object.fromEntries(RATING_KEYS.filter((k) => ratings[k] > 0).map((k) => [k, ratings[k]]));
      const res = await api.post<{ ok: true; suggestReview: boolean }>(`/surveys/${encodeURIComponent(token)}`, {
        score,
        ratings: Object.keys(picked).length ? picked : undefined,
        comment: comment.trim() || undefined,
      });
      setDone({ suggestReview: res.data.suggestReview });
    } catch (err) {
      const code = errorCode(err);
      if (code === 'ALREADY_ANSWERED') setAnsweredNow(true);
      else if (code === 'SURVEY_EXPIRED') setExpiredNow(true);
      else setFormError(code === 'TOO_MANY_REQUESTS' ? t('surveyPage.errors.TOO_MANY_REQUESTS') : t('surveyPage.errors.generic'));
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <div className="grid min-h-[30vh] place-items-center text-primary" role="status">
          <Spinner className="size-8 border-[3px]" />
        </div>
      </Shell>
    );
  }

  const home = (
    <Link to="/" className="btn-primary">
      {t('surveyPage.home')}
    </Link>
  );

  if (done) {
    return (
      <Shell>
        <Message icon={CheckCircle2} tone="good" title={t('surveyPage.thanksTitle')} text={t('surveyPage.thanksText')}>
          {!done.suggestReview && home}
        </Message>
        {done.suggestReview && (
          <div className="mt-2 rounded-2xl border border-line bg-sunken p-5 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl chip-peach">
              <MessageSquareHeart className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 type-card-title text-ink">{t('surveyPage.reviewTitle')}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('surveyPage.reviewText')}</p>
            <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/review" className="btn-primary">
                {t('surveyPage.reviewCta')}
              </Link>
              <Link to="/" className="btn-secondary">
                {t('surveyPage.home')}
              </Link>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  if (error || !data) {
    return (
      <Shell>
        <Message icon={SearchX} tone="muted" title={t('surveyPage.notFoundTitle')} text={t('surveyPage.notFoundText')}>
          {home}
        </Message>
      </Shell>
    );
  }

  if (data.answered || answeredNow) {
    return (
      <Shell>
        <Message icon={CheckCircle2} tone="good" title={t('surveyPage.answeredTitle')} text={t('surveyPage.answeredText')}>
          {home}
        </Message>
      </Shell>
    );
  }

  if (data.expired || expiredNow) {
    return (
      <Shell>
        <Message icon={Clock} tone="warn" title={t('surveyPage.expiredTitle')} text={t('surveyPage.expiredText')}>
          {home}
        </Message>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={submit} noValidate>
        <p className="eyebrow">{t('surveyPage.title')}</p>
        <h1 className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">
          {data.trigger === 'VISA_APPROVED' ? t('surveyPage.triggerApproved') : t('surveyPage.triggerClosed')}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t('surveyPage.intro', { number: data.caseNumber ?? '' })}
          {data.staffFirstName && <> {t('surveyPage.introStaff', { name: data.staffFirstName })}</>}
        </p>

        <fieldset className="mt-7">
          <legend id={scaleLabel} className="mb-3 text-base font-semibold text-ink">
            {t('surveyPage.npsQuestion')}
          </legend>
          <ScoreScale
            value={score}
            labelId={scaleLabel}
            onChange={(v) => {
              setScore(v);
              setFormError(null);
            }}
          />
        </fieldset>

        <fieldset className="mt-7">
          <legend className="mb-1 text-sm font-semibold text-ink">{t('surveyPage.ratingsTitle')}</legend>
          <div className="divide-y divide-line rounded-xl border border-line px-4">
            {RATING_KEYS.map((k) => (
              <Stars key={k} label={t(`surveyPage.ratings.${k}`)} value={ratings[k]} onChange={(v) => setRatings((r) => ({ ...r, [k]: v }))} />
            ))}
          </div>
        </fieldset>

        <div className="mt-7">
          <label htmlFor={commentId} className="mb-2 block text-sm font-semibold text-ink">
            {t('surveyPage.comment')}
          </label>
          <textarea
            id={commentId}
            className="input min-h-28"
            maxLength={COMMENT_MAX}
            value={comment}
            placeholder={t('surveyPage.commentPh')}
            onChange={(e) => setComment(e.target.value)}
          />
          <p className="mt-1 text-right text-[11px] text-muted tabular-nums">
            {comment.length} / {COMMENT_MAX}
          </p>
        </div>

        {formError && (
          <p className="mt-3 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-fg" role="alert">
            {formError}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">{t('surveyPage.privacy')}</p>
          <button type="submit" className="btn-primary btn-lg shrink-0" disabled={sending}>
            {sending && <Spinner className="size-4" />} {t('surveyPage.submit')}
          </button>
        </div>
      </form>
    </Shell>
  );
}
