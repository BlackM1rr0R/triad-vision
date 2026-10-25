import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MailX } from 'lucide-react';
import { api } from '@/lib/api';
import { Lost, Success } from '@/components/illustrations';
import { Spinner } from '@/components/ui/Spinner';
import { usePageTitle } from '@/lib/usePageTitle';

/*
 * Google review request links (lib/googleReview on the API):
 *   /r/review/:token          → the API counts the click and redirects to Google (/api/r/review/:token)
 *   /r/review/:token/optout   → "no more review requests" (one click, in the recipient's language)
 * Copy inline: the page is tiny and the client languages are az / de / en / ru (anything else → English).
 */
const COPY = {
  az: { title: 'Rəy xahişlərindən imtina', text: 'Bundan sonra sizə Google rəyi xahişi göndərməyəcəyik. Digər bildirişlərə təsir etmir.', confirm: 'İmtina edirəm', done: 'Hazırdır — artıq rəy xahişi almayacaqsınız.', already: 'Siz artıq imtina etmisiniz.', invalid: 'Link səhvdir və ya köhnəlib.', error: 'Alınmadı. Yenidən cəhd edin.', home: 'Ana səhifəyə', redirect: 'Google-a yönləndirilir…' },
  de: { title: 'Keine Bewertungsanfragen mehr', text: 'Wir senden Ihnen keine Bitte um eine Google-Bewertung mehr. Andere Benachrichtigungen bleiben unverändert.', confirm: 'Abmelden', done: 'Erledigt — Sie erhalten keine Bewertungsanfragen mehr.', already: 'Sie haben sich bereits abgemeldet.', invalid: 'Der Link ist falsch oder veraltet.', error: 'Das hat nicht geklappt. Bitte erneut versuchen.', home: 'Zur Startseite', redirect: 'Weiterleitung zu Google…' },
  en: { title: 'No more review requests', text: 'We will not ask you for a Google review again. Other notifications are not affected.', confirm: 'Opt out', done: 'Done — you will not get review requests any more.', already: 'You have already opted out.', invalid: 'The link is wrong or outdated.', error: 'That did not work. Please try again.', home: 'Home page', redirect: 'Redirecting to Google…' },
  ru: { title: 'Отказ от просьб об отзыве', text: 'Мы больше не будем просить вас оставить отзыв в Google. Другие уведомления не затрагиваются.', confirm: 'Отказаться', done: 'Готово — просьб об отзыве больше не будет.', already: 'Вы уже отказались.', invalid: 'Ссылка неверна или устарела.', error: 'Не получилось. Попробуйте ещё раз.', home: 'На главную', redirect: 'Переход в Google…' },
} as const;
type Lang = keyof typeof COPY;
const langOf = (l: string | undefined): Lang => ((l ?? '').slice(0, 2) in COPY ? ((l ?? '').slice(0, 2) as Lang) : 'en');

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28">
    <div className="container-x">
      <div className="card mx-auto w-full max-w-xl rounded-3xl p-6 text-center sm:p-10">{children}</div>
    </div>
  </section>
);

/** /r/review/:token — hands over to the API redirect (which counts the click). */
export function GoogleReviewRedirect() {
  const { token = '' } = useParams();
  const { i18n } = useTranslation();
  useEffect(() => {
    window.location.replace(`/api/r/review/${encodeURIComponent(token)}`);
  }, [token]);
  return (
    <Shell>
      <div className="grid min-h-[20vh] place-items-center text-primary" role="status">
        <Spinner className="size-8 border-[3px]" />
        <p className="mt-3 text-sm text-muted">{COPY[langOf(i18n.resolvedLanguage)].redirect}</p>
      </div>
    </Shell>
  );
}

/** /r/review/:token/optout */
export default function GoogleReviewOptOut() {
  const { token = '' } = useParams();
  const { i18n } = useTranslation();
  const info = useQuery({
    queryKey: ['google-review-optout', token],
    retry: false,
    queryFn: async () => (await api.get<{ locale: string; optedOut: boolean }>(`/r/review/${encodeURIComponent(token)}/info`)).data,
  });
  const c = COPY[langOf(info.data?.locale ?? i18n.resolvedLanguage)];
  usePageTitle(c.title);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

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
  if (state === 'done' || info.data.optedOut)
    return (
      <Shell>
        <Success className="mx-auto w-36" />
        <h1 className="mt-5 font-display text-xl font-semibold text-ink" role="status">
          {state === 'done' ? c.done : c.already}
        </h1>
        <Link to="/" className="btn-secondary mt-6">
          {c.home}
        </Link>
      </Shell>
    );
  return (
    <Shell>
      <span className="mx-auto grid size-14 place-items-center rounded-2xl chip-sky">
        <MailX className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-semibold text-ink sm:text-2xl">{c.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{c.text}</p>
      {state === 'error' && (
        <p className="mt-4 text-sm text-danger-fg" role="alert">
          {c.error}
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-6"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            await api.post(`/r/review/${encodeURIComponent(token)}/optout`);
            setState('done');
          } catch {
            setState('error');
          }
        }}
      >
        {state === 'busy' && <Spinner className="size-4" />} {c.confirm}
      </button>
    </Shell>
  );
}
