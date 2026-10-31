import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarRange, FileSignature } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import i18n from '@/i18n';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/admin/labels';
import { PARTNERS_KEY, partnerError } from '../api';
import { ContractsPanel } from '@/components/partnerRecords/ContractsPanel';
import { ContactsPanel } from '@/components/partnerRecords/ContactsPanel';
import { ActivityTimeline } from '@/components/partnerRecords/ActivityTimeline';
import { useContracts } from '@/components/partnerRecords/api';
import { PARTNER_STATS_KEY, type PartnerStats } from './types';

/**
 * Tabs backed by the shared partner-records components (contracts, contact persons, timeline) of
 * components/partnerRecords, used with owner={{ referralPartnerId }}.
 */

/** The old profile dates (contractStart / contractEnd) → one PartnerContract ("müqavilə kimi saxla"). */
export const LegacyContractCard = ({ partnerId, legacy }: { partnerId: string; legacy: PartnerStats['legacyContract'] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const convert = useMutation({
    mutationFn: async () => (await api.post(`/admin/partners/${partnerId}/legacy-contract`, {})).data,
    onSuccess: async () => {
      toast.success(t('partnerHub.legacy.converted'));
      await Promise.all([qc.invalidateQueries({ queryKey: PARTNERS_KEY }), qc.invalidateQueries({ queryKey: ['partner-records'] })]);
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code && i18n.exists(`partnerHub.errors.${code}`)) toast.error(i18n.t(`partnerHub.errors.${code}`));
      else partnerError(err);
    },
  });
  if (!legacy) return null;
  const range = [legacy.start && fmtDate(legacy.start), legacy.end && fmtDate(legacy.end)].filter(Boolean).join(' – ');
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-bg/40 p-4 sm:flex-row sm:items-center">
      <CalendarRange className="size-5 shrink-0 text-warning-fg" aria-hidden />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-ink">{t('partnerHub.legacy.title')}</h3>
        <p className="mt-0.5 text-xs text-ink/80">{t('partnerHub.legacy.text', { range })}</p>
      </div>
      <button type="button" className="btn-primary btn-sm shrink-0 self-start sm:self-center" onClick={() => convert.mutate()} disabled={convert.isPending}>
        {convert.isPending ? <Spinner className="size-3.5" /> : <FileSignature className="size-3.5" aria-hidden />} {t('partnerHub.legacy.convert')}
      </button>
    </section>
  );
};

/** "Müqavilələr": the legacy dates card and the shared contracts panel; the header (status, days left) follows its changes. */
export const ContractsTab = ({ partnerId, legacy, onFillData }: { partnerId: string; legacy: PartnerStats['legacyContract']; onFillData?: () => void }) => {
  const qc = useQueryClient();
  const contracts = useContracts({ referralPartnerId: partnerId });
  const updatedAt = contracts.dataUpdatedAt;
  useEffect(() => {
    if (updatedAt) void qc.invalidateQueries({ queryKey: PARTNER_STATS_KEY(partnerId) });
  }, [updatedAt, partnerId, qc]);
  return (
    <div className="space-y-4">
      <LegacyContractCard partnerId={partnerId} legacy={legacy} />
      <ContractsPanel owner={{ referralPartnerId: partnerId }} onFillData={onFillData} />
    </div>
  );
};

/** "Əlaqə şəxsləri": the shared contact persons panel (primary contact, add / edit / delete). */
export const ContactsTab = ({ partnerId }: { partnerId: string }) => <ContactsPanel owner={{ referralPartnerId: partnerId }} />;

/** "Tarixçə": notes, calls, meetings and the audited field changes (shared timeline). */
export const HistoryTab = ({ partnerId }: { partnerId: string }) => <ActivityTimeline owner={{ referralPartnerId: partnerId }} />;
