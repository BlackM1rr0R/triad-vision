import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Clock, Lock, Search, ShieldCheck, Users } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSite } from '@/i18n/pagesSite';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHero } from '@/components/layout/PageHero';

registerCopy(pagesSite);

/** Answer of POST /api/site/status/lookup | /link (server/src/lib/site/publicStatus.ts). */
interface PublicStatus {
  caseNumber: string | null;
  step: number;
  stepKey: string | null;
  steps: number;
  state: 'ACTIVE' | 'COMPLETED' | 'CLOSED';
  ball: 'APPLICANT' | 'TEAM' | 'EMBASSY' | 'NONE';
  lastUpdate: string;
}

const STEP_KEYS = ['documents', 'contract', 'embassyDocs', 'appointment', 'decision', 'result'] as const;

const formatDay = (iso: string, lng: string) =>
  new Intl.DateTimeFormat({ az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' }[lng.slice(0, 2)] ?? 'az-Latn-AZ', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

const Result = ({ s, family, onAgain }: { s: PublicStatus; family: boolean; onAgain: () => void }) => {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">
          {family ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              {t('site.status.family')}
            </span>
          ) : (
            s.caseNumber
          )}
        </p>
        {s.step >= 0 && <p className="text-sm font-semibold text-brand-700">{t('site.status.stepOf', { step: s.step + 1, total: s.steps })}</p>}
      </div>
      {s.state === 'CLOSED' ? (
        <p className="rounded-xl bg-surface p-4 font-semibold text-navy-900">{t('site.status.closed')}</p>
      ) : (
        <ol className="grid gap-2 sm:grid-cols-6 sm:gap-1.5">
          {STEP_KEYS.map((k, i) => {
            const done = i < s.step || (s.state === 'COMPLETED' && i === s.step);
            const current = i === s.step && s.state !== 'COMPLETED';
            return (
              <li key={k} className="flex items-center gap-3 sm:flex-col sm:items-stretch sm:gap-1.5" aria-current={current ? 'step' : undefined}>
                <span
                  className={clsx(
                    'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold sm:h-1.5 sm:w-full sm:rounded-full',
                    done ? 'bg-brand-600 text-white' : current ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500 sm:ring-0' : 'bg-surface text-muted',
                    current && 'sm:bg-brand-400',
                  )}
                >
                  <span className="sm:hidden">{done ? <Check className="size-4" aria-hidden /> : i + 1}</span>
                </span>
                <span className={clsx('text-sm sm:text-xs', current ? 'font-bold text-navy-900' : done ? 'text-ink' : 'text-muted')}>{t(`site.status.steps.${k}`)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {s.state !== 'CLOSED' && <p className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm font-medium text-navy-900">{t(`site.status.ball.${s.ball}`)}</p>}
      <p className="flex items-center gap-2 text-sm text-muted">
        <Clock className="size-4 shrink-0" aria-hidden />
        {t('site.status.lastUpdate', { date: formatDay(s.lastUpdate, i18n.language) })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to="/login" className="btn-primary min-h-11">
          {t('site.status.login')}
        </Link>
        {!family && (
          <button type="button" onClick={onAgain} className="btn-ghost min-h-11">
            {t('site.status.again')}
          </button>
        )}
      </div>
    </div>
  );
};

export default function StatusPage() {
  const { t } = useTranslation();
  usePageTitle(t('site.status.title'));
  const ids = { number: useId(), dob: useId(), hp: useId() };
  const [caseNumber, setCaseNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: PublicStatus; family: boolean } | null>(null);

  const explain = (err: unknown, family: boolean) => {
    const code = errorCode(err);
    if (code === 'STATUS_LOCKED') {
      const minutes = (err as { response?: { data?: { minutes?: number } } }).response?.data?.minutes ?? 60;
      return t('site.status.locked', { minutes });
    }
    if (code === 'STATUS_NOT_FOUND') return family ? t('site.status.linkInvalid') : t('site.status.notFound');
    if (code === 'TOO_MANY_REQUESTS') return t('site.status.locked', { minutes: 15 });
    return t('site.status.error');
  };

  // Family link: /status#k=<token> (the fragment never reaches server logs).
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('k');
    if (!token) return;
    setBusy(true);
    api
      .post<{ status: PublicStatus }>('/site/status/link', { token })
      .then((r) => setResult({ status: r.data.status, family: true }))
      .catch((err) => setError(explain(err, true)))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ status: PublicStatus }>('/site/status/lookup', { caseNumber: caseNumber.trim(), birthDate, ...(website ? { website } : {}) });
      setResult({ status: r.data.status, family: false });
    } catch (err) {
      setError(explain(err, false));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHero title={t('site.status.title')} subtitle={t('site.status.subtitle')} image="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2000&q=70" />
      <section className="section">
        <div className="container-x max-w-3xl">
          <div className="card card-pad">
            {result ? (
              <Result s={result.status} family={result.family} onAgain={() => setResult(null)} />
            ) : (
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={ids.number} className="label">
                      {t('site.status.caseNumber')}
                    </label>
                    <input
                      id={ids.number}
                      required
                      maxLength={40}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder={t('site.status.caseNumberHint')}
                      value={caseNumber}
                      onChange={(e) => setCaseNumber(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor={ids.dob} className="label">
                      {t('site.status.birthDate')}
                    </label>
                    <input id={ids.dob} required type="date" min="1900-01-01" max="2030-12-31" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="input" />
                  </div>
                </div>
                <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
                  <label htmlFor={ids.hp}>Website</label>
                  <input id={ids.hp} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                {error && (
                  <p role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                    <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}
                <button type="submit" disabled={busy || caseNumber.trim().length < 3 || !birthDate} className="btn-primary min-h-11 w-full disabled:opacity-60 sm:w-auto">
                  <Search className="size-4" aria-hidden />
                  {busy ? t('site.status.checking') : t('site.status.submit')}
                </button>
              </form>
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-sm text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            {t('site.status.privacy')}
          </p>
        </div>
      </section>
    </>
  );
}
