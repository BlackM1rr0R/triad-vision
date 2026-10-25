import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CircleUser, Lock } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Section, type AgentMe } from '@/components/agents/portal';
import { agentError } from '@/components/agents/types';

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold text-muted">{label}</dt>
    <dd className="mt-0.5 truncate text-sm font-medium text-ink">{value || '—'}</dd>
  </div>
);

export default function AgentProfilePage({ me }: { me: AgentMe }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [phone, setPhone] = useState(me.user.phone ?? '');
  const [iban, setIban] = useState(me.agent.iban ?? '');
  const save = useMutation({
    mutationFn: async () => (await api.patch<AgentMe>('/agent/me', { phone: phone.trim() || null, iban: iban.trim() || null })).data,
    onSuccess: (data) => {
      qc.setQueryData(['agent-me'], data);
      setIban(data.agent.iban ?? '');
      toast.success(t('agents.common.saved'));
    },
    onError: (err) => {
      const code = errorCode(err);
      const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
      toast.error(agentError(t, issue && issue.startsWith('INVALID_') ? issue : code));
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Section title={t('agents.profile.title')} icon={CircleUser}>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('agents.profile.name')} value={`${me.user.firstName} ${me.user.lastName}`} />
        <Field label={t('agents.profile.email')} value={me.user.email} />
        <Field label={t('agents.profile.code')} value={me.agent.code} />
        <Field label={t('agents.profile.region')} value={me.agent.region ?? ''} />
      </dl>
      <p className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Lock className="size-3.5" aria-hidden /> {t('agents.profile.readOnly')}
      </p>
      <form onSubmit={submit} className="mt-6 grid max-w-2xl gap-4 border-t border-line pt-6 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="agent-phone">
            {t('agents.profile.phone')}
          </label>
          <input id="agent-phone" className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
        </div>
        <div>
          <label className="label" htmlFor="agent-iban">
            {t('agents.profile.iban')}
          </label>
          <input id="agent-iban" className="input font-mono uppercase" value={iban} onChange={(e) => setIban(e.target.value)} maxLength={64} aria-describedby="agent-iban-hint" />
          <p id="agent-iban-hint" className="mt-1 text-xs text-muted">
            {t('agents.profile.ibanHint')}
          </p>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4" />} {t('agents.common.save')}
          </button>
        </div>
      </form>
    </Section>
  );
}
