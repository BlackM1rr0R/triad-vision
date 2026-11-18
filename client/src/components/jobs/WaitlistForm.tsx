import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellPlus, MapPin, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { buttonClass } from '@/components/ui/Button';
import { Success } from '@/components/illustrations';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadContext } from '@/lib/leadVisitor';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesWaitlist } from '@/i18n/pagesWaitlist';
import { useAlertOptions } from './JobAlertForm';

registerCopy(pagesWaitlist);

/** One entry of GET /api/job-alerts/waitlist/mine (server lib/jobAlerts/waitlist.ts → waitlistView). */
export interface WaitlistEntry {
  id: string;
  profession: string | null;
  city: string | null;
  germanLevel: string | null;
  confirmed: boolean;
}

export const WAITLIST_MINE_KEY = ['vacancy-waitlist', 'mine'];

/** Suggestions for the place field (free text: any city or Bundesland works; the server folds umlauts). */
const PLACES = ['Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt am Main', 'Stuttgart', 'Düsseldorf', 'Leipzig', 'Dortmund', 'Nürnberg', 'Hannover', 'Bremen', 'Bayern', 'Baden-Württemberg', 'Nordrhein-Westfalen', 'Niedersachsen', 'Hessen', 'Sachsen'];
const LEVELS = ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * "Uyğun vakansiya açılanda xəbər ver" — the vacancy waitlist (server lib/jobAlerts/waitlist.ts). Shown where no
 * suitable vacancy with a free place exists. Signed-in clients join with their account (in-app + e-mail); visitors give
 * an e-mail and tick the consent box (double opt-in e-mail; the sign-up also reaches the team as a lead).
 *
 * `profession`: a profession key or free text to preselect (e.g. a vacancy's profession); `only`: limit the choice to
 * these profession keys (profession hubs); `full`: the text for a vacancy without free places.
 */
export const WaitlistForm = ({
  profession,
  only,
  city: initialCity,
  full,
  className,
  bare,
}: {
  profession?: string | null;
  only?: string[];
  city?: string | null;
  full?: boolean;
  className?: string;
  /** No card frame (inside another card). */
  bare?: boolean;
}) => {
  const { t } = useTranslation();
  const id = useId();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isClient = user?.role === 'CLIENT';
  const { data: options } = useAlertOptions(profession && !only?.includes(profession) ? profession : null);
  const [key, setKey] = useState(only?.length && profession && only.includes(profession) ? profession : (only?.[0] ?? ''));
  const [city, setCity] = useState(initialCity ?? '');
  const [germanLevel, setGermanLevel] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<{ s: 'idle' | 'sending' | 'error' | 'pending' | 'done'; msg?: string; already?: boolean }>({ s: 'idle' });

  useEffect(() => {
    if (options?.suggested) setKey((k) => k || options.suggested!);
  }, [options?.suggested]);

  const mine = useQuery({
    queryKey: WAITLIST_MINE_KEY,
    queryFn: async () => (await api.get<{ items: WaitlistEntry[] }>('/job-alerts/waitlist/mine')).data.items,
    enabled: isClient,
    staleTime: 30_000,
  });

  const choices = (options?.professions ?? []).filter((p) => !only?.length || only.includes(p.key));
  const label = (k: string | null) => options?.professions.find((p) => p.key === k)?.label ?? k ?? '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!key) return setState({ s: 'error', msg: t('waitlist.errors.pickProfession') });
    if (!isClient && !consent) return setState({ s: 'error', msg: t('waitlist.errors.consent') });
    setState({ s: 'sending' });
    try {
      const { data } = await api.post<{ confirmed: boolean; already?: boolean }>('/job-alerts/waitlist', {
        profession: key,
        city: city.trim() || null,
        germanLevel: germanLevel || null,
        lng: currentSiteLocale(),
        ...(isClient ? {} : { email, name: name.trim() || undefined, consent, website, ...leadContext() }),
      });
      setState({ s: data.confirmed ? 'done' : 'pending', already: !!data.already });
      if (isClient) await qc.invalidateQueries({ queryKey: WAITLIST_MINE_KEY });
    } catch (err) {
      setState({ s: 'error', msg: errorCode(err) === 'TOO_MANY_ALERTS' ? t('waitlist.errors.tooMany') : t('waitlist.errors.generic') });
    }
  };

  const remove = async (entryId: string) => {
    try {
      await api.delete(`/job-alerts/waitlist/mine/${entryId}`);
      toast.success(t('waitlist.removed'));
      await qc.invalidateQueries({ queryKey: WAITLIST_MINE_KEY });
    } catch {
      toast.error(t('waitlist.errors.generic'));
    }
  };

  const frame = bare ? className : clsx('card card-pad rounded-3xl', className);

  if (state.s === 'pending' || state.s === 'done') {
    return (
      <div className={clsx(frame, 'text-center')} role="status" data-testid="waitlist-done">
        <Success className="mx-auto w-28" />
        <p className="mt-3 font-display text-lg font-semibold text-ink">{t(state.s === 'pending' ? 'waitlist.pendingTitle' : 'waitlist.doneTitle')}</p>
        <p className="mt-1 text-sm text-muted">{state.s === 'pending' ? t('waitlist.pendingText', { email }) : state.already ? t('waitlist.already') : t('waitlist.doneText')}</p>
        {state.s === 'done' && (
          <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-link hover:underline" onClick={() => setState({ s: 'idle' })}>
            {t('waitlist.another')}
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={frame} aria-labelledby={`${id}-title`} data-testid="waitlist-form">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft" aria-hidden>
          <BellPlus className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-lg font-semibold text-ink">
            {t('waitlist.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t(full ? 'waitlist.textFull' : 'waitlist.text')}</p>
        </div>
      </div>

      {isClient && !!mine.data?.length && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-ink">{t('waitlist.mine')}</h3>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
            {mine.data.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 text-sm text-ink">
                  <span className="font-semibold">{label(m.profession)}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-muted">
                    <MapPin className="size-3.5" aria-hidden /> {m.city || t('waitlist.anyCity')}
                  </span>
                </span>
                <button type="button" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-muted hover:bg-sunken hover:text-danger-fg" onClick={() => void remove(m.id)}>
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">{t('waitlist.remove')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-prof`} className="label">
              {t('waitlist.profession')}
            </label>
            <select id={`${id}-prof`} className="input" value={key} onChange={(e) => setKey(e.target.value)} required>
              <option value="">{t('waitlist.choose')}</option>
              {choices.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-de`} className="label">
              {t('waitlist.german')}
            </label>
            <select id={`${id}-de`} className="input" value={germanLevel} onChange={(e) => setGermanLevel(e.target.value)}>
              <option value="">{t('waitlist.germanAny')}</option>
              {(options?.germanLevels ?? LEVELS).map((l) => (
                <option key={l} value={l}>
                  {l === 'none' ? t('waitlist.germanNone') : l}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-city`} className="label">
            {t('waitlist.city')}
          </label>
          <input id={`${id}-city`} className="input" maxLength={80} list={`${id}-places`} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} aria-describedby={`${id}-city-hint`} />
          <datalist id={`${id}-places`}>
            {PLACES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <p id={`${id}-city-hint`} className="mt-1 text-xs text-muted">
            {t('waitlist.cityHint')}
          </p>
        </div>

        {isClient ? (
          <p className="text-sm text-muted">{t('waitlist.account', { email: user?.email ?? '' })}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-email`} className="label">
                  {t('waitlist.email')}
                </label>
                <input id={`${id}-email`} type="email" required maxLength={190} autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${id}-name`} className="label">
                  {t('waitlist.name')}
                </label>
                <input id={`${id}-name`} maxLength={120} autoComplete="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
              <span>
                {t('waitlist.consent')}{' '}
                <Link to="/privacy" target="_blank" className="text-link underline">
                  {t('waitlist.privacyLink')}
                </Link>
              </span>
            </label>
            {/* honeypot for bots */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
          </>
        )}

        {state.s === 'error' && (
          <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger-fg" role="alert">
            {state.msg}
          </p>
        )}
        <button type="submit" className={buttonClass({ className: 'w-full sm:w-auto' })} disabled={state.s === 'sending' || (!isClient && !email)}>
          <BellPlus className="size-4" aria-hidden /> {state.s === 'sending' ? t('waitlist.sending') : t('waitlist.submit')}
        </button>
      </form>
    </section>
  );
};

export default WaitlistForm;
