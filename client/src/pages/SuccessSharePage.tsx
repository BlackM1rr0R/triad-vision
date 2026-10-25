import { useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CheckCircle2, ClipboardCheck, MapPin, Send, Stamp } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Lost, Success } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesSuccessShare } from '@/i18n/pagesSuccessShare';
import { leadContext } from '@/lib/leadVisitor';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesSuccessShare);

interface PublicShare {
  token: string;
  displayName: string;
  visaLine: string;
  city: string | null;
  destination: string;
  locale: string;
  referralCode: string | null;
  allowIndexing: boolean;
  shareUrl: string;
  cards: { post: string; story: string };
}

/**
 * Public /success/:token page: a client's "visa approved" card (shared by them, with consent) and the
 * "Start your journey" lead form (→ Inquiry, source success-share:<token>). The head (robots: noindex unless
 * the client opted in, og:image = the card) comes from the API (lib/successShare/service.ts → /__seo/head).
 * A revoked share answers 404 → "this page no longer exists".
 */
export default function SuccessSharePage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => String(t(`successShare.page.${k}`, o));
  const valid = /^[A-Za-z0-9_-]{22}$/.test(token);
  const q = useQuery({
    queryKey: ['success-share', token],
    enabled: valid,
    retry: false,
    queryFn: async () => (await api.get<PublicShare>(`/success/${token}`)).data,
  });
  usePageTitle(q.data ? s('title', { name: q.data.displayName }) : s('kicker'));

  if (valid && q.isLoading) {
    return (
      <section className="grid min-h-[100svh] place-items-center bg-canvas text-primary" role="status" aria-label={s('sending')}>
        <Spinner className="size-9 border-[3px]" />
      </section>
    );
  }
  if (!valid || q.isError || !q.data) {
    return (
      <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
        <div className="container-x">
          <div className="card mx-auto max-w-xl rounded-3xl p-6 text-center sm:p-10">
            <Lost className="mx-auto w-40" />
            <h1 className="mt-5 font-display text-xl font-semibold text-ink sm:text-2xl">{s('notFoundTitle')}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">{s('notFoundText')}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link to="/" className="btn-secondary">
                {s('home')}
              </Link>
              <Link to="/register" className="btn-primary">
                {s('register')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const d = q.data;
  const registerTo = d.referralCode ? `/register?ref=${encodeURIComponent(d.referralCode)}` : '/register';
  return (
    <div className="bg-canvas">
      <section className="pt-24 pb-10 sm:pt-28 lg:pt-36 lg:pb-16">
        <div className="container-x grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <figure className="mx-auto w-full max-w-sm">
            <img
              src={d.cards.post}
              alt={s('cardAlt', { name: d.displayName, visa: d.visaLine, destination: d.destination })}
              width={1080}
              height={1350}
              className="h-auto w-full rounded-3xl border border-line shadow-[var(--tv-shadow-raised)]"
            />
          </figure>
          <div>
            <p className="type-overline text-highlight-fg">{s('kicker')}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl lg:text-5xl">{s('title', { name: d.displayName })}</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">{s('intro', { name: d.displayName })}</p>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm">
              <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink">
                <Stamp className="size-4 text-muted" aria-hidden /> {d.visaLine}
              </li>
              <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-ink">
                <MapPin className="size-4 text-muted" aria-hidden /> {d.destination}
              </li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#start" className={buttonClass({ variant: 'highlight', size: 'lg' })}>
                {s('ctaTitle')} <ArrowRight className="size-5" aria-hidden />
              </a>
              <Link to="/uygunluq-testi" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                <ClipboardCheck className="size-5" aria-hidden /> {s('quiz')}
              </Link>
            </div>
            {d.referralCode && <p className="mt-4 text-sm text-muted">{s('referralNote', { code: d.referralCode })}</p>}
          </div>
        </div>
      </section>

      <section id="start" className="scroll-mt-24 pb-16 lg:pb-24">
        <div className="container-x">
          <div className="card mx-auto max-w-2xl rounded-3xl p-5 sm:p-8">
            <LeadForm token={d.token} registerTo={registerTo} />
          </div>
        </div>
      </section>
    </div>
  );
}

const LeadForm = ({ token, registerTo }: { token: string; registerTo: string }) => {
  const { t } = useTranslation();
  const s = (k: string, o?: Record<string, unknown>) => String(t(`successShare.page.${k}`, o));
  const ids = { name: useId(), email: useId(), phone: useId(), message: useId(), hp: useId() };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state === 'busy') return;
    if (!email.trim() && !phone.trim()) return setError(s('contactRequired'));
    setError(null);
    setState('busy');
    try {
      await api.post(`/success/${token}/lead`, { name: name.trim(), email: email.trim(), phone: phone.trim(), message: message.trim(), consent, locale: currentSiteLocale(), website, ...leadContext() });
      setState('done');
    } catch (err) {
      setState('idle');
      setError(errorCode(err) === 'TOO_MANY_REQUESTS' ? s('tooMany') : errorCode(err) === 'CONTACT_REQUIRED' ? s('contactRequired') : s('error'));
    }
  };

  if (state === 'done') {
    return (
      <div className="py-4 text-center" role="status">
        <Success className="mx-auto w-36" />
        <h2 className="mt-4 font-display text-xl font-semibold text-ink">{s('sentTitle')}</h2>
        <p className="mt-2 text-sm text-muted">{s('sentText')}</p>
        <Link to={registerTo} className="btn-primary mt-6">
          {s('register')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">{s('ctaTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{s('ctaText')}</p>
      </div>
      <div>
        <label htmlFor={ids.name} className="label">
          {s('name')}
        </label>
        <input id={ids.name} className="input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.email} className="label">
            {s('email')}
          </label>
          <input id={ids.email} type="email" className="input" maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor={ids.phone} className="label">
            {s('phone')}
          </label>
          <input id={ids.phone} type="tel" className="input" maxLength={40} autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <label htmlFor={ids.message} className="label">
          {s('message')}
        </label>
        <textarea id={ids.message} className="input min-h-24 resize-y" maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={ids.hp}>Website</label>
        <input id={ids.hp} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <label className="flex items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" className="mt-0.5 size-[1.125rem] shrink-0 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          {s('consent')}{' '}
          <Link to="/privacy" className="font-semibold text-link underline-offset-2 hover:underline">
            {s('privacy')}
          </Link>
        </span>
      </label>
      {error && (
        <p className="rounded-lg border border-danger-border bg-danger-bg p-2.5 text-sm text-danger-fg" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={state === 'busy' || !consent || name.trim().length < 2}>
          {state === 'busy' ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {state === 'busy' ? s('sending') : s('submit')}
        </button>
        <Link to={registerTo} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-link hover:underline">
          <CheckCircle2 className="size-4" aria-hidden /> {s('register')}
        </Link>
      </div>
    </form>
  );
};
