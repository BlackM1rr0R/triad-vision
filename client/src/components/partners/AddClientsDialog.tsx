import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import { statusLabel } from '@/components/admin/labels';
import { STATUS_TONE } from '@/lib/caseStatus';
import type { CaseStatus } from '@/lib/types';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PARTNERS_KEY, useAssignPartner, type PartnerQuota } from './api';
import { QuotaMeter } from './QuotaMeter';

interface AssignableCase {
  id: string;
  number: string;
  status: CaseStatus;
  client: { id: string; firstName: string; lastName: string };
  partner: { id: string; name: string } | null;
}

interface AssignableResponse {
  items: AssignableCase[];
  total: number;
  /** Applications already linked to this partner (not in `items`). */
  linkedCases: number;
  quota: PartnerQuota;
}

/**
 * "Add clients" to a referral partner: search applications and link the selected ones (their drive folders
 * move into the partner folder). Applications already linked to this partner are left out by the server
 * (GET /admin/partners/:id/assignable-cases) and once more here, so adding again never shows them.
 */
export const AddClientsDialog = ({ partner, onClose, onDone }: { partner: { id: string; name: string } | null; onClose: () => void; onDone?: (count: number) => void }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(h);
  }, [q]);
  useEffect(() => {
    if (partner) {
      setQ('');
      setDebounced('');
      setPicked(new Set());
    }
  }, [partner]);
  const list = useQuery({
    queryKey: [...PARTNERS_KEY, 'assignable', partner?.id, debounced],
    queryFn: async () => (await api.get<AssignableResponse>(`/admin/partners/${partner!.id}/assignable-cases`, { params: { search: debounced || undefined } })).data,
    enabled: !!partner,
    placeholderData: keepPreviousData,
  });
  const assign = useAssignPartner();
  // Client-side guard as well: never offer an application that already belongs to this partner.
  const items = (list.data?.items ?? []).filter((c) => c.partner?.id !== partner?.id);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Modal
      open={!!partner}
      onClose={() => !assign.isPending && onClose()}
      busy={assign.isPending}
      size="md"
      title={t('partnerQuota.add.title', { name: partner?.name ?? '' })}
      description={t('partnerQuota.add.hint')}
      footer={
        <>
          <span className="mr-auto text-xs text-muted" aria-live="polite">
            {t('partnerQuota.add.selected', { count: picked.size })}
          </span>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={assign.isPending}>
            {t('partnerQuota.add.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={!picked.size || assign.isPending}
            onClick={() =>
              partner &&
              assign.mutate(
                { caseIds: [...picked], partnerId: partner.id },
                {
                  onSuccess: (r) => {
                    toast.success(t('partnerQuota.add.done', { count: r.updated }));
                    onDone?.(r.updated);
                    onClose();
                  },
                },
              )
            }
          >
            {assign.isPending && <Spinner className="size-3.5" />} {t('partnerQuota.add.submit')}
          </button>
        </>
      }
    >
      {list.data && (
        <div className="mb-3 space-y-2 rounded-lg bg-sunken/60 px-3 py-2">
          <p className="text-xs font-medium text-ink">{t('partnerQuota.add.alreadyLinked', { count: list.data.linkedCases })}</p>
          <QuotaMeter quota={list.data.quota} />
        </div>
      )}
      <label className="relative mb-3 block">
        <span className="sr-only">{t('partnerQuota.add.search')}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('partnerQuota.add.search')} className="input !pl-9" data-autofocus />
      </label>
      <ul className="max-h-80 min-h-32 overflow-y-auto rounded-xl border border-line" aria-busy={list.isFetching || undefined}>
        {list.isLoading ? (
          <li className="grid place-items-center py-8">
            <Spinner />
          </li>
        ) : !items.length ? (
          <li className="px-3 py-6 text-center text-xs text-muted">{t('partnerQuota.add.empty')}</li>
        ) : (
          items.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface">
                <input type="checkbox" className="size-4 accent-brand-600" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">
                    {c.client.firstName} {c.client.lastName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    <span className="code-id">{c.number}</span>
                    {c.partner ? ` · ${t('partnerQuota.add.otherPartner', { name: c.partner.name })}` : ''}
                  </span>
                </span>
                <span className={clsx('shrink-0 rounded px-1.5 py-px text-[10px] font-semibold', STATUS_TONE[c.status])}>{statusLabel(c.status)}</span>
              </label>
            </li>
          ))
        )}
      </ul>
      {list.data && list.data.total > list.data.items.length && <p className="mt-2 text-xs text-muted">{t('partnerQuota.add.more', { shown: list.data.items.length, total: list.data.total })}</p>}
    </Modal>
  );
};
