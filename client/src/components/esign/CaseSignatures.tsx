import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSignature, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSign } from '@/i18n/pagesSign';
import { Panel } from '@/components/admin/ui';
import { NewSignatureRequest } from './NewRequest';
import { RequestDetail } from './RequestDetail';
import { RequestRows } from './RequestList';
import type { StaffRequest } from './api';

registerCopy(pagesSign);

/** Signature requests of a case or a company, with "Send for signature" (admin case / company pages). */
export const SignaturesPanel = ({ caseId, companyId, contractAllowed = false }: { caseId?: string; companyId?: string; contractAllowed?: boolean }) => {
  const { t } = useTranslation();
  const [creating, setCreating] = useState<null | { contract: boolean }>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['esign', 'list', 'ctx', caseId ?? '', companyId ?? ''],
    queryFn: async () => (await api.get<{ items: StaffRequest[] }>('/admin/signatures', { params: { caseId, companyId, pageSize: 20 } })).data.items,
  });
  const items = data ?? [];

  return (
    <Panel
      title={t('esign.caseBox.title')}
      icon={FileSignature}
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setCreating({ contract: false })}>
          <Plus className="size-3.5" aria-hidden />
          {t('esign.admin.sendForSignature')}
        </button>
      }
    >
      {items.length ? <RequestRows items={items} onOpen={setOpenId} showCase={!caseId} /> : <p className="text-sm text-muted">{t('esign.caseBox.none')}</p>}
      {caseId && contractAllowed && !items.some((r) => r.isCaseContract && (r.status === 'SENT' || r.status === 'COMPLETED')) && (
        <button type="button" className="btn-primary btn-sm mt-4" onClick={() => setCreating({ contract: true })}>
          <FileSignature className="size-3.5" aria-hidden />
          {t('esign.admin.detail.caseContract')}: {t('esign.admin.sendForSignature')}
        </button>
      )}
      <NewSignatureRequest open={!!creating} onClose={() => setCreating(null)} caseId={caseId} companyId={companyId} contract={!!creating?.contract} onCreated={(r) => setOpenId(r.id)} />
      <RequestDetail id={openId} onClose={() => setOpenId(null)} />
    </Panel>
  );
};

/** Button that opens the e-signature form for the case contract (used inside the contract box). */
export const SendContractForSignature = ({ caseId, label, disabled = false, variant = 'primary' }: { caseId: string; label?: string; disabled?: boolean; variant?: 'primary' | 'ghost' }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={variant === 'primary' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => setOpen(true)} disabled={disabled}>
        <FileSignature className="size-3.5" aria-hidden />
        {label ?? t('esign.admin.sendForSignature')}
      </button>
      <NewSignatureRequest open={open} onClose={() => setOpen(false)} caseId={caseId} contract />
    </>
  );
};
