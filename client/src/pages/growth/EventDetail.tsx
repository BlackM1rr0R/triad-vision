import { useId, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarPlus, Info, PlayCircle } from 'lucide-react';
import { PageHero } from '@/components/layout/PageHero';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { EventBadge, EventMeta } from '@/components/growth/EventCard';
import type { PublicEvent } from '@/components/growth/api';
import { registerCopy } from '@/i18n';
import { pagesGrowthPlus } from '@/i18n/pagesGrowthPlus';
import { pagesMarketing } from '@/i18n/pagesMarketing';
import { api, errorCode } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import NotFound from '../NotFound';

registerCopy(pagesGrowthPlus);
registerCopy(pagesMarketing);

/** "20261020T140000Z" for Google Calendar links. */
const gcalTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * "Add to calendar": the .ics file (with the registrant token from the e-mail link it also carries the join
 * link) and a Google Calendar template link (never with the join link).
 */
const CalendarButtons = ({ event, token, title }: { event: PublicEvent; token: string | null; title: string }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const ics = `/api/growth/events/${encodeURIComponent(event.slug)}/ics?lng=${locale}${token ? `&r=${encodeURIComponent(token)}` : ''}`;
  const page = `${window.location.origin}/events/${encodeURIComponent(event.slug)}`;
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: `Triad Vision · ${title}`,
    dates: `${gcalTime(event.startsAt)}/${gcalTime(event.endsAt)}`,
    details: page,
    ...(event.mode === 'OFFLINE' && event.address ? { location: event.address } : {}),
  }).toString()}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <CalendarPlus className="size-4 text-muted" aria-hidden /> {t('mk.events.addToCalendar')}:
      </span>
      <a href={ics} download className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        {t('mk.events.icsFile')}
      </a>
      <a href={google} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        {t('mk.events.google')}
      </a>
    </div>
  );
};

/** Past event + registrant token (link from the e-mails): the recording, once the team added it. */
const Recording = ({ slug, token }: { slug: string; token: string }) => {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['growth', 'event-recording', slug, token],
    queryFn: async () => (await api.get<{ recordingUrl: string | null; name: string }>(`/growth/events/${encodeURIComponent(slug)}/recording?r=${encodeURIComponent(token)}`)).data,
    retry: false,
  });
  if (!data) return null;
  return (
    <div className="text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl chip-sky"><PlayCircle className="size-7" aria-hidden /></span>
      <h2 className="mt-3 font-display text-xl font-semibold text-ink">{t('mk.events.recordingTitle')}</h2>
      {data.recordingUrl ? (
        <>
          <p className="mt-2 text-sm text-muted">{t('mk.events.recordingText', { name: data.name })}</p>
          <a href={data.recordingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: 'lg', className: 'mt-5' })}>
            {t('mk.events.watch')}
          </a>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('mk.events.recordingSoon')}</p>
      )}
    </div>
  );
};

const HERO = 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=2000&q=70';
const KNOWN_ERRORS = ['ALREADY_REGISTERED', 'EVENT_FULL', 'REGISTRATION_CLOSED', 'TOO_MANY_REQUESTS', 'VALIDATION'];

