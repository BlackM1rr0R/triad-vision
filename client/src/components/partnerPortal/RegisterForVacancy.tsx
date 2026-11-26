import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import i18n from '@/i18n';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { portalError, type PartnerClientRow } from './api';

/** Error text of the partner client pages first (partnerClients.errors), then the portal's generic ones. */
export const registerError = (code: string | undefined, err?: unknown) =>
  code && i18n.exists(`partnerClients.errors.${code}`) ? i18n.t(`partnerClients.errors.${code}`) : err ? portalError(err) : i18n.t('partnerPortal.common.error');

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', passportNumber: '', locale: 'az', clientAgreed: false };
const FINAL = ['APPROVED', 'REJECTED', 'CANCELLED'];

/**
 * "Register a client" for one vacancy: pick an own client (POST /partner/clients/:id/cases) or add a new one together
 * with the application (POST /partner/clients with vacancyId). The application then follows the normal case flow.
 */
export function RegisterForVacancyDialog({ vacancy, onClose }: { vacancy: { id: string; title: string } | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState(EMPTY);
  const clients = useQuery({
    queryKey: ['partner-portal', 'people', 'register-picker'],
    queryFn: async () => (await api.get<{ items: PartnerClientRow[] }>('/partner/clients')).data.items,
    enabled: !!vacancy,
  });
  // Only clients the partner registered (the server refuses others) and who have no running application.
  const choices = (clients.data ?? []).filter((c) => c.owned && !(c.latestCase && !FINAL.includes(c.latestCase.status)));
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const close = () => {
    setForm(EMPTY);
    setClientId('');
    onClose();
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!vacancy) return null;
      if (mode === 'existing') return (await api.post(`/partner/clients/${clientId}/cases`, { vacancyId: vacancy.id })).data as { caseError?: string | null };
      return (
        await api.post('/partner/clients', {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          passportNumber: form.passportNumber.trim() || null,
          locale: form.locale,
          vacancyId: vacancy.id,
          clientAgreed: true,
        })
      ).data as { caseError?: string | null };
    },
    onSuccess: async (data) => {
      if (data?.caseError) toast.warning(t('partnerClients.register.vacancyPartial', { reason: registerError(data.caseError) }));
      else toast.success(t('partnerClients.register.vacancyDone'));
      await qc.invalidateQueries({ queryKey: ['partner-portal'] });
      close();
    },
    onError: (err) => {
      const issue = (err as { response?: { data?: { issues?: { message?: string }[] } } }).response?.data?.issues?.[0]?.message;
      toast.error(registerError(issue ?? errorCode(err), err));
    },
  });
  const ready = mode === 'existing' ? !!clientId : form.clientAgreed;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) save.mutate();
  };
  return (
    <Modal open={!!vacancy} onClose={close} title={t('partnerClients.register.vacancyTitle', { title: vacancy?.title ?? '' })}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">{t('partnerClients.register.vacancyHint')}</p>
        <div className="flex gap-2" role="group">
          {(['existing', 'new'] as const).map((m) => (
            <button key={m} type="button" className={mode === m ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(m === 'existing' ? 'partnerClients.register.modeExisting' : 'partnerClients.register.modeNew')}
            </button>
          ))}
        </div>
        {mode === 'existing' ? (
          choices.length === 0 && !clients.isLoading ? (
            <p className="text-sm text-muted">{t('partnerClients.register.noClients')}</p>
          ) : (
            <label className="block">
              <span className="label">{t('partnerClients.register.pick')}</span>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" />
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </label>
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">{t('partnerClients.register.firstName')}</span>
              <input className="input" required maxLength={80} value={form.firstName} onChange={set('firstName')} />
            </label>
            <label className="block">
              <span className="label">{t('partnerClients.register.lastName')}</span>
              <input className="input" required maxLength={80} value={form.lastName} onChange={set('lastName')} />
            </label>
            <label className="block">
              <span className="label">{t('partnerClients.register.email')}</span>
              <input className="input" type="email" required maxLength={191} value={form.email} onChange={set('email')} />
            </label>
            <label className="block">
              <span className="label">{t('partnerClients.register.phone')}</span>
              <input className="input" type="tel" required maxLength={40} placeholder="+994" value={form.phone} onChange={set('phone')} />
            </label>
            <label className="block">
              <span className="label">{t('partnerClients.register.passport')}</span>
              <input className="input font-mono" maxLength={40} value={form.passportNumber} onChange={set('passportNumber')} />
            </label>
            <label className="block">
              <span className="label">{t('partnerClients.register.locale')}</span>
              <select className="input" value={form.locale} onChange={set('locale')}>
                <option value="az">Azərbaycan</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
            <label className="flex items-start gap-3 text-sm text-ink sm:col-span-2">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={form.clientAgreed} onChange={(e) => setForm((f) => ({ ...f, clientAgreed: e.target.checked }))} required />
              <span>{t('partnerClients.register.agreed')}</span>
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={save.isPending || !ready}>
            {save.isPending && <Spinner className="size-4" />} {t('partnerClients.register.submit')}
          </button>
          <button type="button" className="btn-ghost" onClick={close}>
            {t('partnerClients.register.cancel')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
