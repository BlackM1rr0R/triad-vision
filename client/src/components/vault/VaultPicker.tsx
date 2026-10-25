import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Archive, FileText, ImageIcon } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { isImageMime, suggestionsQuery, vaultFileUrl, type ServerChecks, type VaultSuggestion } from './api';
import { ExpiryBadge } from './ExpiryBadge';
import { DocCheckBadge } from './DocCheckBadge';
import { VaultModal } from './VaultModal';
import { useVaultError } from './useVaultError';

/**
 * "Choose from my vault" next to the normal upload of a case requirement: lists vault documents of a
 * matching kind and copies the chosen one into the case (POST /api/vault/:id/use).
 */
export const VaultPicker = ({
  caseId,
  requirementId,
  onAdded,
  compact,
}: {
  caseId: string;
  requirementId: string;
  onAdded: (checks: ServerChecks | null) => void | Promise<unknown>;
  compact?: boolean;
}) => {
  const { t } = useTranslation();
  const onError = useVaultError();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: suggestionsQuery(caseId),
    queryFn: async () => (await api.get<{ stage: string | null; suggestions: VaultSuggestion[] }>('/vault/suggestions', { params: { caseId } })).data,
    enabled: open,
    staleTime: 30_000,
  });
  const docs = q.data?.suggestions.find((s) => s.requirementId === requirementId)?.documents ?? [];

  const pick = async (id: string) => {
    setBusy(id);
    try {
      const { data } = await api.post<{ checks: ServerChecks | null }>(`/vault/${id}/use`, { caseId, requirementId });
      toast.success(t('vault.fromVault.added'));
      setOpen(false);
      await qc.invalidateQueries({ queryKey: suggestionsQuery(caseId) });
      await onAdded(data.checks);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? 'btn min-h-10 border border-line px-3 text-sm text-ink hover:bg-sunken' : 'btn min-h-11 w-full border border-line text-sm text-ink hover:bg-sunken sm:w-auto'}
      >
        <Archive className="size-4 text-primary" aria-hidden />
        {t('vault.fromVault.button')}
      </button>
      <VaultModal open={open} onClose={() => setOpen(false)} title={t('vault.fromVault.title')} busy={!!busy}>
        {q.isLoading ? (
          <div className="grid place-items-center py-10 text-primary">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">{t('vault.fromVault.empty')}</p>
            <Link to="/account/vault" className="btn mt-3 border border-line text-sm text-ink hover:bg-sunken">
              <Archive className="size-4" aria-hidden />
              {t('vault.fromVault.openVault')}
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-3 py-2.5">
                <a href={vaultFileUrl(d.id)} target="_blank" rel="noreferrer" className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken">
                  {isImageMime(d.mimeType) ? <img src={vaultFileUrl(d.id)} alt="" className="size-full object-cover" loading="lazy" /> : <FileText className="size-5 text-muted" aria-hidden />}
                </a>
                <div className="min-w-0 flex-[1_1_10rem]">
                  <p className="truncate text-sm font-semibold text-ink">{d.title}</p>
                  <p className="truncate text-xs text-muted">
                    {t(`vault.kinds.${d.kind}`)} · {formatBytes(d.size)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <ExpiryBadge doc={d} />
                    <DocCheckBadge checks={d.checks} showOk={false} />
                  </div>
                </div>
                <button type="button" className="btn-primary min-h-10 shrink-0 text-sm" disabled={!!busy} onClick={() => pick(d.id)}>
                  {busy === d.id ? <Spinner className="size-4" /> : <ImageIcon className="size-4" aria-hidden />}
                  {t('vault.fromVault.pick')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </VaultModal>
    </>
  );
};

export default VaultPicker;
