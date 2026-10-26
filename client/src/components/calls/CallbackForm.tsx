import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerCopy } from '@/i18n';
import { pagesCalls } from '@/i18n/pagesCalls';
import { Modal } from './Modal';
import { bakuTime, useCallbackSlots } from './api';

registerCopy(pagesCalls);

const TOPICS = ['work', 'ausbildung', 'family', 'study', 'documents', 'other'] as const;
const LANGS = ['az', 'de', 'en', 'ru'] as const;
type Source = 'contact' | 'footer' | 'advisor' | 'portal' | 'livechat';

/**
 * "Mənə zəng edin": name, phone (prefilled for signed-in clients), language, topic and a time window
 * (today / tomorrow, 1-hour windows in Baku office hours, or "as soon as possible"). POST /api/callback.
 */
export const CallbackForm = ({ source, onDone, compact, initialMessage }: { source: Source; onDone?: () => void; compact?: boolean; /** Prefilled message (e.g. a calculator result). */ initialMessage?: string }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const ids = useId();
  const uiLang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const isClient = user?.role === 'CLIENT';
  const slots = useCallbackSlots();
  const [name, setName] = useState(isClient ? `${user!.firstName} ${user!.lastName}`.trim() : '');
  const [phone, setPhone] = useState(isClient ? (user!.phone ?? '') : '');
  const [lang, setLang] = useState<string>(LANGS.includes(uiLang as 'az') ? uiLang : 'az');
  const [topic, setTopic] = useState<string>('');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [slot, setSlot] = useState<string>('asap');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    if (!slot) return setError(t('callback.pickWindow'));
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ confirmation?: string }>('/callback', {
        name: name.trim(),
        phone: phone.trim(),
        lang,
        ...(topic ? { topic } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
        window: slot,
        source,
        consent: true,
        ...(honeypot ? { website: honeypot } : {}),
      });
      setDone(data.confirmation ?? t('livechat.sent'));
      onDone?.();
    } catch (err) {
      setError(errorCode(err) === 'TOO_MANY_REQUESTS' ? t('callback.tooMany') : t('callback.error'));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="space-y-3 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
        <p className="text-sm font-semibold text-ink">{done}</p>
        <button type="button" className="btn-ghost btn-sm border border-line" onClick={() => setDone(null)}>
          {t('callback.again')}
        </button>
      </div>
    );

  const data = slots.data;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>
      <div className={clsx('grid gap-3', !compact && 'sm:grid-cols-2')}>
        <label className="block">
          <span className="label">{t('callback.name')}</span>
          <input className="input" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('callback.phone')}</span>
          <input className="input" required type="tel" inputMode="tel" pattern="^\+?[\d\s()\-]{6,30}$" autoComplete="tel" placeholder="+994 50 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('callback.lang')}</span>
          <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {{ az: 'Azərbaycanca', de: 'Deutsch', en: 'English', ru: 'Русский' }[l]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t('callback.topic')}</span>
          <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">—</option>
            {TOPICS.map((k) => (
              <option key={k} value={k}>
                {t(`callback.topics.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="label">{t('callback.when')}</legend>
        <div className="space-y-2">
          <button
            type="button"
            aria-pressed={slot === 'asap'}
            onClick={() => setSlot('asap')}
            className={clsx('min-h-11 w-full rounded-lg border px-3 text-left text-sm font-semibold transition sm:min-h-10', slot === 'asap' ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:border-brand-400')}
          >
            {data && !data.open ? t('callback.asapClosed') : t('callback.asap')}
          </button>
          {data?.days.map((d) => (
            <div key={d.date}>
              <p className="mb-1 text-xs font-semibold text-muted">{t(`callback.${d.label}`)}</p>
              {d.windows.length === 0 ? (
                <p className="text-xs text-muted">{t('callback.closed')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {d.windows.map((w) => (
                    <button
                      key={w.start}
                      type="button"
                      aria-pressed={slot === w.start}
                      onClick={() => setSlot(w.start)}
                      className={clsx('min-h-11 rounded-lg border px-1 text-sm font-semibold tabular-nums transition sm:min-h-9 sm:text-xs', slot === w.start ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-card text-ink hover:border-brand-400')}
                    >
                      {bakuTime(w.start, i18n.language)}–{bakuTime(w.end, i18n.language)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="label">{t('callback.message')}</span>
        <textarea className="input min-h-16 text-sm" maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-xs text-muted" htmlFor={`${ids}-consent`}>
        <input id={`${ids}-consent`} type="checkbox" className="mt-0.5 size-4 shrink-0" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          {t('callback.consent')}{' '}
          <Link to="/privacy" className="font-semibold text-brand-700 underline" target="_blank">
            {t('callback.privacy')}
          </Link>
        </span>
      </label>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={busy || !consent}>
        <PhoneCall className="size-4" aria-hidden /> {busy ? t('callback.sending') : t('callback.submit')}
      </button>
    </form>
  );
};

/** Button + dialog with the callback form (footer, contact page, client portal). */
export const CallbackButton = ({ source, className, label }: { source: Source; className?: string; label?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'btn-primary btn-sm'} onClick={() => setOpen(true)}>
        <PhoneCall className="size-4" aria-hidden /> {label ?? t('callback.open')}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('callback.title')}>
        <p className="mb-3 text-xs text-muted">{t('callback.subtitle')}</p>
        <CallbackForm source={source} compact />
      </Modal>
    </>
  );
};

export default CallbackButton;

/** Client portal card: "call me back" with the phone prefilled from the profile. */
export const PortalCallbackCard = () => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 sm:flex-row sm:items-center">
      <p className="min-w-0 flex-1 text-sm text-muted">
        <span className="block font-semibold text-ink">{t('callback.title')}</span>
        {t('callback.subtitle')}
      </p>
      <CallbackButton source="portal" />
    </div>
  );
};

/** Contact page block with the full form. */
export const ContactCallbackCard = () => {
  const { t } = useTranslation();
  return (
    <div className="card card-pad">
      <h2 className="mb-1 font-display text-xl font-extrabold text-navy-900">{t('callback.title')}</h2>
      <p className="mb-4 text-sm text-muted">{t('callback.subtitle')}</p>
      <CallbackForm source="contact" compact />
    </div>
  );
};
