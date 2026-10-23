import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, FlaskConical, MailX, SearchX } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy, type Locale } from '@/i18n';
import { campaignConsentCopy } from '@/i18n/pagesCampaigns';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(campaignConsentCopy);

interface Info {
  test: boolean;
  kind?: 'SERVICE' | 'MARKETING';
  email?: string;
  locale?: Locale;
  marketingOptIn?: boolean;
  emailNotifications?: boolean;
  unsubscribedAt?: string | null;
}

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-surface pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
    <div className="container-x">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-card p-5 shadow-sm sm:p-10">{children}</div>
    </div>
  </section>
);

const Message = ({ icon: Icon, tone, title, text, children }: { icon: typeof CheckCircle2; tone: 'good' | 'warn' | 'muted'; title: string; text: string; children?: ReactNode }) => (
  <div className="py-4 text-center" role={tone === 'warn' ? 'alert' : 'status'}>
    <span className={clsx('mx-auto grid size-14 place-items-center rounded-full', tone === 'good' ? 'bg-emerald-100 text-emerald-700' : tone === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-surface text-muted')}>
      <Icon className="size-7" aria-hidden />
    </span>
    <h1 className="mt-4 text-xl font-bold text-navy-900 sm:text-2xl">{title}</h1>
    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{text}</p>
    {children}
  </div>
);

/**
 * Public /unsubscribe?token=… page linked from every campaign e-mail (and the STOP link of marketing SMS).
 * Shows what will change and asks for one click; mail clients use the RFC 8058 one-click POST directly.
 * Texts follow the recipient's language.
 */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { t: tUi, i18n } = useTranslation();
  const valid = /^[A-Za-z0-9_-]{4,64}$/.test(token);
  const info = useQuery({
    queryKey: ['unsubscribe', token],
    enabled: valid,
    retry: false,
    queryFn: async () => (await api.get<Info>(`/unsubscribe/${encodeURIComponent(token)}`)).data,
  });
  const t = info.data?.locale ? i18n.getFixedT(info.data.locale) : tUi;
  const u = (k: string, o?: Record<string, unknown>) => String(t(`campaignConsent.unsubscribe.${k}`, o));
  usePageTitle(u('title'));
  const [alsoAll, setAlsoAll] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const submit = async () => {
    setState('busy');
    try {
      await api.post(`/unsubscribe/${encodeURIComponent(token)}`, info.data?.kind === 'MARKETING' ? { scope: alsoAll ? 'all' : 'marketing' } : { scope: 'all' });
      setState('done');
    } catch {
      setState('error');
    }
  };

  const links = (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      <Link to="/account/profile?tab=notifications" className="btn-white btn-sm border border-line">
        {u('settings')}
      </Link>
      <Link to="/" className="btn-white btn-sm border border-line">
        {u('home')}
      </Link>
    </div>
  );

  if (!valid || info.isError)
    return (
      <Shell>
        <Message icon={SearchX} tone="warn" title={u('invalidTitle')} text={u('invalidText')}>
          {links}
        </Message>
      </Shell>
    );
  if (info.isLoading || !info.data)
    return (
      <Shell>
        <div className="grid min-h-[30vh] place-items-center text-brand-600" role="status" aria-label={u('loading')}>
          <Spinner className="size-8 border-[3px]" />
        </div>
      </Shell>
    );
  if (info.data.test)
    return (
      <Shell>
        <Message icon={FlaskConical} tone="muted" title={u('testTitle')} text={u('testText')}>
          {links}
        </Message>
      </Shell>
    );
  if (state === 'done')
    return (
      <Shell>
        <Message icon={CheckCircle2} tone="good" title={u('doneTitle')} text={u('doneText')}>
          {links}
        </Message>
      </Shell>
    );

  const marketing = info.data.kind === 'MARKETING';
  const already = marketing ? info.data.marketingOptIn === false : info.data.emailNotifications === false;
  return (
    <Shell>
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700">
          <MailX className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold text-navy-900 sm:text-2xl">{u('title')}</h1>
        <p className="mt-1 text-sm text-muted">{u('intro', { email: info.data.email })}</p>
      </div>
      <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-ink">{marketing ? u('marketing') : u('service')}</p>
      {already && <p className="mt-3 text-center text-sm text-muted">{u('already')}</p>}
      {marketing && (
        <label className="mt-4 flex items-start gap-2.5 text-sm text-ink/80">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={alsoAll} onChange={(e) => setAlsoAll(e.target.checked)} />
          <span>{u('alsoAll')}</span>
        </label>
      )}
      {state === 'error' && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {u('error')}
        </p>
      )}
      <button type="button" className="btn-primary mt-6 h-12 w-full" disabled={state === 'busy'} onClick={() => void submit()}>
        {state === 'busy' ? <Spinner className="size-4" /> : <MailX className="size-4" aria-hidden />} {u('button')}
      </button>
      {links}
    </Shell>
  );
}
