import { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellOff, BellRing, CheckCircle2, CircleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ProfessionPicker, useAlertOptions } from '@/components/jobs/JobAlertForm';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';

registerCopy(pagesDiscover);

interface AlertView {
  id: string;
  email: string;
  locale: string;
  professions: string[];
  germanLevel: string | null;
  kinds: string[];
  confirmed: boolean;
  unsubscribed: boolean;
}

/**
 * /job-alert?token=…[&action=confirm|unsubscribe] — the link of every job alert e-mail (no login): confirm the
 * double opt-in, change professions / German level / job kinds, unsubscribe or turn the alert back on. State
 * changes are POSTs from this page, so mail scanners that prefetch links never confirm or unsubscribe anyone.
 */
export default function JobAlertManage() {
  const { t } = useTranslation();
  usePageTitle(t('discover.alerts.manage.title'));
  const id = useId();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const action = params.get('action');
  const [alert, setAlert] = useState<AlertView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ professions: string[]; germanLevel: string; kinds: string[] }>({ professions: [], germanLevel: '', kinds: [] });
  const { data: options } = useAlertOptions();
  const started = useRef(false);

  const load = (a: AlertView) => {
    setAlert(a);
    setDraft({ professions: a.professions, germanLevel: a.germanLevel ?? '', kinds: a.kinds });
    setStatus('ready');
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      try {
        if (action === 'confirm') {
          load((await api.post<{ alert: AlertView }>('/job-alerts/confirm', { token })).data.alert);
          setNotice(t('discover.alerts.manage.confirmed'));
        } else load((await api.get<{ alert: AlertView }>('/job-alerts/manage', { params: { token } })).data.alert);
      } catch {
        setStatus('invalid');
      }
    };
    void run();
  }, [action, token, t]);

  const post = async (path: 'unsubscribe' | 'resume') => {
    setBusy(true);
    try {
      load((await api.post<{ alert: AlertView }>(`/job-alerts/${path}`, { token })).data.alert);
      setNotice(path === 'unsubscribe' ? t('discover.alerts.manage.unsubscribed') : t('discover.alerts.confirmedTitle'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft.professions.length) {
      setNotice(t('discover.alerts.pickProfession'));
      return;
    }
    setBusy(true);
    try {
      load((await api.patch<{ alert: AlertView }>('/job-alerts/manage', { token, professions: draft.professions, germanLevel: draft.germanLevel || null, kinds: draft.kinds })).data.alert);
      setNotice(t('discover.alerts.manage.saved'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section bg-surface pt-28 sm:pt-36">
      <div className="container-x max-w-2xl">
        <h1 className="h-section text-navy-900">{t('discover.alerts.manage.title')}</h1>
        {status === 'loading' ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" /> {action === 'confirm' ? t('discover.alerts.manage.confirming') : t('discover.alerts.manage.loading')}
          </p>
        ) : status === 'invalid' || !alert ? (
          <div className="card card-pad mt-6 flex gap-3">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="text-sm text-ink">{t('discover.alerts.manage.invalid')}</p>
              <Link to="/jobs" className="btn-primary btn-sm mt-4">
                {t('discover.alerts.manage.toJobs')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {notice && (
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {notice}
              </p>
            )}
            <div className="card card-pad">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-muted">{t('discover.alerts.manage.emailLabel')}</dt>
                  <dd className="mt-0.5 font-semibold text-navy-900">{alert.email}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-muted">{t('discover.alerts.manage.status')}</dt>
                  <dd className="mt-0.5 font-semibold text-navy-900">
                    {alert.unsubscribed ? t('discover.alerts.manage.paused') : alert.confirmed ? t('discover.alerts.manage.active') : t('discover.alerts.manage.pending')}
                  </dd>
                </div>
              </dl>
            </div>

            {action === 'unsubscribe' && !alert.unsubscribed && (
              <div className="card card-pad border-amber-200">
                <h2 className="font-display text-lg font-bold text-navy-900">{t('discover.alerts.manage.unsubscribeTitle')}</h2>
                <p className="mt-1 text-sm text-muted">{t('discover.alerts.manage.unsubscribeText')}</p>
                <button type="button" className="btn-primary mt-4" disabled={busy} onClick={() => void post('unsubscribe')}>
                  <BellOff className="size-4" aria-hidden /> {t('discover.alerts.manage.unsubscribeBtn')}
                </button>
              </div>
            )}

            {alert.unsubscribed ? (
              <button type="button" className="btn-outline" disabled={busy} onClick={() => void post('resume')}>
                <BellRing className="size-4" aria-hidden /> {t('discover.alerts.manage.resume')}
              </button>
            ) : (
              <div className="card card-pad space-y-4">
                {options && <ProfessionPicker options={options.professions} value={draft.professions} onChange={(professions) => setDraft((d) => ({ ...d, professions }))} legend={t('discover.alerts.professions')} hint={t('discover.alerts.professionsHint')} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-de`} className="label">
                      {t('discover.alerts.german')}
                    </label>
                    <select id={`${id}-de`} className="input" value={draft.germanLevel} onChange={(e) => setDraft((d) => ({ ...d, germanLevel: e.target.value }))}>
                      <option value="">{t('discover.alerts.germanAny')}</option>
                      {(options?.germanLevels ?? []).map((l) => (
                        <option key={l} value={l}>
                          {l === 'none' ? t('discover.compare.questions.german.options.none') : l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <fieldset>
                    <legend className="label">{t('discover.alerts.kinds')}</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-2">
                      {(options?.kinds ?? []).map((k) => (
                        <label key={k} className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
                          <input type="checkbox" className="size-4 accent-brand-600" checked={draft.kinds.includes(k)} onChange={() => setDraft((d) => ({ ...d, kinds: d.kinds.includes(k) ? d.kinds.filter((x) => x !== k) : [...d.kinds, k] }))} />
                          {t(`discover.alerts.kind.${k}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
                    {t('discover.alerts.manage.save')}
                  </button>
                  {action !== 'unsubscribe' && (
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void post('unsubscribe')}>
                      <BellOff className="size-4" aria-hidden /> {t('discover.alerts.manage.unsubscribeBtn')}
                    </button>
                  )}
                </div>
              </div>
            )}
            <Link to="/jobs" className="inline-flex text-sm font-semibold text-brand-700 hover:underline">
              {t('discover.alerts.manage.toJobs')}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
