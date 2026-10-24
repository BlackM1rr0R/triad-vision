import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Switch } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { acctErrText } from './api';

interface EInvoice {
  leitwegId: string;
  buyerReference: string;
  email: string;
  attachXml: boolean;
}

/**
 * E-Rechnung data of a company (server lib/accounting/eInvoice.ts): Leitweg-ID for public buyers (BT-10), the
 * buyer's reference, the electronic address and whether the XRechnung XML goes with the invoice e-mail.
 */
export function EInvoiceDialog({ company, onClose }: { company: { id: string; name: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['admin-invoices', 'e-invoice', company.id],
    queryFn: async () => (await api.get<{ eInvoice: EInvoice }>(`/admin/invoices/companies/${company.id}/e-invoice`)).data.eInvoice,
  });
  const [form, setForm] = useState<EInvoice>({ leitwegId: '', buyerReference: '', email: '', attachXml: false });
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => (await api.put(`/admin/invoices/companies/${company.id}/e-invoice`, form)).data,
    onSuccess: () => {
      toast.success(t('acct.saved'));
      onClose();
    },
    onError: (e) => toast.error(acctErrText(e)),
  });
  const set = (patch: Partial<EInvoice>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={`${t('acct.xr.companyTitle')} · ${company.name}`}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={save.isPending}>
            {t('acct.cancel')}
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => save.mutate()} disabled={save.isPending || q.isLoading}>
            {save.isPending && <Spinner className="size-3.5" />}
            {t('acct.save')}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('acct.xr.companyText')}</p>
      <div className="grid gap-4">
        <div>
          <label className="label" htmlFor="ei-leitweg">
            {t('acct.xr.leitwegId')}
          </label>
          <input id="ei-leitweg" className="input font-mono" placeholder="991-12345-67" maxLength={46} value={form.leitwegId} onChange={(e) => set({ leitwegId: e.target.value })} />
          <p className="mt-1 text-[11px] text-muted">{t('acct.xr.leitwegHint')}</p>
        </div>
        <div>
          <label className="label" htmlFor="ei-ref">
            {t('acct.xr.buyerReference')}
          </label>
          <input id="ei-ref" className="input" maxLength={100} value={form.buyerReference} onChange={(e) => set({ buyerReference: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ei-email">
            {t('acct.xr.email')}
          </label>
          <input id="ei-email" type="email" className="input" maxLength={190} value={form.email} onChange={(e) => set({ email: e.target.value })} />
          <p className="mt-1 text-[11px] text-muted">{t('acct.xr.emailHint')}</p>
        </div>
        <Switch checked={form.attachXml} onChange={(v) => set({ attachXml: v })} label={t('acct.xr.attachXml')} />
        <p className="text-[11px] text-muted">{t('acct.xr.zugferdNote')}</p>
      </div>
    </Modal>
  );
}
