import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { fromUnits, useAgentToastError } from './shared';

interface AgentOption {
  id: string;
  code: string;
  status: string;
  currency: string;
  user: { firstName: string; lastName: string };
}

/** Bonus / correction commission. With `agentId` the agent is fixed; `clients` offers the agent's referrals. */
export const ManualCommissionDialog = ({
  open,
  onClose,
  agentId,
  clients = [],
  fixedCurrency,
}: {
  open: boolean;
  onClose: () => void;
  agentId?: string;
  clients?: { id: string; label: string; caseId?: string | null }[];
  fixedCurrency?: string;
}) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toastError = useAgentToastError();
  const [agent, setAgent] = useState(agentId ?? '');
  const [client, setClient] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const options = useQuery({
    queryKey: ['admin-agents', 'options'],
    queryFn: async () => (await api.get<{ items: AgentOption[] }>('/admin/agents/options')).data.items,
    enabled: open && !agentId,
  });
  const currency = fixedCurrency ?? options.data?.find((o) => o.id === agent)?.currency ?? 'EUR';
  const cents = fromUnits(amount);

  const save = useMutation({
    mutationFn: () => {
      const c = clients.find((x) => x.id === client);
      return api.post('/admin/agents/commissions/manual', { agentId: agentId ?? agent, clientId: client || null, caseId: c?.caseId ?? null, amountCents: cents, note: note.trim() });
    },
    onSuccess: () => {
      toast.success(t('agents.admin.com.manualAdded'));
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setAmount('');
      setNote('');
      setClient('');
      onClose();
    },
    onError: toastError,
  });
  const valid = (agentId || agent) && Number.isFinite(cents) && cents !== 0 && note.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('agents.admin.com.manual')}
      description={t('agents.admin.com.manualText')}
      footer={
        <>
          <button type="button" className="btn-white btn-sm border border-line" onClick={onClose}>
            {t('agents.common.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Spinner className="size-4" />} {t('agents.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!agentId && (
          <div>
            <label className="label" htmlFor="manual-agent">
              {t('agents.admin.com.agent')}
            </label>
            <select id="manual-agent" className="input" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">—</option>
              {options.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.user.firstName} {o.user.lastName} · {o.code}
                </option>
              ))}
            </select>
          </div>
        )}
        {clients.length > 0 && (
          <div>
            <label className="label" htmlFor="manual-client">
              {t('agents.admin.com.client')}
            </label>
            <select id="manual-client" className="input" value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="manual-amount">
            {t('agents.admin.com.amount')} ({currency})
          </label>
          <input id="manual-amount" className="input tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50" />
        </div>
        <div>
          <label className="label" htmlFor="manual-note">
            {t('agents.admin.com.note')}
          </label>
          <input id="manual-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} required />
        </div>
      </div>
    </Modal>
  );
};
