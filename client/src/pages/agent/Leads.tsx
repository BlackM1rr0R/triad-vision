import { useId, useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, ListChecks, Send, UserPlus } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Handshake } from '@/components/illustrations';
import { ErrorRetry, Loading, Pager, Section, type AgentMe } from '@/components/agents/portal';
import { day } from '@/components/agents/format';

registerCopy(pagesPortalExtras);

/** Server: routes/agentPortal.ts LEAD_INTERESTS. */
const INTERESTS = ['WORK', 'AUSBILDUNG', 'STUDY', 'CHANCENKARTE', 'FAMILY', 'RECOGNITION', 'OTHER'] as const;
type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'DONE';

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  interest: string | null;
  status: LeadStatus;
  converted: boolean;
  createdAt: string;
}
interface Resp {
  items: Lead[];
  total: number;
  pageSize: number;
}

const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: 'bg-info-bg text-info-fg',
  IN_PROGRESS: 'bg-warning-bg text-warning-fg',
  DONE: 'bg-sunken text-muted',
};

const EMPTY = { name: '', phone: '', email: '', country: '', interest: 'WORK' as (typeof INTERESTS)[number], message: '', consent: false };

/**
 * Agent portal › "Yeni müştəri": the agent registers a person who wants to go to Germany (POST /api/agent/leads →
 * an Inquiry attributed to the agent; staff are notified like for the contact form) and follows "my leads"
 * (status + converted, never staff notes).
 */
export default function AgentLeadsPage({ me }: { me: AgentMe }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const uid = useId();
  const [form, setForm] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const paused = me.agent.status !== 'ACTIVE';
  const q = useQuery({
    queryKey: ['agent-leads', page],
    queryFn: async () => (await api.get<Resp>('/agent/leads', { params: { page } })).data,
    placeholderData: keepPreviousData,
  });
  const create = useMutation({
    mutationFn: async () =>
      api.post('/agent/leads', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        country: form.country.trim(),
        interest: form.interest,
        message: form.message.trim() || undefined,
        consent: form.consent,
      }),
    onSuccess: () => {
      toast.success(t('px.leads.created'));
      setForm(EMPTY);
      setPage(1);
      void qc.invalidateQueries({ queryKey: ['agent-leads'] });
    },
    onError: (err) => {
      const code = errorCode(err) ?? '';
      const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
      const key = ['DUPLICATE_LEAD', 'AGENT_PAUSED'].includes(code) ? code : issue === 'INVALID_PHONE' ? issue : null;
      toast.error(key ? t(`px.leads.${key}`) : t('common.error'));
    },
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim().length >= 2 && form.phone.trim().length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) && form.country.trim().length >= 2 && form.consent;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid && !paused) create.mutate();
  };

  const field = (k: 'name' | 'phone' | 'email' | 'country', type: string, autoComplete: string, max: number) => (
    <div>
      <label className="label" htmlFor={`${uid}-${k}`}>
        {t(`px.leads.${k}`)}
      </label>
      <input id={`${uid}-${k}`} className="input" type={type} autoComplete={autoComplete} maxLength={max} required value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={paused} />
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Section title={t('px.leads.formTitle')} icon={UserPlus}>
        <p className="-mt-1 mb-4 text-sm text-muted">{t('px.leads.formIntro')}</p>
        {paused && <p className="mb-4 rounded-xl border border-warning-border bg-warning-bg px-3 py-2.5 text-sm text-warning-fg">{t('px.leads.AGENT_PAUSED')}</p>}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{field('name', 'text', 'off', 120)}</div>
          {field('phone', 'tel', 'off', 40)}
          {field('email', 'email', 'off', 200)}
          {field('country', 'text', 'off', 80)}
          <div>
            <label className="label" htmlFor={`${uid}-interest`}>
              {t('px.leads.interest')}
            </label>
            <select id={`${uid}-interest`} className="input" value={form.interest} onChange={(e) => set('interest', e.target.value as (typeof INTERESTS)[number])} disabled={paused}>
              {INTERESTS.map((i) => (
                <option key={i} value={i}>
                  {t(`px.leads.interests.${i}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor={`${uid}-msg`}>
              {t('px.leads.message')}
            </label>
            <textarea id={`${uid}-msg`} className="input min-h-24" maxLength={3000} value={form.message} onChange={(e) => set('message', e.target.value)} disabled={paused} />
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm text-ink sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} required disabled={paused} />
            <span>{t('px.leads.consent')}</span>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={create.isPending || !valid || paused}>
              {create.isPending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('px.leads.submit')}
            </button>
          </div>
        </form>
      </Section>

      <Section title={t('px.leads.listTitle')} icon={ListChecks}>
        {q.isLoading ? (
          <Loading />
        ) : q.isError || !q.data ? (
          <ErrorRetry onRetry={() => q.refetch()} />
        ) : q.data.items.length === 0 ? (
          <EmptyState compact illustration={<Handshake className="w-28" />} title={t('px.leads.empty')} />
        ) : (
          <>
            <ul className="space-y-2">
              {q.data.items.map((l) => (
                <li key={l.id} className="rounded-xl border border-line bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{l.name ?? '—'}</p>
                      <p className="truncate text-xs text-muted">{[l.phone, l.email].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <span className={clsx('badge shrink-0', STATUS_TONE[l.status])}>{t(`px.leads.statuses.${l.status}`)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>
                      {t('px.leads.created_at')}: {day(l.createdAt)}
                    </span>
                    {l.interest && <span>{l.interest}</span>}
                    <span className={clsx('inline-flex items-center gap-1', l.converted && 'font-semibold text-success-fg')}>
                      {l.converted && <CheckCircle2 className="size-3.5" aria-hidden />}
                      {t('px.leads.converted')}: {l.converted ? t('px.leads.yes') : t('px.leads.no')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Pager page={page} total={q.data.total} pageSize={q.data.pageSize} onPage={setPage} />
          </>
        )}
      </Section>
    </div>
  );
}
