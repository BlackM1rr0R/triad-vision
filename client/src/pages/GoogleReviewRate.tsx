import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MessageSquareHeart, Star } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { Lost } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { usePageTitle } from '@/lib/usePageTitle';
import { RATE_COPY, rateLang } from '@/i18n/pagesGoogleReviewRate';

/*
 * Google review request, rating first (lib/googleReview on the API):
 *   /r/rate/:token?s=N     one-click 1–5 rating from the e-mail (stored by this page, not by the GET, so mail
 *                          scanners that prefetch links never record a rating)
 *   /r/rate/:token/google  counts the click and redirects to Google
 * No review gating (Google policy): every rating — and no rating at all — gets the Google link; 1–3 also get a
 * private feedback form for the team.
 */

interface Info {
  locale: string;
  firstName: string;
  rating: number | null;
  feedbackSent: boolean;
  googleAvailable: boolean;
  optOutToken: string | null;
}

const DEMO = 'demo';
const FEEDBACK_MAX = 3000;
const COLORS = ['bg-red-600', 'bg-orange-500', 'bg-amber-400 text-ink', 'bg-lime-600', 'bg-green-700'];

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
    <div className="container-x">
      <div className="card mx-auto w-full max-w-xl rounded-3xl p-5 text-center sm:p-10">{children}</div>
    </div>
  </section>
);

const googleHref = (token: string) => `/api/r/review/i/${encodeURIComponent(token)}/google`;

/** /r/rate/:token/google — hands over to the API redirect (which counts the click). */
export function GoogleReviewRateRedirect() {
  const { token = '' } = useParams();
  const { i18n } = useTranslation();
  const c = RATE_COPY[rateLang(i18n.resolvedLanguage)];
  useEffect(() => {
    if (token !== DEMO) window.location.replace(googleHref(token));
  }, [token]);
  return (
    <Shell>
      {token === DEMO ? (
        <p className="text-sm text-muted">{c.demo}</p>
      ) : (
        <div className="grid min-h-[20vh] place-items-center text-primary" role="status">
          <Spinner className="size-8 border-[3px]" />
          <p className="mt-3 text-sm text-muted">{c.redirect}</p>
        </div>
      )}
    </Shell>
  );
}

const GoogleButton = ({ token, primary, label }: { token: string; primary: boolean; label: string }) =>
  token === DEMO ? (
    <span className={clsx(primary ? 'btn-primary' : 'btn-secondary', 'pointer-events-none opacity-60')} aria-disabled="true">
      <Star className="size-4" aria-hidden /> {label}
    </span>
  ) : (
    <a href={googleHref(token)} target="_blank" rel="noopener noreferrer" className={primary ? 'btn-primary' : 'btn-secondary'}>
      <Star className="size-4" aria-hidden /> {label} <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );

