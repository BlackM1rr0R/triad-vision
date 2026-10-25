import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Handshake } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { casePartner, useAssignPartner, usePartnerOptions } from './api';

/** Compact "Partnyor" select in the admin case header: who brought this client. */
export const CasePartnerSelect = ({ c }: { c: { id: string } }) => {
  const { t } = useTranslation();
  const current = casePartner(c);
  const { data: partners } = usePartnerOptions();
  const assign = useAssignPartner();
  // Inactive partners stay selectable only when already linked.
  const options = (partners ?? []).filter((p) => p.active || p.id === current?.id);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <dt className="sr-only">{t('refPartners.field')}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        {current ? (
          <Link to={`/admin/partners/${current.id}`} title={t('refPartners.field')} className="text-link hover:text-link">
            <Handshake className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <Handshake className="size-3.5 text-muted" aria-hidden />
        )}
        <select
          aria-label={t('refPartners.field')}
          className="input min-h-8 w-auto max-w-[12rem] py-1 pr-7 pl-2 text-xs"
          value={current?.id ?? ''}
          disabled={assign.isPending || !partners}
          onChange={(e) =>
            assign.mutate(
              { caseIds: [c.id], partnerId: e.target.value || null },
              { onSuccess: () => toast.success(t('refPartners.assigned')) },
            )
          }
        >
          <option value="">{t('refPartners.none')}</option>
          {current && !options.some((p) => p.id === current.id) && <option value={current.id}>{current.name}</option>}
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {assign.isPending && <Spinner className="size-3.5 text-primary" />}
      </dd>
    </div>
  );
};
