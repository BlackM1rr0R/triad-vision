import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing, Check, MailCheck } from 'lucide-react';
import clsx from 'clsx';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadContext } from '@/lib/leadVisitor';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';

registerCopy(pagesDiscover);

export interface AlertOptions {
  professions: { key: string; label: string; family: string | null }[];
  germanLevels: string[];
  kinds: ('work' | 'ausbildung' | 'seasonal')[];
  suggested: string | null;
}

export const useAlertOptions = (profession?: string | null) => {
  const lng = currentSiteLocale();
  return useQuery({
    queryKey: ['job-alert-options', lng, profession ?? ''],
    queryFn: async () => (await api.get<AlertOptions>('/job-alerts/options', { params: { lng, ...(profession ? { profession } : {}) } })).data,
    staleTime: 60 * 60_000,
  });
};

/** Profession chips (multi-select, checkbox semantics). */
export const ProfessionPicker = ({ options, value, onChange, legend, hint }: { options: AlertOptions['professions']; value: string[]; onChange: (v: string[]) => void; legend: string; hint?: string }) => (
  <fieldset>
    <legend className="label">
      {legend} {hint && <span className="font-normal text-muted">· {hint}</span>}
    </legend>
    <div className="flex flex-wrap gap-2">
      {options.map((p) => {
        const on = value.includes(p.key);
        return (
          <label
            key={p.key}
            className={clsx(
              'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400',
              on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-navy-900 hover:border-brand-400',
            )}
          >
            <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== p.key) : [...value, p.key].slice(0, 10))} />
            {on && <Check className="size-3.5" aria-hidden />} {p.label}
          </label>
        );
      })}
    </div>
  </fieldset>
);

/**
 * "Notify me about new jobs" (public board and job pages). Visitors get a double opt-in e-mail; a signed-in
 * client using the account address is subscribed at once (server decides).
 */
export const JobAlertForm = ({ profession, className }: { profession?: string | null; className?: string }) => {
  const { t } = useTranslation();
  const id = useId();
  const { user } = useAuth();
  const { data: options } = useAlertOptions(profession);
  const [email, setEmail] = useState('');
  const [professions, setProfessions] = useState<string[]>([]);
  const [germanLevel, setGermanLevel] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<{ s: 'idle' | 'sending' | 'error' | 'pending' | 'confirmed'; msg?: string }>({ s: 'idle' });

  useEffect(() => {
    if (user?.role === 'CLIENT' && !email) setEmail(user.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  useEffect(() => {
    if (options?.suggested) setProfessions((p) => (p.length ? p : [options.suggested!]));
  }, [options?.suggested]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!professions.length) {
      setState({ s: 'error', msg: t('discover.alerts.pickProfession') });
      return;
    }
    setState({ s: 'sending' });
    try {
      const { data } = await api.post<{ confirmed: boolean }>('/job-alerts', {
        email,
        professions,
        germanLevel: germanLevel || null,
        kinds: kinds.length ? kinds : undefined,
        lng: currentSiteLocale(),
        website,
        visitorId: leadContext().visitorId,
      });
      setState({ s: data.confirmed ? 'confirmed' : 'pending' });
    } catch (err) {
      setState({ s: 'error', msg: errorCode(err) === 'TOO_MANY_ALERTS' ? t('discover.alerts.tooMany') : t('discover.alerts.error') });
    }
  };

  if (state.s === 'pending' || state.s === 'confirmed') {
    return (
      <div className={clsx('card card-pad text-center', className)} role="status">
        <MailCheck className="mx-auto size-10 text-brand-600" aria-hidden />
        <p className="mt-3 font-display text-lg font-bold text-navy-900">{t(state.s === 'pending' ? 'discover.alerts.pendingTitle' : 'discover.alerts.confirmedTitle')}</p>
        <p className="mt-1 text-sm text-muted">{state.s === 'pending' ? t('discover.alerts.pendingText', { email }) : t('discover.alerts.confirmedText')}</p>
      </div>
    );
  }

  return (
    <section className={clsx('card card-pad', className)} aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="font-display text-lg font-bold text-navy-900">
            {t('discover.alerts.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('discover.alerts.text')}</p>
        </div>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {options ? (
          <ProfessionPicker options={options.professions} value={professions} onChange={setProfessions} legend={t('discover.alerts.professions')} hint={t('discover.alerts.professionsHint')} />
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-surface" aria-hidden />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-de`} className="label">
              {t('discover.alerts.german')}
            </label>
            <select id={`${id}-de`} className="input" value={germanLevel} onChange={(e) => setGermanLevel(e.target.value)}>
              <option value="">{t('discover.alerts.germanAny')}</option>
              {(options?.germanLevels ?? ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']).map((l) => (
                <option key={l} value={l}>
                  {l === 'none' ? t('discover.compare.questions.german.options.none') : l}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="label">{t('discover.alerts.kinds')}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
              {(options?.kinds ?? ['work', 'ausbildung', 'seasonal']).map((k) => (
                <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="size-4 accent-brand-600" checked={kinds.includes(k)} onChange={() => setKinds((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))} />
                  {t(`discover.alerts.kind.${k}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-email`} className="label">
              {t('discover.alerts.email')}
            </label>
            <input id={`${id}-email`} type="email" required maxLength={190} autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary shrink-0" disabled={state.s === 'sending'}>
            <BellRing className="size-4" aria-hidden /> {state.s === 'sending' ? t('discover.alerts.sending') : t('discover.alerts.submit')}
          </button>
        </div>
        {/* honeypot for bots */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} />
        {state.s === 'error' && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {state.msg}
          </p>
        )}
        <p className="text-xs leading-relaxed text-muted">{t('discover.alerts.privacy')}</p>
      </form>
    </section>
  );
};
