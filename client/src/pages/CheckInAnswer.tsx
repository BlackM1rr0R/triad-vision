import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, Clock, HeartHandshake, SearchX } from 'lucide-react';
import { Handshake, Lost, Success } from '@/components/illustrations';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesTimeCare } from '@/i18n/pagesTimeCare';
import { usePageTitle } from '@/lib/usePageTitle';

registerCopy(pagesTimeCare);

const TOPICS = ['HOUSING', 'SALARY', 'WORKPLACE', 'TEAM', 'LANGUAGE', 'HOMESICK', 'HEALTH', 'DOCUMENTS', 'OTHER'] as const;
type Topic = (typeof TOPICS)[number];

interface CheckInInfo {
  id: string;
  audience: 'WORKER' | 'EMPLOYER';
  offsetDays: number;
  caseNumber: string | null;
  firstName: string | null;
  workerFirstName: string | null;
  company: string | null;
  answered: boolean;
  answer: 'OK' | 'ISSUE' | null;
  expired: boolean;
}

const Shell = ({ children }: { children: ReactNode }) => (
  <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
    <div className="container-x">
      <div className="card mx-auto w-full max-w-xl rounded-3xl p-5 sm:p-10">{children}</div>
    </div>
  </section>
);

// `icon` is kept for the call sites; the states now show an illustration.
const Message = ({ tone, title, text }: { icon: typeof CheckCircle2; tone: 'good' | 'warn' | 'muted'; title: string; text: string }) => {
  const { t } = useTranslation();
  return (
    <div className="py-4 text-center" role="status">
      {tone === 'good' ? <Success className="mx-auto w-36" /> : tone === 'warn' ? <Handshake className="mx-auto w-40" /> : <Lost className="mx-auto w-40" />}
      <h1 className="mt-5 font-display text-2xl font-semibold text-ink">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
      <Link to="/" className="btn-secondary mt-7 inline-flex">
        {t('checkIn.home')}
      </Link>
    </div>
  );
};

/** Post-arrival check-in (/check-in/:key): the e-mailed token, or the id for the signed-in worker / employer. */
export default function CheckInAnswer() {
  const { t } = useTranslation();
  usePageTitle(t('checkIn.title'));
  const { key = '' } = useParams();
  const [mode, setMode] = useState<'choose' | 'issue'>('choose');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [comment, setComment] = useState('');
  const q = useQuery({ queryKey: ['check-in', key], queryFn: async () => (await api.get<{ checkIn: CheckInInfo }>(`/check-ins/${key}`)).data.checkIn, retry: false });
  const send = useMutation({ mutationFn: async (body: { answer: 'OK' | 'ISSUE'; topics?: Topic[]; comment?: string | null }) => (await api.post<{ checkIn: CheckInInfo }>(`/check-ins/${key}`, body)).data.checkIn });

  if (q.isLoading)
    return (
      <Shell>
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      </Shell>
    );
  if (q.error || !q.data)
    return (
      <Shell>
        <Message icon={SearchX} tone="muted" title={t('checkIn.notFoundTitle')} text={t('checkIn.notFoundText')} />
      </Shell>
    );
  const c = send.data ?? q.data;
  if (send.data)
    return (
      <Shell>
        {send.data.answer === 'OK' ? (
          <Message icon={CheckCircle2} tone="good" title={t('checkIn.thanksOkTitle')} text={t('checkIn.thanksOkText')} />
        ) : (
          <Message icon={HeartHandshake} tone="warn" title={t('checkIn.thanksIssueTitle')} text={t('checkIn.thanksIssueText')} />
        )}
      </Shell>
    );
  if (c.answered)
    return (
      <Shell>
        <Message icon={CheckCircle2} tone="good" title={t('checkIn.answeredTitle')} text={t('checkIn.answeredText')} />
      </Shell>
    );
  if (c.expired)
    return (
      <Shell>
        <Message icon={Clock} tone="muted" title={t('checkIn.expiredTitle')} text={t('checkIn.expiredText')} />
      </Shell>
    );

  const error = send.error ? t(`checkIn.errors.${errorCode(send.error)}`, { defaultValue: t('checkIn.errors.generic') }) : null;
  const toggle = (k: Topic) => setTopics((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <Shell>
      <h1 className="font-display text-2xl font-semibold text-ink">{t('checkIn.title')}</h1>
      <p className="mt-2 text-muted">
        {c.audience === 'WORKER'
          ? t('checkIn.introWorker', { name: c.firstName ?? '', days: c.offsetDays })
          : t('checkIn.introEmployer', { company: c.company ?? '', worker: c.workerFirstName ?? '' })}
      </p>
      {mode === 'choose' ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="min-h-16 rounded-2xl border-2 border-success-border bg-success-bg px-4 text-base font-semibold text-success-fg transition-colors hover:border-success disabled:opacity-60"
            disabled={send.isPending}
            onClick={() => send.mutate({ answer: 'OK' })}
          >
            {t('checkIn.ok')}
          </button>
          <button type="button" className="min-h-16 rounded-2xl border-2 border-warning-border bg-warning-bg px-4 text-base font-semibold text-warning-fg transition-colors hover:border-warning" onClick={() => setMode('issue')}>
            {t('checkIn.issue')}
          </button>
        </div>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate({ answer: 'ISSUE', topics, comment: comment.trim() || null });
          }}
        >
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('checkIn.topicsTitle')}</legend>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={topics.includes(k)}
                  onClick={() => toggle(k)}
                  className={clsx('min-h-11 rounded-full border px-4 text-sm font-semibold transition', topics.includes(k) ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:border-line-strong')}
                >
                  {t(`checkIn.topics.${k}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="label">{t('checkIn.comment')}</span>
            <textarea className="input" rows={3} maxLength={2000} placeholder={t('checkIn.commentPh')} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" className="btn-secondary" onClick={() => setMode('choose')}>
              {t('checkIn.back')}
            </button>
            <button type="submit" className="btn-primary" disabled={send.isPending}>
              {t('checkIn.send')}
            </button>
          </div>
        </form>
      )}
      {mode === 'choose' && error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </Shell>
  );
}
