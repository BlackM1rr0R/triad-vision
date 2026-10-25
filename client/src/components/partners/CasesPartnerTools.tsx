import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Handshake, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { casePartner, useAssignPartner, usePartnerOptions } from './api';

/** Partner filter for the admin cases list ('' = all, 'none' = without partner). */
export const PartnerFilterSelect = ({ value, onChange }: { value: string; onChange: (v: string | null) => void }) => {
  const { t } = useTranslation();
  const { data: partners } = usePartnerOptions();
  return (
    <select
      aria-label={t('refPartners.field')}
      className="input min-h-10 sm:min-h-9 w-auto max-w-[14rem] py-2 pr-8 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t('refPartners.filterAll')}</option>
      <option value="none">{t('refPartners.filterNone')}</option>
      {(partners ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.active ? '' : ` (${t('refPartners.inactive')})`}
        </option>
      ))}
    </select>
  );
};

/** Small partner label for a case row / card. */
export const CasePartnerCell = ({ c, empty = '—' }: { c: object; empty?: string }) => {
  const p = casePartner(c);
  return p ? (
    <span className="inline-flex max-w-full items-center gap-1 text-xs text-ink/80">
      <Handshake className="size-3 shrink-0 text-primary" aria-hidden />
      <span className="truncate">{p.name}</span>
    </span>
  ) : (
    <span className="text-xs text-muted">{empty}</span>
  );
};

/** Row checkbox (stops the row click from opening the case). */
export const SelectBox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <input
    type="checkbox"
    aria-label={label}
    className="size-4 cursor-pointer accent-primary"
    checked={checked}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.checked)}
  />
);

/** Bar shown while cases are selected: assign (or clear) their partner in one go. */
export const BulkPartnerBar = ({ ids, onDone }: { ids: string[]; onDone: () => void }) => {
  const { t } = useTranslation();
  const { data: partners } = usePartnerOptions();
  const assign = useAssignPartner();
  const [target, setTarget] = useState('');
  if (!ids.length) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line-strong bg-sunken px-4 py-2.5 text-sm">
      <span className="font-semibold text-ink">{t('refPartners.selected', { count: ids.length })}</span>
      <span className="text-muted">·</span>
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted">{t('refPartners.assignTo')}</span>
        <select aria-label={t('refPartners.assignTo')} className="input min-h-9 w-auto py-1.5 pr-8 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{t('refPartners.none')}</option>
          {(partners ?? [])
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={assign.isPending}
        onClick={() =>
          assign.mutate(
            { caseIds: ids, partnerId: target || null },
            {
              onSuccess: (r) => {
                toast.success(t('refPartners.bulkDone', { count: r.updated }));
                onDone();
              },
            },
          )
        }
      >
        {assign.isPending ? <Spinner className="size-3.5" /> : <Handshake className="size-3.5" />} {t('refPartners.assignApply')}
      </button>
      <button type="button" className="btn-secondary btn-sm ml-auto" onClick={onDone}>
        <X className="size-3.5" /> {t('refPartners.clearSelection')}
      </button>
    </div>
  );
};