export default function GoogleReviewRate() {
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const { i18n } = useTranslation();
  const qc = useQueryClient();
  const demo = token === DEMO;
  const info = useQuery({
    queryKey: ['google-review-rate', token],
    retry: false,
    queryFn: async (): Promise<Info> =>
      demo
        ? { locale: i18n.resolvedLanguage ?? 'az', firstName: '', rating: null, feedbackSent: false, googleAvailable: true, optOutToken: null }
        : (await api.get<Info>(`/r/review/i/${encodeURIComponent(token)}`)).data,
  });
  const c = RATE_COPY[rateLang(info.data?.locale ?? i18n.resolvedLanguage)];
  usePageTitle(c.title);
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'busy' | 'done'>('idle');
  const fbId = useId();
  const auto = useRef(false);

  const rate = async (n: number) => {
    setRating(n);
    setError(false);
    if (demo) return;
    setBusy(true);
    try {
      await api.post(`/r/review/i/${encodeURIComponent(token)}/rate`, { rating: n });
      void qc.invalidateQueries({ queryKey: ['google-review-rate', token] });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  // One-click rating from the e-mail (?s=N): stored once, when the page has loaded.
  useEffect(() => {
    if (auto.current || !info.data) return;
    auto.current = true;
    const s = Number(params.get('s'));
    if (Number.isInteger(s) && s >= 1 && s <= 5 && info.data.rating !== s) void rate(s);
    else if (info.data.rating) setRating(info.data.rating);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.data]);

  if (info.isLoading)
    return (
      <Shell>
        <div className="grid min-h-[20vh] place-items-center text-primary" role="status" aria-label={c.title}>
          <Spinner className="size-8 border-[3px]" />
        </div>
      </Shell>
    );
  if (info.isError || !info.data)
    return (
      <Shell>
        <Lost className="mx-auto w-40" />
        <h1 className="mt-5 font-display text-xl font-semibold text-ink">{c.invalid}</h1>
        <Link to="/" className="btn-secondary mt-6">
          {c.home}
        </Link>
      </Shell>
    );

  const d = info.data;
  const low = rating !== null && rating <= 3;
  const sentFeedback = feedbackState === 'done' || (d.feedbackSent && feedbackState === 'idle' && low);

  return (
    <Shell>
      {demo && <p className="mb-4 rounded-lg bg-sunken px-4 py-2 text-xs text-muted">{c.demo}</p>}
      <span className="mx-auto grid size-14 place-items-center rounded-2xl chip-sky">
        <MessageSquareHeart className="size-7" aria-hidden />
      </span>
      {d.firstName && <p className="mt-4 text-sm text-muted">{c.hello.replace('{{name}}', d.firstName)}</p>}
      <h1 className="mt-2 font-display text-xl font-semibold text-ink sm:text-2xl">{c.question}</h1>

      <fieldset className="mt-6">
        <legend className="sr-only">{c.question}</legend>
        <div className="flex justify-center gap-2 sm:gap-3">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => void rate(n)}
              disabled={busy}
              aria-pressed={rating === n}
              aria-label={`${n} — ${c.labels[n - 1]}`}
              title={c.labels[n - 1]}
              className={clsx(
                'grid size-12 place-items-center rounded-xl text-lg font-bold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:size-14',
                COLORS[n - 1],
                rating === null || rating === n ? 'opacity-100' : 'opacity-40',
                rating === n && 'ring-4 ring-primary/40',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mx-auto mt-2 flex max-w-xs justify-between text-xs text-muted" aria-hidden>
          <span>{c.labels[0]}</span>
          <span>{c.labels[4]}</span>
        </div>
      </fieldset>

      <div aria-live="polite">
        {busy && <p className="mt-4 text-sm text-muted">{c.saving}</p>}
        {error && (
          <p className="mt-4 text-sm text-danger-fg" role="alert">
            {c.error}
          </p>
        )}
      </div>

      {rating === null ? (
        d.googleAvailable && (
          <p className="mt-8 text-sm text-muted">
            {c.direct}{' '}
            {demo ? (
              <span className="font-semibold">{c.google}</span>
            ) : (
              <a href={googleHref(token)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                {c.google}
              </a>
            )}
          </p>
        )
      ) : (
        <div className="mt-6 border-t border-line pt-6" role="status">
          <p className="font-semibold text-ink">{c.thanks}</p>
          <p className="mt-1 text-xs text-muted">{c.change}</p>
          {low ? (
            <>
              <h2 className="mt-6 font-display text-lg font-semibold text-ink">{c.lowTitle}</h2>
              {sentFeedback ? (
                <p className="mt-2 text-sm text-success-fg">{c.feedbackDone}</p>
              ) : (
                <form
                  className="mt-2 text-left"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (feedback.trim().length < 3) return;
                    if (demo) return setFeedbackState('done');
                    setFeedbackState('busy');
                    try {
                      await api.post(`/r/review/i/${encodeURIComponent(token)}/feedback`, { feedback: feedback.trim() });
                      setFeedbackState('done');
                    } catch {
                      setFeedbackState('idle');
                      setError(true);
                    }
                  }}
                >
                  <p className="text-center text-sm text-muted">{c.lowText}</p>
                  <label htmlFor={fbId} className="label mt-4">
                    {c.feedbackLabel}
                  </label>
                  <textarea id={fbId} className="input" rows={4} maxLength={FEEDBACK_MAX} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                  <div className="mt-3 flex justify-end">
                    <button type="submit" className="btn-primary btn-sm" disabled={feedbackState === 'busy' || feedback.trim().length < 3}>
                      {feedbackState === 'busy' && <Spinner className="size-3.5" />} {c.feedbackSend}
                    </button>
                  </div>
                </form>
              )}
              {d.googleAvailable && (
                <div className="mt-6">
                  <p className="text-sm text-muted">{c.publicNote}</p>
                  <div className="mt-3">
                    <GoogleButton token={token} primary={false} label={c.google} />
                  </div>
                </div>
              )}
            </>
          ) : (
            d.googleAvailable && (
              <>
                <h2 className="mt-6 font-display text-lg font-semibold text-ink">{c.highTitle}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">{c.highText}</p>
                <div className="mt-4">
                  <GoogleButton token={token} primary label={c.google} />
                </div>
              </>
            )
          )}
        </div>
      )}

      {d.optOutToken && (
        <p className="mt-8 text-xs text-muted">
          <Link to={`/r/review/${d.optOutToken}/optout`} className="underline-offset-2 hover:underline">
            {c.optOut}
          </Link>
        </p>
      )}
    </Shell>
  );
}