export default function EventDetail() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('r');
  const { t } = useTranslation();
  const { tr, locale } = useL10n();
  const { user } = useAuth();
  const id = useId();
  const qc = useQueryClient();
  const { data: event, isLoading, isError } = useQuery({
    queryKey: ['growth', 'event', slug],
    queryFn: async () => (await api.get<{ event: PublicEvent }>(`/growth/events/${encodeURIComponent(slug)}`)).data.event,
    retry: false,
  });
  usePageTitle(event ? tr(event.title) : t('gp.events.heroTitle'));
  const [form, setForm] = useState(() => ({
    name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    locale,
    consent: false,
    website: '',
  }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Spinner />;
  if (isError || !event) return <NotFound />;
  const started = new Date(event.startsAt).getTime() <= Date.now();
  const upcoming = !started && event.status === 'PUBLISHED';

  const ready = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.consent;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/growth/events/${encodeURIComponent(event.slug)}/register`, { ...form, ...leadContext() });
      setDone(true);
      void qc.invalidateQueries({ queryKey: ['growth'] });
    } catch (err) {
      const code = errorCode(err);
      setError(KNOWN_ERRORS.includes(code) ? code : 'generic');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHero title={tr(event.title)} image={HERO} crumb={{ to: '/events', label: t('gp.events.back') }} />
      <section className="section">
        <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
          <div className="space-y-5">
            <Link to="/events" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden /> {t('gp.events.back')}
            </Link>
            <div className="card card-pad rounded-3xl">
              <EventBadge e={event} />
              <div className="mt-4">
                <EventMeta e={event} />
              </div>
              <p className="mt-5 max-w-[68ch] leading-relaxed whitespace-pre-line text-ink">{tr(event.description)}</p>
              {upcoming && (
                <div className="mt-5 border-t border-line pt-4">
                  <CalendarButtons event={event} token={token} title={tr(event.title)} />
                </div>
              )}
            </div>
          </div>

          <div className="card card-pad rounded-3xl lg:sticky lg:top-28">
            {done ? (
              <div className="text-center" role="status">
                <Success className="mx-auto w-36" />
                <h2 className="mt-3 font-display text-xl font-semibold text-ink">{t('gp.events.form.successTitle')}</h2>
                <p className="mt-2 text-sm text-muted">{t('gp.events.form.successText')}</p>
                <div className="mt-5 flex justify-center">
                  <CalendarButtons event={event} token={null} title={tr(event.title)} />
                </div>
                <Link to="/booking" className={buttonClass({ variant: 'outline', className: 'mt-5' })}>
                  {t('gp.calc.ctaBooking')}
                </Link>
              </div>
            ) : started && token ? (
              <Recording slug={event.slug} token={token} />
            ) : started ? (
              <p className="text-center text-muted">{t('mk.events.ended')}</p>
            ) : !event.registrationOpen ? (
              <p className="text-center text-muted">{event.status === 'CANCELLED' ? t('gp.events.cancelled') : event.seatsLeft === 0 ? t('gp.events.full') : t('gp.events.closed')}</p>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby={`${id}-title`}>
                <h2 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
                  {t('gp.events.form.title')}
                </h2>
                <div>
                  <label htmlFor={`${id}-name`} className="label">
                    {t('gp.events.form.name')}
                  </label>
                  <input id={`${id}-name`} className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-email`} className="label">
                      {t('gp.events.form.email')}
                    </label>
                    <input id={`${id}-email`} type="email" className="input" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`${id}-phone`} className="label">
                      {t('gp.events.form.phone')}
                    </label>
                    <input id={`${id}-phone`} type="tel" className="input" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor={`${id}-lang`} className="label">
                    {t('gp.events.form.language')}
                  </label>
                  <select id={`${id}-lang`} className="input" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value as typeof form.locale })}>
                    {(['az', 'de', 'en', 'ru'] as const).map((l) => (
                      <option key={l} value={l}>
                        {t(`gp.events.langNames.${l}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {/* honeypot for bots */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                <label className="flex items-start gap-2.5 text-sm text-muted">
                  <input type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
                  <span>
                    {t('gp.events.form.consent')}{' '}
                    <Link to="/privacy" target="_blank" className="font-semibold text-link underline-offset-2 hover:underline">
                      {t('gp.events.form.privacy')}
                    </Link>
                  </span>
                </label>
                {event.mode === 'ONLINE' && (
                  <p className="flex items-start gap-2 text-xs text-muted">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('gp.events.linkHint')}
                  </p>
                )}
                {error && (
                  <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-fg">
                    {t(`gp.events.form.errors.${error}`)}
                  </p>
                )}
                <button type="submit" className={buttonClass({ size: 'lg', block: true })} disabled={!ready || busy}>
                  {busy ? <Spinner /> : t('gp.events.form.submit')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
