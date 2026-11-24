import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Bug, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesBrowserErrors } from '@/i18n/pagesBrowserErrors';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, DefRow, EmptyState, ErrorBlock, LoadingBlock, PageHead, Panel } from '@/components/admin/ui';

registerCopy(pagesBrowserErrors);

const STATUSES = ['NEW', 'RESOLVED', 'IGNORED'] as const;
type Status = (typeof STATUSES)[number];

interface Group {
  id: string;
  kind: string;
  message: string;
  topFrame: string;
  sampleStack: string | null;
  route: string;
  release: string | null;
  role: string | null;
  userAgent: string | null;
  count: number;
  status: Status;
  firstSeenAt: string;
  lastSeenAt: string;
}
interface ListResponse {
  items: Group[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<Status, number>;
  retentionDays: number;
}

const when = (iso: string, lng: string) => new Date(iso).toLocaleString(lng, { dateStyle: 'medium', timeStyle: 'short' });

const Row = ({ g, onStatus, busy }: { g: Group; onStatus: (id: string, s: Status) => void; busy: boolean }) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-72">
          <p className="break-words text-sm font-semibold text-ink">{g.message}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="badge bg-sunken text-ink/80">{t(`browserErrors.kind.${g.kind}`, { defaultValue: g.kind })}</span>
            <span className="code-id break-all">{g.route}</span>
            <span>
              {t('browserErrors.lastSeen')}: {when(g.lastSeenAt, i18n.language)}
            </span>
          </p>
        </div>
        <span className="code-id rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold tabular-nums text-ink" title={t('browserErrors.count')}>
          {g.count}×
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {g.status !== 'RESOLVED' && (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => onStatus(g.id, 'RESOLVED')}>
              {t('browserErrors.resolve')}
            </button>
          )}
          {g.status !== 'IGNORED' && (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => onStatus(g.id, 'IGNORED')}>
              {t('browserErrors.ignore')}
            </button>
          )}
          {g.status !== 'NEW' && (
            <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => onStatus(g.id, 'NEW')}>
              {t('browserErrors.reopen')}
            </button>
          )}
          <button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
            {open ? t('browserErrors.showLess') : t('browserErrors.showMore')}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3">
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <DefRow label={t('browserErrors.firstSeen')}>{when(g.firstSeenAt, i18n.language)}</DefRow>
            <DefRow label={t('browserErrors.release')}>{g.release ?? '—'}</DefRow>
            <DefRow label={t('browserErrors.role')}>{g.role ?? t('browserErrors.anonymous')}</DefRow>
            <DefRow label={t('browserErrors.browser')}>
              <span className="break-all">{g.userAgent ?? '—'}</span>
            </DefRow>
          </dl>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">{t('browserErrors.stack')}</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-sunken p-3 text-xs whitespace-pre-wrap break-words text-ink">{g.sampleStack || t('browserErrors.noStack')}</pre>
          </div>
        </div>
      )}
    </li>
  );
};

/** /admin/browser-errors (ADMIN+): browser errors grouped by fingerprint, handled with resolved / ignored. */
const BrowserErrors = () => {
  const { t } = useTranslation();
  usePageTitle(t('browserErrors.title'));
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | ''>('NEW');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['browser-errors', 'list', status, q, page],
    queryFn: async () => (await api.get<ListResponse>('/admin/browser-errors', { params: { status: status || undefined, q: q.trim() || undefined, page } })).data,
    placeholderData: keepPreviousData,
  });
  const patch = useMutation({
    mutationFn: async ({ id, s }: { id: string; s: Status }) => (await api.patch(`/admin/browser-errors/${id}`, { status: s })).data,
    onSuccess: () => {
      toast.success(t('browserErrors.saved'));
      void qc.invalidateQueries({ queryKey: ['browser-errors'] });
    },
    onError: () => toast.error(t('browserErrors.error')),
  });

  const d = list.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return (
    <div className="space-y-5">
      <PageHead title={t('browserErrors.title')} subtitle={t('browserErrors.subtitle', { days: d?.retentionDays ?? 30 })} />
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={status === ''} onClick={() => { setStatus(''); setPage(1); }}>
          {t('admin.common.all', { defaultValue: 'All' })}
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s} active={status === s} count={d?.counts[s]} onClick={() => { setStatus(s); setPage(1); }}>
            {t(`browserErrors.status.${s}`)}
          </Chip>
        ))}
        <label className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className={clsx('input w-full pl-9')} value={q} placeholder={t('browserErrors.search')} aria-label={t('browserErrors.search')} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </label>
      </div>
      {list.isLoading ? (
        <LoadingBlock />
      ) : list.error || !d ? (
        <ErrorBlock error={list.error} onRetry={() => void list.refetch()} />
      ) : d.items.length === 0 ? (
        <EmptyState icon={Bug} title={t('browserErrors.empty')} />
      ) : (
        <Panel bodyClassName="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {d.items.map((g) => (
              <Row key={g.id} g={g} busy={patch.isPending} onStatus={(id, s) => patch.mutate({ id, s })} />
            ))}
          </ul>
        </Panel>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>
          <span className="tabular-nums text-muted">
            {page} / {pages}
          </span>
          <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default BrowserErrors;
