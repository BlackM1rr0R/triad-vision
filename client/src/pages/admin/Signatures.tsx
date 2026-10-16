import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSignature, Plus, Scale, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesSign } from '@/i18n/pagesSign';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';
import { NewSignatureRequest } from '@/components/esign/NewRequest';
import { RequestDetail } from '@/components/esign/RequestDetail';
import { RequestRows } from '@/components/esign/RequestList';
import { MySignaturesList, PortalSign } from '@/components/esign/MySignatures';
import type { RequestStatus, StaffRequest } from '@/components/esign/api';

registerCopy(pagesSign);

const STATUSES: RequestStatus[] = ['SENT', 'COMPLETED', 'DRAFT', 'DECLINED', 'EXPIRED', 'CANCELLED'];

interface ListResponse {
  items: StaffRequest[];
  total: number;
  page: number;
  pageSize: number;
  counts: Partial<Record<RequestStatus, number>>;
}

/** Admin → Signatures: every request with progress, filters, detail drawer and "New request". */
export default function AdminSignatures() {
  const { t } = useTranslation();
  const { signerId } = useParams();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const openId = params.get('open');

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(id);
  }, [q]);
  useEffect(() => setPage(1), [status, mine, debounced]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['esign', 'list', status, mine, debounced, page],
    queryFn: async () =>
      (await api.get<ListResponse>('/admin/signatures', { params: { status: status || undefined, mine: mine || undefined, q: debounced || undefined, page } })).data,
    placeholderData: keepPreviousData,
    enabled: !signerId,
  });

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: true });
  };

  // Staff counter-signing from the admin area.
  if (signerId) return <PortalSign backTo="/admin/signatures" />;

  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHead
        title={t('esign.admin.title')}
        subtitle={t('esign.admin.subtitle')}
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            {t('esign.admin.new')}
          </button>
        }
      />

      <div className="mb-6">
        <MySignaturesList linkBase="/admin/signatures/sign" title={t('esign.admin.awaitingMe')} compact />
      </div>

      <Panel bodyClassName="p-0 sm:p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:p-5">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            <Chip active={!status} onClick={() => setStatus('')} count={total}>
              {t('esign.admin.all')}
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s} active={status === s} onClick={() => setStatus(s)} count={data?.counts[s] ?? 0}>
                {t(`esign.status.${s}`)}
              </Chip>
            ))}
            <Chip active={mine} onClick={() => setMine((m) => !m)}>
              {t('esign.admin.mine')}
            </Chip>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('esign.admin.search')} aria-label={t('esign.admin.search')} />
          </div>
        </div>
        <div className="px-3 sm:px-4">
          {isLoading ? (
            <LoadingBlock />
          ) : error ? (
            <div className="p-4">
              <ErrorBlock error={error} onRetry={() => refetch()} />
            </div>
          ) : !data?.items.length ? (
            <EmptyState icon={FileSignature} title={t('esign.admin.empty')} />
          ) : (
            <RequestRows items={data.items} onOpen={open} />
          )}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-line p-3">
            <button type="button" className="btn-white btn-sm border border-line" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </button>
            <span className="text-xs text-muted tabular-nums">
              {page}/{pages}
            </span>
            <button type="button" className="btn-white btn-sm border border-line" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              →
            </button>
          </div>
        )}
      </Panel>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('esign.legal')}
      </p>

      <RequestDetail id={openId} onClose={() => open(null)} />
      <NewSignatureRequest open={creating} onClose={() => setCreating(false)} onCreated={(r) => open(r.id)} />
    </div>
  );
}
