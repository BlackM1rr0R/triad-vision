import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import type { AdminAgent } from '../types';
import { TermsFields, type TermsValue } from './TermsFields';
import { fromUnits, useAgentToastError } from './shared';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', locale: 'az', region: '', company: '', code: '' };

export const CreateAgentDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toastError = useAgentToastError();
  const [f, setF] = useState(EMPTY);
  const [terms, setTerms] = useState<TermsValue>({ commissionType: 'FIXED', value: '', currency: 'EUR', payoutEvents: ['VISA_APPROVED'] });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const suggest = useMutation({
    mutationFn: async () => (await api.get<{ code: string }>('/admin/agents/suggest-code', { params: { firstName: f.firstName, lastName: f.lastName, region: f.region } })).data.code,
    onSuccess: (code) => setF((s) => ({ ...s, code })),
  });

  const create = useMutation({
    mutationFn: async () => {
      const value = terms.value.trim() ? fromUnits(terms.value) : 0;
      return (
        await api.post<{ agent: AdminAgent }>('/admin/agents', {
          firstName: f.firstName,
          lastName: f.lastName,
          email: f.email,
          phone: f.phone || null,
          locale: f.locale,
          region: f.region || null,
          company: f.company || null,
          ...(f.code.trim() ? { code: f.code.trim() } : {}),
          commissionType: terms.commissionType,
          commissionValue: Number.isNaN(value) ? -1 : value,
          currency: terms.currency,
          payoutEvents: terms.payoutEvents,
        })
      ).data.agent;
    },
    onSuccess: (agent) => {
      toast.success(t('agents.admin.create.created'));
      void qc.invalidateQueries({ queryKey: ['admin-agents'] });
      setF(EMPTY);
      onClose();
      navigate(`/admin/agents/${agent.id}`);
    },
    onError: toastError,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const input = (k: keyof typeof EMPTY, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label className="label" htmlFor={`agent-new-${k}`}>
        {label}
      </label>
      <input id={`agent-new-${k}`} className="input" value={f[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('agents.admin.create.title')}
      description={t('agents.admin.create.description')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            {t('agents.common.cancel')}
          </button>
          <button type="submit" form="agent-create-form" className="btn-primary btn-sm" disabled={create.isPending}>
            {create.isPending && <Spinner className="size-4" />} {t('agents.admin.create.submit')}
          </button>
        </>
      }
    >
      <form id="agent-create-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {input('firstName', t('agents.admin.create.firstName'), { required: true, maxLength: 80 })}
          {input('lastName', t('agents.admin.create.lastName'), { required: true, maxLength: 80 })}
          {input('email', t('agents.admin.create.email'), { required: true, type: 'email', maxLength: 200 })}
          {input('phone', t('agents.admin.create.phone'), { type: 'tel', maxLength: 40 })}
          {input('region', t('agents.admin.create.region'), { maxLength: 120 })}
          {input('company', t('agents.admin.create.company'), { maxLength: 160 })}
          <div>
            <label className="label" htmlFor="agent-new-locale">
              {t('agents.admin.create.locale')}
            </label>
            <select id="agent-new-locale" className="input" value={f.locale} onChange={set('locale')}>
              <option value="az">Azərbaycan</option>
              <option value="de">Deutsch</option>
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="agent-new-code">
              {t('agents.admin.create.code')}
            </label>
            <div className="flex gap-2">
              <input
                id="agent-new-code"
                className="input font-mono uppercase"
                value={f.code}
                onChange={(e) => setF((s) => ({ ...s, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') }))}
                maxLength={32}
                aria-describedby="agent-new-code-hint"
              />
              <button type="button" className="btn-secondary btn-sm shrink-0 border border-line" onClick={() => suggest.mutate()} disabled={suggest.isPending || !f.firstName.trim()}>
                <Wand2 className="size-3.5" aria-hidden /> {t('agents.admin.create.suggest')}
              </button>
            </div>
            <p id="agent-new-code-hint" className="mt-1 text-xs text-muted">
              {t('agents.admin.create.codeHint')}
            </p>
          </div>
        </div>
        <div className="border-t border-line pt-5">
          <p className="mb-3 text-sm font-semibold text-ink">{t('agents.admin.terms.title')}</p>
          <TermsFields value={terms} onChange={setTerms} />
        </div>
      </form>
    </Modal>
  );
};
