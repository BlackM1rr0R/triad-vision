import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowRightLeft, ExternalLink, FolderOpen, History, Trash2, Vault } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOriginals } from '@/i18n/pagesOriginals';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Chip, EmptyState, ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { STATUSES, driveFolderHref, originalsKey, type Original, type OriginalStatus } from '@/components/originals/api';
import { EventDialog, SignActDialog, useOriginalError } from '@/components/originals/dialogs';
import { DaysChip, LabelMenu, StatusChip, TimelineDrawer, WhereCell } from '@/components/originals/parts';

registerCopy(pagesOriginals);

interface Staff {
  id: string;
  firstName: string;
  lastName: string;
}

/** /admin/originals — every physical original across all cases, with filters, movements, acts and labels. */
const Originals = () => {
  const { t } = useTranslation();
  usePageTitle(t('originals.page.title'));
  const { user } = useAuth();
  const isAdmin = hasMinRole(user?.role, 'ADMIN');
  const qc = useQueryClient();
  const onError = useOriginalError();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as OriginalStatus | '';
  const overdue = params.get('overdue') === '1';
  const staffId = params.get('staff') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [location, setLocation] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<Original[] | null>(null);
  const [signing, setSigning] = useState<string | null>(null);
  const openId = params.get('open');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const { data: staff } = useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => (await api.get<{ staff: Staff[] }>('/admin/users/staff')).data.staff,
    staleTime: 300_000,
  });
  const query = useQuery({
    queryKey: [...originalsKey, 'overview', status, overdue, staffId, q, location],
    queryFn: async () =>
      (
        await api.get<{ items: Original[]; counts: Partial<Record<OriginalStatus, number>> }>('/originals', {
          params: { status: status || undefined, overdue: overdue ? '1' : undefined, staff: staffId || undefined, q: q.trim() || undefined, location: location.trim() || undefined },
        })
      ).data,
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.items ?? [];
  const counts = query.data?.counts ?? {};
  const open = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId]);
  const { data: openFetched } = useQuery({
    queryKey: [...originalsKey, 'one', openId],
    queryFn: async () => (await api.get<{ original: Original }>(`/originals/${openId}`)).data.original,
    enabled: !!openId && !open && !query.isLoading,
  });
  const drawerOriginal = open ?? openFetched ?? null;

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/originals/${id}`),
    onSuccess: () => {
      toast.success(t('originals.saved'));
      void qc.invalidateQueries({ queryKey: originalsKey });
    },
    onError,
  });

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const bulkOk = selectedRows.length > 1 && new Set(selectedRows.map((r) => r.case.id)).size === 1 && new Set(selectedRows.map((r) => r.status)).size === 1;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <PageHead title={t('originals.page.title')} subtitle={t('originals.page.subtitle')} />

      <div className="card mb-4 space-y-3 p-4">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('originals.cols.status')}>
          <Chip active={!status && !overdue} onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {t('originals.page.allStatuses')}
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s]} onClick={() => setParam('status', status === s ? '' : s)}>
              {t(`originals.status.${s}`)}
            </Chip>
          ))}
          <Chip active={overdue} onClick={() => setParam('overdue', overdue ? '' : '1')}>
            {t('originals.page.overdueOnly')}
          </Chip>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <input className="input" type="search" value={q} placeholder={t('originals.page.search')} aria-label={t('originals.page.search')} onChange={(e) => setQ(e.target.value)} />
          <input className="input" value={location} placeholder={t('originals.page.location')} aria-label={t('originals.page.location')} onChange={(e) => setLocation(e.target.value)} />
          <select className="input" value={staffId} aria-label={t('originals.page.staff')} onChange={(e) => setParam('staff', e.target.value)}>
            <option value="">{t('originals.page.allStaff')}</option>
            <option value="none">{t('originals.page.unassigned')}</option>
            {(staff ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </div>
        {selectedRows.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="badge bg-surface text-navy-900">{t('originals.page.count', { count: selectedRows.length })}</span>
            <button type="button" className="btn-primary btn-sm" disabled={!bulkOk} onClick={() => setMoving(selectedRows)}>
              <ArrowRightLeft className="size-4" aria-hidden /> {t('originals.event.title')}
            </button>
            {!bulkOk && <span className="text-xs text-muted">{t('originals.errors.ORIGINALS_OF_DIFFERENT_CASES')}</span>}
          </div>
        )}
      </div>

      {query.isLoading ? (
        <LoadingBlock />
      ) : query.error ? (
        <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState icon={Vault} title={t('originals.page.empty')}>
            {t('originals.page.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        <div className={clsx('card overflow-x-auto', query.isFetching && 'opacity-70')}>
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line bg-surface/60 text-xs text-muted">
              <tr>
                <th scope="col" className="w-8 px-3 py-2.5">
                  <span className="sr-only">✓</span>
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('originals.cols.client')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('originals.cols.original')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('originals.cols.status')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('originals.cols.location')}</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">{t('originals.cols.days')}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">{t('originals.cols.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={clsx('hover:bg-surface/40', r.overdue && 'bg-red-50/40')}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={r.title} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link to={`/admin/cases/${r.case.id}`} className="font-medium text-navy-900 hover:underline">
                      {r.case.client.name}
                    </Link>
                    <span className="block font-mono text-[11px] text-muted">{r.case.number}</span>
                    {r.case.staff && <span className="block text-[11px] text-muted">{r.case.staff.name}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block text-navy-900">{r.title}</span>
                    <span className="text-[11px] text-muted">{t(`originals.kinds.${r.kind}`)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <WhereCell o={r} />
                  </td>
                  <td className="px-3 py-2.5">
                    <DaysChip o={r} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" className="btn-white btn-sm border border-line" onClick={() => setMoving([r])}>
                        <ArrowRightLeft className="size-4" aria-hidden />
                        <span className="hidden lg:inline">{t('originals.event.title')}</span>
                      </button>
                      <button type="button" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" title={t('originals.timelineOpen')} aria-label={t('originals.timelineOpen')} onClick={() => setParam('open', r.id)}>
                        <History className="size-4" aria-hidden />
                      </button>
                      <LabelMenu caseId={r.case.id} compact />
                      {r.case.driveFolderId && (
                        <Link to={driveFolderHref(r.case.driveFolderId)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" title="Drive" aria-label="Drive">
                          <FolderOpen className="size-4" aria-hidden />
                        </Link>
                      )}
                      <Link to={`/admin/cases/${r.case.id}`} className="grid size-9 place-items-center rounded-lg text-brand-600 hover:bg-brand-50" title={t('originals.page.openCase')} aria-label={t('originals.page.openCase')}>
                        <ExternalLink className="size-4" aria-hidden />
                      </Link>
                      {isAdmin && (
                        <button
                          type="button"
                          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger"
                          title={t('originals.delete')}
                          aria-label={t('originals.delete')}
                          onClick={() => window.confirm(t('originals.deleteConfirm')) && remove.mutate(r.id)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {moving && <EventDialog key={moving.map((m) => m.id).join()} originals={moving} open onClose={() => { setMoving(null); setSelected(new Set()); }} />}
      <TimelineDrawer original={drawerOriginal} open={!!openId} onClose={() => setParam('open', '')} onSign={setSigning} />
      <SignActDialog key={signing ?? 'none'} eventId={signing} open={!!signing} onClose={() => setSigning(null)} />
    </div>
  );
};

export default Originals;
