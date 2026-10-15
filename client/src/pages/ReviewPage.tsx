import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, MessageSquareHeart, Star, TriangleAlert } from 'lucide-react';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy, currentLocale } from '@/i18n';
import { pagesGrowth } from '@/i18n/pagesGrowth';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesGrowth);

interface Invite {
  status: 'REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  firstName: string;
  lastInitial: string;
  profession: string | null;
  locale: string;
}

const TEXT_MIN = 20;
const TEXT_MAX = 1500;

const KNOWN_ERRORS = ['INVITE_NOT_FOUND', 'INVITE_EXPIRED', 'UNAUTHENTICATED', 'ALREADY_SUBMITTED', 'TOO_MANY_REQUESTS'];

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-surface pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
    <div className="container-x">
      <div className="card mx-auto w-full max-w-2xl p-6 sm:p-10">{children}</div>
    </div>
  </section>
);

const Message = ({ icon: Icon, tone, title, text, children }: { icon: typeof CheckCircle2; tone: 'good' | 'warn'; title: string; text: string; children?: ReactNode }) => (
  <div className="py-4 text-center" role={tone === 'warn' ? 'alert' : 'status'}>
    <span className={clsx('mx-auto grid size-14 place-items-center rounded-full', tone === 'good' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
      <Icon className="size-7" aria-hidden />
    </span>
    <h1 className="mt-5 font-display text-2xl font-extrabold text-navy-900">{title}</h1>
    <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
    <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">{children}</div>
  </div>
);

const StarInput = ({ value, onChange, labelId }: { value: number; onChange: (v: number) => void; labelId: string }) => {
  const { t } = useTranslation();
  const [hover, setHover] = useState(0);
  const labels = t('growth.review.ratingLabels', { returnObjects: true }) as string[];
  const shown = hover || value;
  const move = (delta: number) => onChange(Math.min(5, Math.max(1, (value || 0) + delta)));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex gap-1"
        onMouseLeave={() => setHover(0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            move(1);
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${t('growth.review.ratingValue', { count: n })} — ${labels[n - 1] ?? ''}`}
            tabIndex={value === n || (!value && n === 1) ? 0 : -1}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="grid size-11 place-items-center rounded-lg transition hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <Star className={clsx('size-8 transition', n <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
          </button>
        ))}
      </div>
      <span className="min-h-5 text-sm font-semibold text-navy-900" aria-live="polite">
        {shown ? labels[shown - 1] : ''}
      </span>
    </div>
  );
};

const ReviewForm = ({ invite, token, onDone }: { invite: Invite; token: string | null; onDone: () => void }) => {
  const { t } = useTranslation();
  const uid = useId();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [displayName, setDisplayName] = useState(
    `${invite.firstName}${invite.lastInitial ? ` ${invite.lastInitial}.` : ''}${invite.profession ? `, ${invite.profession}` : ''}`.slice(0, 80),
  );
  const [consent, setConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    rating: rating < 1 ? t('growth.review.errors.rating') : null,
    text: text.trim().length < TEXT_MIN || text.trim().length > TEXT_MAX ? t('growth.review.errors.text') : null,
    name: displayName.trim().length < 2 || displayName.trim().length > 80 ? t('growth.review.errors.name') : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (invalid) return;
    setBusy(true);
    try {
      await api.post('/reviews/submit', {
        ...(token ? { token } : {}),
        rating,
        text: text.trim(),
        displayName: displayName.trim(),
        consentPublish: consent,
        locale: currentLocale(),
      });
      onDone();
    } catch (err) {
      const code = errorCode(err);
      setError(t(`growth.review.errors.${KNOWN_ERRORS.includes(code) ? code : 'generic'}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form noValidate onSubmit={submit}>
      <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600">
        <MessageSquareHeart className="size-6" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-[1.75rem] leading-tight font-extrabold text-navy-900 sm:text-3xl">{t('growth.review.hello', { name: invite.firstName })}</h1>
      <p className="mt-2 text-muted">
        {invite.profession ? t('growth.review.introProfession', { profession: invite.profession }) : t('growth.review.intro')}
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <p id={`${uid}-rating`} className="label">
            {t('growth.review.rating')} *
          </p>
          <StarInput value={rating} onChange={setRating} labelId={`${uid}-rating`} />
          {submitted && errors.rating && <p className="mt-1.5 text-xs text-danger">{errors.rating}</p>}
        </div>

        <div>
          <label htmlFor={`${uid}-text`} className="label">
            {t('growth.review.text')} *
          </label>
          <textarea
            id={`${uid}-text`}
            className={clsx('input min-h-36 resize-y', submitted && errors.text && 'border-danger')}
            value={text}
            maxLength={TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('growth.review.textPlaceholder')}
            aria-invalid={(submitted && !!errors.text) || undefined}
            aria-describedby={`${uid}-text-desc`}
          />
          <p id={`${uid}-text-desc`} className={clsx('mt-1.5 flex justify-between gap-3 text-xs', submitted && errors.text ? 'text-danger' : 'text-muted')}>
            <span>{submitted && errors.text ? errors.text : ''}</span>
            <span className="tabular-nums">{t('growth.review.counter', { n: text.trim().length })}</span>
          </p>
        </div>

        <div>
          <label htmlFor={`${uid}-name`} className="label">
            {t('growth.review.displayName')} *
          </label>
          <input
            id={`${uid}-name`}
            className={clsx('input', submitted && errors.name && 'border-danger')}
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={(submitted && !!errors.name) || undefined}
            aria-describedby={`${uid}-name-desc`}
          />
          <p id={`${uid}-name-desc`} className={clsx('mt-1.5 text-xs', submitted && errors.name ? 'text-danger' : 'text-muted')}>
            {submitted && errors.name ? errors.name : t('growth.review.displayNameHint')}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-navy-900">{t('growth.review.consent')}</span>
            <span className="mt-0.5 block text-xs text-muted">{t('growth.review.consentHint')}</span>
          </span>
        </label>
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-7 min-h-12 w-full sm:w-auto sm:px-8" disabled={busy}>
        {busy && <Spinner className="size-4" />}
        {t('growth.review.submit')}
      </button>
    </form>
  );
};

export default function ReviewPage() {
  const { t } = useTranslation();
  usePageTitle(t('growth.review.title'));
  const [params] = useSearchParams();
  const token = params.get('token');
  const [done, setDone] = useState(false);

  const { data, error, isLoading } = useQuery({
    queryKey: ['review-invite', token],
    queryFn: async () => (await api.get<Invite>('/reviews/invite', { params: token ? { token } : {} })).data,
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <Shell>
        <div className="grid min-h-60 place-items-center text-brand-600">
          <Spinner className="size-8 border-[3px]" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    const code = errorCode(error);
    return (
      <Shell>
        <Message icon={TriangleAlert} tone="warn" title={t('growth.review.title')} text={t(`growth.review.errors.${KNOWN_ERRORS.includes(code) ? code : 'generic'}`)}>
          {code === 'UNAUTHENTICATED' && (
            <Link to="/login" state={{ from: '/review' }} className="btn-primary px-6">
              {t('growth.review.login')}
            </Link>
          )}
          <Link to="/" className="btn-ghost px-6">
            {t('growth.review.home')}
          </Link>
        </Message>
      </Shell>
    );
  }

  if (done || data.status !== 'REQUESTED') {
    return (
      <Shell>
        <Message
          icon={CheckCircle2}
          tone="good"
          title={done ? t('growth.review.thanksTitle') : t('growth.review.alreadyTitle')}
          text={done ? t('growth.review.thanksText') : t('growth.review.alreadyText')}
        >
          <Link to="/" className="btn-primary px-6">
            {t('growth.review.home')}
          </Link>
        </Message>
      </Shell>
    );
  }

  return (
    <Shell>
      <ReviewForm invite={data} token={token} onDone={() => setDone(true)} />
    </Shell>
  );
}
