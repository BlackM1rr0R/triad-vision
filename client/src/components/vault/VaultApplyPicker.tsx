import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Archive, Check, FileText, ImageIcon, X } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPortalExtras } from '@/i18n/pagesPortalExtras';
import { pagesVault } from '@/i18n/pagesVault';
import { Spinner } from '@/components/ui/Spinner';
import { isImageMime, VAULT_QUERY, type VaultDoc } from './api';
import { VaultModal } from './VaultModal';

registerCopy(pagesPortalExtras);
registerCopy(pagesVault); // vault.kinds.*

/**
 * "Choose from my vault" for a job application: several vault documents (not expired) are attached to the
 * application without uploading them again (server: POST /api/vacancies/:slug/apply { vaultIds }).
 */
export const VaultApplyPicker = ({ selected, onChange, max }: { selected: VaultDoc[]; onChange: (docs: VaultDoc[]) => void; max: number }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: VAULT_QUERY,
    queryFn: async () => (await api.get<{ documents: VaultDoc[] }>('/vault')).data,
    enabled: open,
    staleTime: 30_000,
  });
  const docs = q.data?.documents ?? [];
  const isOn = (id: string) => selected.some((d) => d.id === id);
  const toggle = (d: VaultDoc) => {
    if (isOn(d.id)) onChange(selected.filter((x) => x.id !== d.id));
    else if (selected.length < max) onChange([...selected, d]);
  };

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('px.apply.picked', { count: selected.length })}>
          {selected.map((d) => (
            <li key={d.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-sunken py-1 pr-1 pl-3 text-xs text-ink">
              <Archive className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{d.title}</span>
              <button type="button" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-card hover:text-danger" onClick={() => toggle(d)} aria-label={`${t('jobsArea.detail.docRemove')}: ${d.title}`}>
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn min-h-11 w-full border border-line text-sm text-ink hover:bg-sunken sm:w-auto" onClick={() => setOpen(true)} disabled={max <= 0 && selected.length === 0}>
        <Archive className="size-4 text-primary" aria-hidden /> {t('px.apply.fromVault')}
      </button>
      <VaultModal
        open={open}
        onClose={() => setOpen(false)}
        title={t('px.apply.pickTitle')}
        footer={
          <button type="button" className="btn-primary min-h-11" onClick={() => setOpen(false)}>
            <Check className="size-4" aria-hidden /> {t('px.apply.done')}
          </button>
        }
      >
        <p className="mb-3 text-sm text-muted">{t('px.apply.pickHint')}</p>
        {q.isLoading ? (
          <div className="grid place-items-center py-10 text-primary">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">{t('px.apply.none')}</p>
            <Link to="/account/vault" className="btn mt-3 border border-line text-sm text-ink hover:bg-sunken">
              <Archive className="size-4" aria-hidden /> {t('vault.title')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-1.5">
              {docs.map((d) => {
                const expired = d.expiry.status === 'expired';
                const on = isOn(d.id);
                const blocked = expired || (!on && selected.length >= max);
                return (
                  <li key={d.id}>
                    <label className={clsx('flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2', on ? 'border-primary bg-sunken' : 'border-line', blocked && 'cursor-not-allowed opacity-60')}>
                      <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={on} disabled={blocked} onChange={() => toggle(d)} />
                      {isImageMime(d.mimeType) ? <ImageIcon className="size-4 shrink-0 text-muted" aria-hidden /> : <FileText className="size-4 shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{d.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {t(`vault.kinds.${d.kind}`)} · {formatBytes(d.size)}
                        </span>
                      </span>
                      {expired && <span className="badge bg-danger-bg text-[11px] text-danger-fg">{t('px.apply.expired')}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            {selected.length >= max && <p className="mt-3 text-xs text-muted">{t('px.apply.max', { max: max })}</p>}
          </>
        )}
      </VaultModal>
    </div>
  );
};
